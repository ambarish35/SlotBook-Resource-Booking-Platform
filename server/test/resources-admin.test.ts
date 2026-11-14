import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { MAX_DESCRIPTION_LENGTH, MAX_LOCATION_LENGTH, MAX_NAME_LENGTH, MAX_TAG_LENGTH, MAX_TAGS, Resource, type ResourceType } from '../src/models/Resource.js';
import { createUser } from '../src/services/auth.js';
import { TEST_SESSION, sessionCookie, startTestDatabase } from './helpers.js';

/** M3: creating and editing resources, and the permissions around it (PLAN.md §6, §7, V4). */

const app = createApp(TEST_SESSION);

let database: Awaited<ReturnType<typeof startTestDatabase>>;
let member: string; // Cookie header values
let admin: string;

async function signIn(role: 'member' | 'admin'): Promise<string> {
  const email = `${role}@example.com`;
  const password = 'a long enough password';
  await createUser({ name: `Test ${role}`, email, password, role });
  return sessionCookie(await request(app).post('/api/auth/login').send({ email, password }));
}

/** A resource straight into the database, bypassing the API. */
function make(name: string, type: ResourceType = 'room', extra: Record<string, unknown> = {}) {
  return Resource.create({ name, type, location: 'Block A, 1st floor', capacity: type === 'room' ? 6 : null, ...extra });
}

const validRoom = { name: 'Room 204', type: 'room', location: 'Block B, 2nd floor', capacity: 6 };
const validEquipment = { name: 'Projector 3', type: 'equipment', location: 'IT desk' };

const create = (body: unknown, cookie = admin) => request(app).post('/api/resources').set('Cookie', cookie).send(body as object);
const patch = (id: string, body: unknown, cookie = admin) =>
  request(app).patch(`/api/resources/${id}`).set('Cookie', cookie).send(body as object);
const fieldsOf = (res: request.Response): Record<string, string> => res.body.error.details.fields;

beforeAll(async () => {
  database = await startTestDatabase();
  member = await signIn('member');
  admin = await signIn('admin');
});

afterAll(async () => {
  await database.stop();
});

beforeEach(async () => {
  await Resource.deleteMany({});
});

describe('POST /api/resources', () => {
  describe('who may call it', () => {
    it('answers 401 UNAUTHENTICATED when signed out, and creates nothing', async () => {
      const res = await request(app).post('/api/resources').send(validRoom);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(await Resource.countDocuments()).toBe(0);
    });

    it('answers 403 FORBIDDEN to a member with a valid body, and creates nothing', async () => {
      const res = await create(validRoom, member);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: { code: 'FORBIDDEN', message: 'Only admins can do this.' } });
      expect(await Resource.countDocuments()).toBe(0);
    });

    it('answers 403, not 400, to a member with a well-formed but invalid JSON body: the role is checked first', async () => {
      for (const body of [{}, { name: '' }, { name: 5, type: 'lab', capacity: 'x' }, []]) {
        const res = await request(app).post('/api/resources').set('Cookie', member).set('Content-Type', 'application/json').send(JSON.stringify(body));
        expect(res.status, JSON.stringify(body)).toBe(403);
      }
    });

    it('lets the body parser reject text that is not JSON before anyone is checked: 400, and nothing changes', async () => {
      // express.json() runs for the whole API ahead of the routes, so unparseable JSON is a 400 even for a
      // signed-out caller or a member. It reveals nothing and writes nothing; PLAN.md §6 records the order.
      for (const cookie of [undefined, member]) {
        const req = request(app).post('/api/resources').set('Content-Type', 'application/json');
        if (cookie) req.set('Cookie', cookie);
        const res = await req.send('{"name": ');
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
      expect(await Resource.countDocuments()).toBe(0);
    });

    it('rejects a tampered session cookie', async () => {
      const res = await create(validRoom, `${member}x`);
      expect(res.status).toBe(401);
      expect(await Resource.countDocuments()).toBe(0);
    });
  });

  describe('creating', () => {
    it('creates a room: 201 with the public shape, active, and stored', async () => {
      const res = await create({ ...validRoom, description: 'Fits six.', tags: ['Whiteboard'] });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f]{24}$/),
        name: 'Room 204',
        type: 'room',
        location: 'Block B, 2nd floor',
        capacity: 6,
        description: 'Fits six.',
        tags: ['Whiteboard'],
        isActive: true,
      });
      const stored = await Resource.findById(res.body.id);
      expect(stored).toMatchObject({ name: 'Room 204', capacity: 6, isActive: true });
    });

    it('creates equipment with no capacity, even if one is sent', async () => {
      const plain = await create(validEquipment);
      expect(plain.status).toBe(201);
      expect(plain.body).toMatchObject({ type: 'equipment', capacity: null });

      const withCapacity = await create({ ...validEquipment, name: 'Projector 4', capacity: 8 });
      expect(withCapacity.status).toBe(201);
      expect(withCapacity.body.capacity).toBeNull();
      expect((await Resource.findById(withCapacity.body.id))?.capacity).toBeNull();
    });

    it('accepts capacity null for equipment', async () => {
      const res = await create({ ...validEquipment, capacity: null });
      expect(res.status).toBe(201);
    });

    it('fills in an empty description and no tags when they are left out', async () => {
      const res = await create(validRoom);
      expect(res.body).toMatchObject({ description: '', tags: [] });
    });

    it('trims the text fields, and trims and de-duplicates tags ignoring case, keeping the first spelling', async () => {
      const res = await create({
        name: '  Room 204  ',
        type: 'room',
        location: '  Block B  ',
        capacity: 6,
        description: '  Quiet.  ',
        tags: [' Projector ', 'whiteboard', 'projector', 'PROJECTOR', 'Whiteboard'],
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Room 204', location: 'Block B', description: 'Quiet.', tags: ['Projector', 'whiteboard'] });
    });

    it('counts tags after removing repeats, so 11 entries with one repeat are fine', async () => {
      const tags = [...Array.from({ length: MAX_TAGS }, (_, i) => `tag ${i}`), 'TAG 0'];
      const res = await create({ ...validRoom, tags });
      expect(res.status).toBe(201);
      expect(res.body.tags).toHaveLength(MAX_TAGS);
    });

    it('ignores keys it does not own: isActive, id, role, timestamps', async () => {
      const res = await create({
        ...validRoom,
        isActive: false,
        id: '64b7f0f0f0f0f0f0f0f0f0f0',
        _id: '64b7f0f0f0f0f0f0f0f0f0f0',
        role: 'admin',
        createdAt: '2001-01-01T00:00:00.000Z',
        __v: 7,
      });
      expect(res.status).toBe(201);
      expect(res.body.isActive).toBe(true);
      expect(res.body.id).not.toBe('64b7f0f0f0f0f0f0f0f0f0f0');
      const stored = (await Resource.findById(res.body.id))!;
      expect(stored.createdAt.getFullYear()).toBeGreaterThan(2020);
      expect(Object.keys(res.body).sort()).toEqual(['capacity', 'description', 'id', 'isActive', 'location', 'name', 'tags', 'type']);
    });

    it('accepts values exactly at every limit', async () => {
      const res = await create({
        name: 'n'.repeat(MAX_NAME_LENGTH),
        type: 'room',
        location: 'l'.repeat(MAX_LOCATION_LENGTH),
        capacity: 1,
        description: 'd'.repeat(MAX_DESCRIPTION_LENGTH),
        tags: Array.from({ length: MAX_TAGS }, (_, i) => `${i}`.padEnd(MAX_TAG_LENGTH, 't')),
      });
      expect(res.status).toBe(201);
    });

    it('shows the new resource to members in the list and on its own page, in catalog order', async () => {
      await make('Zebra room');
      await make('Alpha camera', 'equipment');
      const created = await create(validRoom);

      const list = await request(app).get('/api/resources').set('Cookie', member);
      expect(list.body.map((r: { name: string }) => r.name)).toEqual(['Room 204', 'Zebra room', 'Alpha camera']);
      const one = await request(app).get(`/api/resources/${created.body.id}`).set('Cookie', member);
      expect(one.status).toBe(200);
      expect(one.body).toEqual(created.body);
    });
  });

  describe('invalid bodies → 400 VALIDATION_ERROR with a message on the field', () => {
    const cases: [string, Record<string, unknown>, string, string][] = [
      ['a missing name', { name: undefined }, 'name', 'Enter a name'],
      ['a blank name', { name: '   ' }, 'name', 'Enter a name'],
      ['a name that is too long', { name: 'n'.repeat(MAX_NAME_LENGTH + 1) }, 'name', 'Use 80 characters or fewer'],
      ['a numeric name', { name: 42 }, 'name', 'Enter a name'],
      ['an object as the name', { name: { $gt: '' } }, 'name', 'Enter a name'],
      ['a missing type', { type: undefined }, 'type', 'Choose room or equipment'],
      ['an unknown type', { type: 'lab' }, 'type', 'Choose room or equipment'],
      ['a missing location', { location: undefined }, 'location', 'Enter a location'],
      ['a blank location', { location: ' ' }, 'location', 'Enter a location'],
      ['a location that is too long', { location: 'l'.repeat(MAX_LOCATION_LENGTH + 1) }, 'location', 'Use 120 characters or fewer'],
      ['a description that is too long', { description: 'd'.repeat(MAX_DESCRIPTION_LENGTH + 1) }, 'description', 'Use 500 characters or fewer'],
      ['a description that is not text', { description: 5 }, 'description', 'Enter a description as text'],
      ['a null description', { description: null }, 'description', 'Enter a description as text'],
      ['tags that are not a list', { tags: 'Projector' }, 'tags', 'Tags must be a list'],
      ['a tag that is not text', { tags: ['ok', 7] }, 'tags', 'Tags must be text'],
      ['an object as a tag', { tags: [{ $ne: 1 }] }, 'tags', 'Tags must be text'],
      ['an empty tag', { tags: ['ok', '  '] }, 'tags', "Tags can't be empty"],
      ['a tag that is too long', { tags: ['t'.repeat(MAX_TAG_LENGTH + 1)] }, 'tags', 'Use 30 characters or fewer for each tag'],
      ['more than 10 different tags', { tags: Array.from({ length: MAX_TAGS + 1 }, (_, i) => `tag ${i}`) }, 'tags', 'Use at most 10 tags'],
      ['a room with no capacity', { capacity: undefined }, 'capacity', 'A room needs a capacity of 1 or more'],
      ['a room with a null capacity', { capacity: null }, 'capacity', 'A room needs a capacity of 1 or more'],
      ['a capacity of 0', { capacity: 0 }, 'capacity', 'Enter a capacity of 1 or more'],
      ['a negative capacity', { capacity: -3 }, 'capacity', 'Enter a capacity of 1 or more'],
      ['a fractional capacity', { capacity: 2.5 }, 'capacity', 'Enter a whole number'],
      ['a capacity sent as text', { capacity: '6' }, 'capacity', 'Enter a whole number'],
    ];

    it.each(cases)('rejects %s', async (_label, override, field, message) => {
      const res = await create({ ...validRoom, ...override });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(fieldsOf(res)[field]).toBe(message);
      expect(await Resource.countDocuments()).toBe(0);
    });

    it('reports every invalid field at once', async () => {
      const res = await create({});
      expect(res.status).toBe(400);
      expect(Object.keys(fieldsOf(res)).sort()).toEqual(['location', 'name', 'type']);
    });

    it.each([
      ['malformed JSON', '{"name": '],
      ['a JSON array', '[]'],
    ])('rejects %s with 400, not a 500', async (_label, raw) => {
      const res = await request(app).post('/api/resources').set('Cookie', admin).set('Content-Type', 'application/json').send(raw);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a request with no body', async () => {
      const res = await request(app).post('/api/resources').set('Cookie', admin);
      expect(res.status).toBe(400);
      expect(Object.keys(fieldsOf(res)).sort()).toEqual(['location', 'name', 'type']);
    });
  });

  describe('duplicate names → 409 NAME_TAKEN', () => {
    it('refuses a name that exists, ignoring case, and leaves the original alone', async () => {
      const original = await make('Boardroom', 'room', { capacity: 12 });
      for (const name of ['Boardroom', 'boardroom', 'BOARDROOM', '  Boardroom  ']) {
        const res = await create({ ...validRoom, name });
        expect(res.status, name).toBe(409);
        expect(res.body).toEqual({ error: { code: 'NAME_TAKEN', message: 'A resource with this name already exists.' } });
      }
      expect(await Resource.countDocuments()).toBe(1);
      expect(await Resource.findById(original.id)).toMatchObject({ name: 'Boardroom', capacity: 12 });
    });

    it('also refuses the name of an inactive resource', async () => {
      await make('Old Lab', 'room', { isActive: false });
      expect((await create({ ...validRoom, name: 'old lab' })).status).toBe(409);
    });

    it('lets exactly one of two simultaneous requests for the same name win', async () => {
      const results = await Promise.all([create({ ...validRoom, name: 'Race room' }), create({ ...validRoom, name: 'race ROOM' })]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)?.body.error.code).toBe('NAME_TAKEN');
      expect(await Resource.countDocuments()).toBe(1);
    });
  });
});

describe('PATCH /api/resources/:id', () => {
  describe('who may call it', () => {
    it('answers 401 UNAUTHENTICATED when signed out, and changes nothing', async () => {
      const room = await make('Boardroom');
      const res = await request(app).patch(`/api/resources/${room.id}`).send({ name: 'Hacked' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect((await Resource.findById(room.id))?.name).toBe('Boardroom');
    });

    it('answers 403 FORBIDDEN to a member, for every kind of change, and changes nothing', async () => {
      const room = await make('Boardroom', 'room', { capacity: 12 });
      const attempts = [{ name: 'Hacked' }, { isActive: false }, { capacity: 1 }, { tags: ['x'] }, { type: 'equipment' }];
      for (const body of attempts) {
        const res = await patch(room.id, body, member);
        expect(res.status, JSON.stringify(body)).toBe(403);
        expect(res.body).toEqual({ error: { code: 'FORBIDDEN', message: 'Only admins can do this.' } });
      }
      expect(await Resource.findById(room.id)).toMatchObject({ name: 'Boardroom', capacity: 12, type: 'room', isActive: true, tags: [] });
    });

    it('answers 403 to a member for an unknown id or an invalid body: nothing about the resource leaks', async () => {
      const room = await make('Boardroom');
      expect((await patch('64b7f0f0f0f0f0f0f0f0f0f0', { name: 'x' }, member)).status).toBe(403);
      expect((await patch('not-an-id', { name: 'x' }, member)).status).toBe(403);
      expect((await patch(room.id, {}, member)).status).toBe(403);
      expect((await patch(room.id, { name: '' }, member)).status).toBe(403);
    });

    it('answers 403 to a member trying to reactivate an inactive resource, which stays inactive', async () => {
      const inactive = await make('Old Lab', 'room', { isActive: false });
      expect((await patch(inactive.id, { isActive: true }, member)).status).toBe(403);
      expect((await Resource.findById(inactive.id))?.isActive).toBe(false);
    });
  });

  describe('finding the resource', () => {
    it.each(['64b7f0f0f0f0f0f0f0f0f0f0', 'not-an-id', '12345', 'zzzzzzzzzzzzzzzzzzzzzzzz'])(
      'answers an admin 404 NOT_FOUND for the id %j, never a 500',
      async (id) => {
        const res = await patch(id, { name: 'Anything' });
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
      },
    );
  });

  describe('editing', () => {
    it('changes the fields it is given and returns the whole updated resource', async () => {
      const room = await make('Boardroom', 'room', { capacity: 12, description: 'Old.', tags: ['Projector'] });
      const res = await patch(room.id, {
        name: 'Main boardroom',
        location: 'Block C',
        capacity: 14,
        description: 'New.',
        tags: ['Whiteboard', 'Video call'],
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: room.id,
        name: 'Main boardroom',
        type: 'room',
        location: 'Block C',
        capacity: 14,
        description: 'New.',
        tags: ['Whiteboard', 'Video call'],
        isActive: true,
      });
      expect(await Resource.findById(room.id)).toMatchObject({ name: 'Main boardroom', location: 'Block C', capacity: 14 });
    });

    it('leaves every field it was not given alone', async () => {
      const room = await make('Boardroom', 'room', { capacity: 12, description: 'Big.', tags: ['Projector'] });
      const res = await patch(room.id, { location: 'Block D' });
      expect(res.body).toEqual({
        id: room.id,
        name: 'Boardroom',
        type: 'room',
        location: 'Block D',
        capacity: 12,
        description: 'Big.',
        tags: ['Projector'],
        isActive: true,
      });
    });

    it('clears the description and the tags when sent empty', async () => {
      const room = await make('Boardroom', 'room', { description: 'Big.', tags: ['Projector'] });
      const res = await patch(room.id, { description: '', tags: [] });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ description: '', tags: [] });
    });

    it('trims and de-duplicates tags like creating does', async () => {
      const room = await make('Boardroom');
      const res = await patch(room.id, { tags: [' A ', 'a', 'B'] });
      expect(res.body.tags).toEqual(['A', 'B']);
    });

    it('does not fail with a 500 when a concurrent edit changed the document between loading and saving it', async () => {
      // Setting `tags` makes Mongoose add the document version to the update filter, so a save made after another
      // writer touched the resource finds nothing to update. The service reloads and applies the change again.
      const room = await make('Boardroom', 'room', { tags: ['Old'] });
      const realFind = Resource.findById.bind(Resource);
      let interfered = false;
      const spy = vi.spyOn(Resource, 'findById').mockImplementation(((id: string) => {
        const query = realFind(id);
        if (interfered) return query;
        interfered = true;
        return query.then(async (doc) => {
          await Resource.collection.updateOne({ _id: doc!._id }, { $inc: { __v: 1 }, $set: { location: 'Changed by someone else' } });
          return doc;
        });
      }) as never);
      try {
        const res = await patch(room.id, { tags: ['New'] });
        expect(res.status).toBe(200);
        expect(res.body.tags).toEqual(['New']);
        // the retry started from the other writer's version, so their change to another field survives
        expect(res.body.location).toBe('Changed by someone else');
      } finally {
        spy.mockRestore();
      }
    });

    it('lets two simultaneous edits of the tags both succeed', async () => {
      const room = await make('Boardroom', 'room', { tags: ['Old'] });
      const results = await Promise.all(Array.from({ length: 6 }, (_, i) => patch(room.id, { tags: [`Tag ${i}`] })));
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
      const stored = await Resource.findById(room.id);
      expect(stored?.tags).toHaveLength(1);
    });

    it('lets a resource change only the capitalization of its own name', async () => {
      const room = await make('boardroom');
      const res = await patch(room.id, { name: 'Boardroom' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Boardroom');
    });

    it('edits an inactive resource, which stays inactive', async () => {
      const inactive = await make('Old Lab', 'room', { isActive: false });
      const res = await patch(inactive.id, { location: 'Basement' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ location: 'Basement', isActive: false });
    });

    it('ignores keys it does not own: id, timestamps, version', async () => {
      const room = await make('Boardroom');
      const other = await make('Other room');
      const res = await patch(room.id, { name: 'Renamed', id: other.id, _id: other.id, createdAt: '2001-01-01T00:00:00.000Z', __v: 9 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: room.id, name: 'Renamed' });
      expect((await Resource.findById(other.id))?.name).toBe('Other room');
      expect((await Resource.findById(room.id))!.createdAt.getFullYear()).toBeGreaterThan(2020);
    });

    it('shows the edit to members straight away', async () => {
      const room = await make('Boardroom');
      await patch(room.id, { name: 'Renamed', tags: ['New'] });
      const res = await request(app).get(`/api/resources/${room.id}`).set('Cookie', member);
      expect(res.body).toMatchObject({ name: 'Renamed', tags: ['New'] });
    });
  });

  describe('the capacity rules run on update too (the M2 carryover: save(), not updateOne)', () => {
    it('refuses to turn equipment into a room without a capacity, and leaves it equipment', async () => {
      const item = await make('Projector 1', 'equipment');
      const res = await patch(item.id, { type: 'room' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(fieldsOf(res).capacity).toBe('A room needs a capacity of 1 or more');
      expect(await Resource.findById(item.id)).toMatchObject({ type: 'equipment', capacity: null });
    });

    it('turns equipment into a room when a capacity comes with it', async () => {
      const item = await make('Projector 1', 'equipment');
      const res = await patch(item.id, { type: 'room', capacity: 4 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ type: 'room', capacity: 4 });
      expect(await Resource.findById(item.id)).toMatchObject({ type: 'room', capacity: 4 });
    });

    it('turns a room into equipment and drops its stored capacity, even though none was sent', async () => {
      const room = await make('Huddle 1', 'room', { capacity: 6 });
      const res = await patch(room.id, { type: 'equipment' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ type: 'equipment', capacity: null });
      expect((await Resource.findById(room.id))?.capacity).toBeNull();
    });

    it('drops a capacity sent together with the change to equipment', async () => {
      const room = await make('Huddle 1', 'room', { capacity: 6 });
      const res = await patch(room.id, { type: 'equipment', capacity: 9 });
      expect(res.body.capacity).toBeNull();
      expect((await Resource.findById(room.id))?.capacity).toBeNull();
    });

    it('ignores a valid capacity sent for equipment', async () => {
      const item = await make('Projector 1', 'equipment');
      const res = await patch(item.id, { capacity: 8 });
      expect(res.status).toBe(200);
      expect(res.body.capacity).toBeNull();
      expect((await Resource.findById(item.id))?.capacity).toBeNull();
    });

    it.each([0, -1, 2.5, 'x'])('still refuses an invalid capacity (%j) for equipment: the value is checked, then ignored', async (capacity) => {
      const item = await make('Projector 1', 'equipment');
      const patched = await patch(item.id, { capacity });
      expect(patched.status).toBe(400);
      expect(fieldsOf(patched)).toHaveProperty('capacity');
      const created = await create({ ...validEquipment, capacity });
      expect(created.status).toBe(400);
      expect(await Resource.countDocuments()).toBe(1);
    });

    it('refuses to clear a room capacity, and keeps the old one', async () => {
      const room = await make('Huddle 1', 'room', { capacity: 6 });
      const res = await patch(room.id, { capacity: null });
      expect(res.status).toBe(400);
      expect(fieldsOf(res).capacity).toBe('A room needs a capacity of 1 or more');
      expect((await Resource.findById(room.id))?.capacity).toBe(6);
    });

    it.each([
      [0, 'Enter a capacity of 1 or more'],
      [-2, 'Enter a capacity of 1 or more'],
      [3.5, 'Enter a whole number'],
      ['6', 'Enter a whole number'],
    ])('refuses a room capacity of %j', async (capacity, message) => {
      const room = await make('Huddle 1', 'room', { capacity: 6 });
      const res = await patch(room.id, { capacity });
      expect(res.status).toBe(400);
      expect(fieldsOf(res).capacity).toBe(message);
      expect((await Resource.findById(room.id))?.capacity).toBe(6);
    });

    it('changes nothing at all when one of several fields is invalid', async () => {
      const room = await make('Huddle 1', 'room', { capacity: 6, location: 'Block A' });
      const res = await patch(room.id, { name: 'Renamed', location: 'Block Z', capacity: 0 });
      expect(res.status).toBe(400);
      expect(await Resource.findById(room.id)).toMatchObject({ name: 'Huddle 1', location: 'Block A', capacity: 6 });
    });

    it('changes nothing when the type change is refused, even if other fields were valid', async () => {
      const item = await make('Projector 1', 'equipment', { location: 'IT desk' });
      const res = await patch(item.id, { type: 'room', name: 'Renamed', location: 'Block Z' });
      expect(res.status).toBe(400);
      expect(await Resource.findById(item.id)).toMatchObject({ name: 'Projector 1', location: 'IT desk', type: 'equipment' });
    });
  });

  describe('deactivating and reactivating', () => {
    it('hides a deactivated resource from members: out of the list, 404 on its page, same as an unknown id', async () => {
      const room = await make('Boardroom');
      await make('Other room');

      const res = await patch(room.id, { isActive: false });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Boardroom', isActive: false });

      const list = await request(app).get('/api/resources').set('Cookie', member);
      expect(list.body.map((r: { name: string }) => r.name)).toEqual(['Other room']);
      const listAll = await request(app).get('/api/resources?status=all').set('Cookie', member);
      expect(listAll.body.map((r: { name: string }) => r.name)).toEqual(['Other room']);

      const one = await request(app).get(`/api/resources/${room.id}`).set('Cookie', member);
      const unknown = await request(app).get('/api/resources/64b7f0f0f0f0f0f0f0f0f0f0').set('Cookie', member);
      expect(one.status).toBe(404);
      expect(one.body).toEqual(unknown.body);
    });

    it('keeps a deactivated resource visible to admins who ask for status=all', async () => {
      const room = await make('Boardroom');
      await patch(room.id, { isActive: false });

      const all = await request(app).get('/api/resources?status=all').set('Cookie', admin);
      expect(all.body).toEqual([expect.objectContaining({ id: room.id, isActive: false })]);
      const one = await request(app).get(`/api/resources/${room.id}`).set('Cookie', admin);
      expect(one.status).toBe(200);
      expect(one.body.isActive).toBe(false);
    });

    it('restores a reactivated resource for members', async () => {
      const room = await make('Boardroom', 'room', { isActive: false });
      const res = await patch(room.id, { isActive: true });
      expect(res.body.isActive).toBe(true);

      const list = await request(app).get('/api/resources').set('Cookie', member);
      expect(list.body.map((r: { name: string }) => r.name)).toEqual(['Boardroom']);
      expect((await request(app).get(`/api/resources/${room.id}`).set('Cookie', member)).status).toBe(200);
    });

    it('changes only the status, and doing it twice is harmless', async () => {
      const room = await make('Boardroom', 'room', { capacity: 12, tags: ['Projector'] });
      await patch(room.id, { isActive: false });
      const again = await patch(room.id, { isActive: false });
      expect(again.status).toBe(200);
      expect(again.body).toEqual({
        id: room.id,
        name: 'Boardroom',
        type: 'room',
        location: 'Block A, 1st floor',
        capacity: 12,
        description: '',
        tags: ['Projector'],
        isActive: false,
      });
    });

  });

  describe('invalid bodies → 400 VALIDATION_ERROR', () => {
    it.each([
      ['an empty object', {}, 'body', 'Send at least one field to change'],
      ['only keys it does not own', { foo: 1, role: 'admin' }, 'body', 'Send at least one field to change'],
      ['a blank name', { name: ' ' }, 'name', 'Enter a name'],
      ['a name that is too long', { name: 'n'.repeat(MAX_NAME_LENGTH + 1) }, 'name', 'Use 80 characters or fewer'],
      ['an unknown type', { type: 'lab' }, 'type', 'Choose room or equipment'],
      ['a blank location', { location: '' }, 'location', 'Enter a location'],
      ['a long location', { location: 'l'.repeat(MAX_LOCATION_LENGTH + 1) }, 'location', 'Use 120 characters or fewer'],
      ['a long description', { description: 'd'.repeat(MAX_DESCRIPTION_LENGTH + 1) }, 'description', 'Use 500 characters or fewer'],
      ['a tag that is too long', { tags: ['t'.repeat(MAX_TAG_LENGTH + 1)] }, 'tags', 'Use 30 characters or fewer for each tag'],
      ['too many tags', { tags: Array.from({ length: MAX_TAGS + 1 }, (_, i) => `t${i}`) }, 'tags', 'Use at most 10 tags'],
      ['isActive as text', { isActive: 'false' }, 'isActive', 'Use true or false'],
      ['isActive as a number', { isActive: 0 }, 'isActive', 'Use true or false'],
      ['a null isActive', { isActive: null }, 'isActive', 'Use true or false'],
    ])('rejects %s', async (_label, body, field, message) => {
      const room = await make('Boardroom', 'room', { capacity: 12 });
      const res = await patch(room.id, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(fieldsOf(res)[field]).toBe(message);
      expect(await Resource.findById(room.id)).toMatchObject({ name: 'Boardroom', capacity: 12, isActive: true });
    });

    it('rejects malformed JSON with 400, not a 500', async () => {
      const room = await make('Boardroom');
      const res = await request(app)
        .patch(`/api/resources/${room.id}`)
        .set('Cookie', admin)
        .set('Content-Type', 'application/json')
        .send('{"name": ');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('duplicate names → 409 NAME_TAKEN', () => {
    it('refuses to rename onto another resource, ignoring case, and keeps the old name', async () => {
      await make('Boardroom');
      const huddle = await make('Huddle 1');
      for (const name of ['Boardroom', 'BOARDROOM', ' boardroom ']) {
        const res = await patch(huddle.id, { name });
        expect(res.status, name).toBe(409);
        expect(res.body).toEqual({ error: { code: 'NAME_TAKEN', message: 'A resource with this name already exists.' } });
      }
      expect((await Resource.findById(huddle.id))?.name).toBe('Huddle 1');
    });

    it('lets exactly one of two simultaneous renames onto the same name win', async () => {
      const a = await make('Room A');
      const b = await make('Room B');
      const results = await Promise.all([patch(a.id, { name: 'Shared name' }), patch(b.id, { name: 'shared NAME' })]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await Resource.countDocuments({ name: /^shared name$/i })).toBe(1);
    });
  });
});
