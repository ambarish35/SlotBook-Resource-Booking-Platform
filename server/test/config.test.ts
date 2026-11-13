import { describe, expect, it } from 'vitest';
import { ConfigError, readConfig } from '../src/config.js';
import { redactConnectionStrings } from '../src/db.js';

describe('readConfig', () => {
  it('applies defaults', () => {
    const config = readConfig({ MONGODB_URI: 'mongodb+srv://alice:pw@cluster.example.net/' });
    expect(config).toMatchObject({ NODE_ENV: 'development', PORT: 4000, MONGODB_DB_NAME: 'slotbook' });
  });

  it('requires MONGODB_URI', () => {
    expect(() => readConfig({})).toThrow(ConfigError);
    expect(() => readConfig({})).toThrow(/MONGODB_URI is required/);
  });

  it('rejects the unfilled .env.example placeholder', () => {
    expect(() => readConfig({ MONGODB_URI: 'mongodb+srv://<username>:<password>@<cluster-host>/' })).toThrow(/placeholder/);
  });

  it('never includes values in error messages', () => {
    const attempt = () => readConfig({ MONGODB_URI: 'postgres://alice:s3cret@db.example.net' });
    expect(attempt).toThrow(/MONGODB_URI/);
    expect(attempt).not.toThrow(/s3cret/);
  });
});

describe('redactConnectionStrings', () => {
  it('hides credentials inside connection strings', () => {
    expect(redactConnectionStrings('failed: mongodb+srv://alice:s3cret@cluster.example.net/db')).toBe(
      'failed: mongodb+srv://<credentials>@cluster.example.net/db',
    );
  });
});
