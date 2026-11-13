// `npm run seed`: creates the demo admin and member from SEED_* variables. Safe to run repeatedly.
import { ConfigError, loadEnvFile, readDatabaseConfig } from '../config.js';
import { DatabaseStartupError, connectDatabase, disconnectDatabase, redactConnectionStrings } from '../db.js';
import { readSeedAccounts, seedAccounts } from '../seed.js';

async function main(): Promise<void> {
  loadEnvFile();
  const database = readDatabaseConfig();
  const accounts = readSeedAccounts();

  await connectDatabase({ uri: database.MONGODB_URI, dbName: database.MONGODB_DB_NAME });
  try {
    const results = await seedAccounts(accounts);
    console.log(`Seeded users: ${results.map(({ role, outcome }) => `${role} ${outcome}`).join(', ')}`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error: unknown) => {
  const known = error instanceof ConfigError || error instanceof DatabaseStartupError;
  const text = error instanceof Error ? (known ? error.message : `${error.name}: ${error.message}`) : String(error);
  console.error(`Seed failed: ${redactConnectionStrings(text)}`);
  process.exit(1);
});
