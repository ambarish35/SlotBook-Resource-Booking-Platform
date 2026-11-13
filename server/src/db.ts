import mongoose from 'mongoose';

export type DatabaseErrorCode = 'DB_UNREACHABLE' | 'DB_NOT_REPLICA_SET' | 'DB_TRANSACTIONS_UNSUPPORTED';

export class DatabaseStartupError extends Error {
  override name = 'DatabaseStartupError';
  readonly code: DatabaseErrorCode;

  constructor(code: DatabaseErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** Replaces the credentials in any MongoDB connection string inside `text`. */
export function redactConnectionStrings(text: string): string {
  return text.replace(/(mongodb(?:\+srv)?:\/\/)[^@\s/]+@/gi, '$1<credentials>@');
}

function describeError(error: unknown): string {
  if (error instanceof Error) return redactConnectionStrings(`${error.name}: ${error.message}`);
  return 'unknown error';
}

export interface ConnectOptions {
  uri: string;
  dbName: string;
  serverSelectionTimeoutMS?: number;
}

/**
 * Connects Mongoose, then refuses to continue unless the deployment is a replica set
 * (or mongos) where a transaction actually works, and builds all model indexes.
 * See PLAN.md §9. On failure the connection is closed and a DatabaseStartupError is thrown.
 */
export async function connectDatabase({ uri, dbName, serverSelectionTimeoutMS = 10_000 }: ConnectOptions): Promise<void> {
  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS });
  } catch (error) {
    await mongoose.disconnect().catch(() => undefined);
    throw new DatabaseStartupError(
      'DB_UNREACHABLE',
      `Could not connect to MongoDB (${describeError(error)}). Check MONGODB_URI and that this machine's IP address is allowed in Atlas Network Access.`,
    );
  }

  try {
    await assertReplicaSet();
    await assertTransactionsWork();
    await ensureIndexes();
  } catch (error) {
    await mongoose.disconnect().catch(() => undefined);
    throw error;
  }
}

function getDb() {
  const db = mongoose.connection.db;
  if (!db) throw new DatabaseStartupError('DB_UNREACHABLE', 'MongoDB connection has no database handle.');
  return db;
}

async function assertReplicaSet(): Promise<void> {
  const hello = await getDb().admin().command({ hello: 1 });
  const isReplicaSet = typeof hello.setName === 'string';
  const isMongos = hello.msg === 'isdbgrid';
  if (!isReplicaSet && !isMongos) {
    throw new DatabaseStartupError(
      'DB_NOT_REPLICA_SET',
      'SlotBook needs a MongoDB replica set (transactions). This server is a standalone mongod; use MongoDB Atlas or start mongod with --replSet.',
    );
  }
}

/** Runs a read-only transaction to prove that the deployment really supports transactions. */
async function assertTransactionsWork(): Promise<void> {
  const db = getDb();
  const session = await mongoose.connection.startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection('startup_checks').findOne({}, { session });
    });
  } catch (error) {
    throw new DatabaseStartupError(
      'DB_TRANSACTIONS_UNSUPPORTED',
      `MongoDB is connected, but a test transaction failed (${describeError(error)}).`,
    );
  } finally {
    await session.endSession();
  }
}

/** Builds the indexes of every registered model before the API accepts requests. */
async function ensureIndexes(): Promise<void> {
  await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
