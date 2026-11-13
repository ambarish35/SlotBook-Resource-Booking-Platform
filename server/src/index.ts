import { createApp } from './app.js';
import { ConfigError, loadEnvFile, readConfig } from './config.js';
import { DatabaseStartupError, connectDatabase, disconnectDatabase, redactConnectionStrings } from './db.js';

function fail(error: unknown): never {
  const known = error instanceof ConfigError || error instanceof DatabaseStartupError;
  const text = error instanceof Error ? (known ? error.message : `${error.name}: ${error.message}`) : String(error);
  console.error(`SlotBook API failed to start: ${redactConnectionStrings(text)}`);
  process.exit(1);
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = readConfig();

  await connectDatabase({ uri: config.MONGODB_URI, dbName: config.MONGODB_DB_NAME });
  console.log(`MongoDB connected: database "${config.MONGODB_DB_NAME}", replica set and transactions verified`);

  const app = createApp({ jwtSecret: config.JWT_SECRET, secureCookies: config.NODE_ENV === 'production' });
  const server = app.listen(config.PORT, (error?: Error) => {
    if (error) fail(error);
    console.log(`SlotBook API listening on http://localhost:${config.PORT}`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(fail);
