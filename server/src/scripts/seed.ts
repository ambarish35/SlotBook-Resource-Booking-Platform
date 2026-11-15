// `npm run seed`: creates the demo admin and member from SEED_* variables. Safe to run repeatedly.
import { ConfigError, loadEnvFile, readDatabaseConfig } from '../config.js';
import { DatabaseStartupError, connectDatabase, disconnectDatabase, redactConnectionStrings } from '../db.js';
import { readSeedAccounts, seedAccounts, seedBookings, seedResources } from '../seed.js';

async function main(): Promise<void> {
  loadEnvFile();
  const database = readDatabaseConfig();
  const accounts = readSeedAccounts();

  await connectDatabase({ uri: database.MONGODB_URI, dbName: database.MONGODB_DB_NAME });
  // The database's name only, never its address or credentials: enough to notice, before anything is written, that a
  // forgotten variable made this the development database (a variable set in the shell beats .env one by one).
  console.log(`Seeding database "${database.MONGODB_DB_NAME}"`);
  try {
    const results = await seedAccounts(accounts);
    console.log(`Seeded users: ${results.map(({ role, outcome }) => `${role} ${outcome}`).join(', ')}`);
    const { created, existing } = await seedResources();
    console.log(`Seeded demo resources: ${created} created, ${existing} already existed`);
    const bookings = await seedBookings(accounts);
    console.log(`Seeded demo bookings: ${bookings.created} created, ${bookings.skipped} skipped`);
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
