import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { DEMO_RESOURCES } from '../src/demo-resources.js';
import { MAX_TAGS, Resource, type ResourceType } from '../src/models/Resource.js';
import { seedResources } from '../src/seed.js';
import { createUser } from '../src/services/auth.js';
import { TEST_SESSION, sessionCookie, startTestDatabase } from './helpers.js';

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

function make(name: string, type: ResourceType = 'room', extra: Record<string, unknown> = {}) {
  return Resource.create({
    name,
    type,
    location: 'Block A, 1st floor',
    capacity: type === 'room' ? 6 : null,
    ...extra,
  });
}

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

describe('GET /api/resources', () => {
  it('returns 401 UNAUTHENTICATED when signed out', async () => {
    const res = await request(app).get('/api/resources');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns an empty list for an empty catalog', async () => {
    const res = await request(app).get('/api/resources').set('Cookie', member);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns only active resources to a member, in the public shape', async () => {
    await make('Boardroom', 'room', { capacity: 12, description: 'Big.', tags: ['Projector'] });
    await make('Projector 1', 'equipment', { tags: [] });
    await make('Old Lab', 'room', { isActive: false });

    const res = await request(app).get('/api/resources').set('Cookie', member);

    expect(res.status).toBe(200);
    expect(res.body.map((r: { name: string }) => r.name)).toEqual(['Boardroom', 'Projector 1']);
    expect(res.body[0]).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{24}$/),
      name: 'Boardroom',
      type: 'room',
      location: 'Block A, 1st floor',
      capacity: 12,
      description: 'Big.',
      tags: ['Projector'],
      isActive: true,
    });
    // Equipment has no capacity, and an unset description comes back as an empty string.
    expect(res.body[1]).toMatchObject({ capacity: null, description: '', tags: [] });
    expect(Object.keys(res.body[0]).sort()).toEqual(
      ['capacity', 'description', 'id', 'isActive', 'location', 'name', 'tags', 'type'],
    );
  });

  it('lists rooms first, then equipment, each alphabetical ignoring case', async () => {
    await make('zeta room');
    await make('Alpha camera', 'equipment');
    await make('beta Room');
    await make('Zulu speaker', 'equipment');
    await make('Alpha room');
    await make('bravo mic', 'equipment');

    const res = await request(app).get('/api/resources').set('Cookie', member);

    expect(res.body.map((r: { name: string }) => r.name)).toEqual([
      'Alpha room',
      'beta Room',
      'zeta room',
      'Alpha camera',
      'bravo mic',
      'Zulu speaker',
    ]);
  });

  describe('inactive resources and ?status', () => {
    beforeEach(async () => {
      await make('Active room');
      await make('Inactive room', 'room', { isActive: false });
    });

    const names = (res: request.Response) => res.body.map((r: { name: string }) => r.name);

    it('hides them from an admin by default', async () => {
      expect(names(await request(app).get('/api/resources').set('Cookie', admin))).toEqual(['Active room']);
    });

    it('shows them to an admin who asks for status=all', async () => {
      const res = await request(app).get('/api/resources?status=all').set('Cookie', admin);
      expect(names(res)).toEqual(['Active room', 'Inactive room']);
      expect(res.body.find((r: { name: string }) => r.name === 'Inactive room').isActive).toBe(false);
    });

    it('ignores status=all for a member', async () => {
      expect(names(await request(app).get('/api/resources?status=all').set('Cookie', member))).toEqual(['Active room']);
    });

    it('accepts status=active', async () => {
      expect(names(await request(app).get('/api/resources?status=active').set('Cookie', admin))).toEqual(['Active room']);
    });

    it.each(['bogus', 'inactive', ''])('rejects status=%j with 400 VALIDATION_ERROR', async (value) => {
      const res = await request(app).get(`/api/resources?status=${value}`).set('Cookie', member);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.fields.status).toBe('Use "active" or "all"');
    });

    it('rejects a repeated status parameter', async () => {
      const res = await request(app).get('/api/resources?status=all&status=active').set('Cookie', admin);
      expect(res.status).toBe(400);
    });
  });
});

describe('GET /api/resources/:id', () => {
  it('returns 401 UNAUTHENTICATED when signed out', async () => {
    const room = await make('Boardroom');
    const res = await request(app).get(`/api/resources/${room.id}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns one active resource to a member', async () => {
    const room = await make('Boardroom', 'room', { capacity: 12, tags: ['Projector', 'Whiteboard'] });
    const res = await request(app).get(`/api/resources/${room.id}`).set('Cookie', member);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: room.id, name: 'Boardroom', type: 'room', capacity: 12, tags: ['Projector', 'Whiteboard'] });
  });

  it('returns null capacity for equipment', async () => {
    const item = await make('Projector 1', 'equipment');
    const res = await request(app).get(`/api/resources/${item.id}`).set('Cookie', member);
    expect(res.body).toMatchObject({ type: 'equipment', capacity: null });
  });

  it('answers a member asking for an inactive resource exactly like an unknown id', async () => {
    const inactive = await make('Old Lab', 'room', { isActive: false });
    const inactiveRes = await request(app).get(`/api/resources/${inactive.id}`).set('Cookie', member);
    const unknownRes = await request(app).get('/api/resources/64b7f0f0f0f0f0f0f0f0f0f0').set('Cookie', member);

    expect(inactiveRes.status).toBe(404);
    expect(inactiveRes.body.error.code).toBe('NOT_FOUND');
    expect(inactiveRes.body).toEqual(unknownRes.body);
  });

  it('lets an admin open an inactive resource', async () => {
    const inactive = await make('Old Lab', 'room', { isActive: false });
    const res = await request(app).get(`/api/resources/${inactive.id}`).set('Cookie', admin);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Old Lab', isActive: false });
  });

  it.each(['64b7f0f0f0f0f0f0f0f0f0f0', 'not-an-id', '12345', 'zzzzzzzzzzzzzzzzzzzzzzzz'])(
    'answers 404 NOT_FOUND for the id %j, never a 500',
    async (id) => {
      const res = await request(app).get(`/api/resources/${id}`).set('Cookie', admin);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    },
  );
});

describe('Resource model', () => {
  it('needs a whole-number capacity of 1 or more for a room', async () => {
    for (const capacity of [undefined, null, 0, -3, 2.5]) {
      const attempt = Resource.create({ name: 'Room X', type: 'room', location: 'Block A', capacity });
      await expect(attempt, `capacity ${String(capacity)}`).rejects.toThrow(/capacity/i);
    }
    expect(await Resource.countDocuments()).toBe(0);
    await expect(Resource.create({ name: 'Room X', type: 'room', location: 'Block A', capacity: 1 })).resolves.toBeDefined();
  });

  it('forces equipment capacity to null', async () => {
    const item = await Resource.create({ name: 'Projector X', type: 'equipment', location: 'IT desk', capacity: 8 });
    expect(item.capacity).toBeNull();
    expect((await Resource.findById(item.id))?.capacity).toBeNull();
  });

  it('requires a name, type and location', async () => {
    await expect(Resource.create({ type: 'room', location: 'A', capacity: 2 })).rejects.toThrow(/name/i);
    await expect(Resource.create({ name: 'X', location: 'A', capacity: 2 })).rejects.toThrow(/type/i);
    await expect(Resource.create({ name: 'X', type: 'room', capacity: 2 })).rejects.toThrow(/location/i);
    await expect(Resource.create({ name: 'X', type: 'lab' as never, location: 'A' })).rejects.toThrow(/type/i);
  });

  it('limits name, description and tags', async () => {
    const base = { type: 'room', location: 'A', capacity: 2 } as const;
    await expect(Resource.create({ ...base, name: 'n'.repeat(81) })).rejects.toThrow(/name/i);
    await expect(Resource.create({ ...base, name: 'Ok', description: 'd'.repeat(501) })).rejects.toThrow(/description/i);
    await expect(
      Resource.create({ ...base, name: 'Ok', tags: Array.from({ length: MAX_TAGS + 1 }, (_, i) => `tag ${i}`) }),
    ).rejects.toThrow(/tags/i);
    const ok = await Resource.create({ ...base, name: 'Ok', tags: Array.from({ length: MAX_TAGS }, (_, i) => `tag ${i}`) });
    expect(ok.tags).toHaveLength(MAX_TAGS);
  });

  it('trims text fields', async () => {
    const room = await Resource.create({ name: '  Boardroom ', type: 'room', location: ' Block A ', capacity: 4, tags: [' Projector '] });
    expect(room).toMatchObject({ name: 'Boardroom', location: 'Block A', tags: ['Projector'] });
  });

  it('keeps names unique ignoring case, so only one "Boardroom" can exist', async () => {
    await make('Boardroom');
    await expect(make('boardroom')).rejects.toMatchObject({ code: 11000 });
    await expect(make('BOARDROOM')).rejects.toMatchObject({ code: 11000 });
    expect(await Resource.countDocuments()).toBe(1);
  });

  it('has the indexes from PLAN.md §5, built once the database is connected', async () => {
    const indexes = await Resource.collection.indexes();
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: { name: 1 }, unique: true, collation: expect.objectContaining({ locale: 'en', strength: 2 }) }),
        expect.objectContaining({ key: { isActive: 1, type: 1 } }),
      ]),
    );
  });
});

describe('the demo catalog and seedResources', () => {
  it('meets the M2 brief: about 8 rooms and equipment units, including a projector, all valid', async () => {
    expect(DEMO_RESOURCES.length).toBeGreaterThanOrEqual(6);
    expect(DEMO_RESOURCES.length).toBeLessThanOrEqual(10);
    expect(new Set(DEMO_RESOURCES.map((r) => r.type))).toEqual(new Set(['room', 'equipment']));
    expect(DEMO_RESOURCES.some((r) => r.type === 'equipment' && /projector/i.test(r.name))).toBe(true);
    expect(new Set(DEMO_RESOURCES.map((r) => r.name.toLowerCase())).size).toBe(DEMO_RESOURCES.length);
    // At least one resource has more than three tags, so the card's "+N more" has real data behind it.
    expect(DEMO_RESOURCES.some((r) => r.tags.length > 3)).toBe(true);
    for (const demo of DEMO_RESOURCES) {
      await expect(new Resource(demo).validate(), demo.name).resolves.toBeUndefined();
    }
  });

  it('creates every demo resource, active, and is safe to run again', async () => {
    expect(await seedResources()).toEqual({ created: DEMO_RESOURCES.length, existing: 0 });
    expect(await Resource.countDocuments({ isActive: true })).toBe(DEMO_RESOURCES.length);

    expect(await seedResources()).toEqual({ created: 0, existing: DEMO_RESOURCES.length });
    expect(await Resource.countDocuments()).toBe(DEMO_RESOURCES.length);
  });

  it('never overwrites an admin\'s edits or a deactivated resource, and matches names ignoring case', async () => {
    await seedResources();
    await Resource.updateOne({ name: 'Boardroom' }, { location: 'Moved to Block C', isActive: false });
    await Resource.updateOne({ name: 'Focus Room' }, { name: 'focus room' });

    expect(await seedResources()).toEqual({ created: 0, existing: DEMO_RESOURCES.length });

    expect(await Resource.findOne({ name: 'Boardroom' })).toMatchObject({ location: 'Moved to Block C', isActive: false });
    expect(await Resource.countDocuments()).toBe(DEMO_RESOURCES.length);
  });

  it('feeds the discovery list: members see all of it, rooms first', async () => {
    await seedResources();
    const res = await request(app).get('/api/resources').set('Cookie', member);
    expect(res.body).toHaveLength(DEMO_RESOURCES.length);
    const types = res.body.map((r: { type: string }) => r.type);
    expect(types).toEqual([...types].sort((a, b) => (a === b ? 0 : a === 'room' ? -1 : 1)));
  });
});

describe('seedResources racing another seed run', () => {
  it('counts a duplicate-key error from a concurrent run as "already existed", not a failure', async () => {
    await seedResources(); // every demo resource now exists
    // Simulate the other run winning the race: the existence check says "missing", but the insert collides.
    const exists = vi.spyOn(Resource, 'exists').mockReturnValue({ collation: () => Promise.resolve(null) } as never);
    try {
      await expect(seedResources()).resolves.toEqual({ created: 0, existing: DEMO_RESOURCES.length });
    } finally {
      exists.mockRestore();
    }
    expect(await Resource.countDocuments()).toBe(DEMO_RESOURCES.length);
  });
});
