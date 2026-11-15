import { describe, expect, it } from 'vitest';
import { ConfigError, readConfig, readDatabaseConfig } from '../src/config.js';
import { redactConnectionStrings } from '../src/db.js';

const URI = 'mongodb+srv://alice:pw@cluster.example.net/';
const SECRET = 'a'.repeat(32);

describe('readConfig', () => {
  it('applies defaults', () => {
    const config = readConfig({ MONGODB_URI: URI, JWT_SECRET: SECRET });
    expect(config).toMatchObject({ NODE_ENV: 'development', PORT: 4000, MONGODB_DB_NAME: 'slotbook' });
  });

  it('requires MONGODB_URI', () => {
    expect(() => readConfig({ JWT_SECRET: SECRET })).toThrow(ConfigError);
    expect(() => readConfig({ JWT_SECRET: SECRET })).toThrow(/MONGODB_URI is required/);
  });

  it('rejects the unfilled .env.example placeholder', () => {
    expect(() =>
      readConfig({ MONGODB_URI: 'mongodb+srv://<username>:<password>@<cluster-host>/', JWT_SECRET: SECRET }),
    ).toThrow(/placeholder/);
  });

  it('never includes values in error messages', () => {
    const attempt = () => readConfig({ MONGODB_URI: 'postgres://alice:s3cret@db.example.net', JWT_SECRET: SECRET });
    expect(attempt).toThrow(/MONGODB_URI/);
    expect(attempt).not.toThrow(/s3cret/);
  });

  it('requires JWT_SECRET', () => {
    expect(() => readConfig({ MONGODB_URI: URI })).toThrow(/JWT_SECRET is required/);
  });

  it('rejects a short or placeholder JWT_SECRET without echoing it', () => {
    expect(() => readConfig({ MONGODB_URI: URI, JWT_SECRET: 'hunter2' })).toThrow(/JWT_SECRET must be at least 32 characters/);
    expect(() => readConfig({ MONGODB_URI: URI, JWT_SECRET: 'hunter2' })).not.toThrow(/hunter2/);
    expect(() => readConfig({ MONGODB_URI: URI, JWT_SECRET: '<generate-a-random-secret-at-least-32-chars>' })).toThrow(
      /placeholder/,
    );
  });
});

describe('readConfig in production', () => {
  const production = { NODE_ENV: 'production', MONGODB_URI: URI, JWT_SECRET: SECRET };

  it('requires TRUST_PROXY, because there is no safe default for it', () => {
    expect(() => readConfig(production)).toThrow(ConfigError);
    expect(() => readConfig(production)).toThrow(/TRUST_PROXY is required in production/);
  });

  it('accepts TRUST_PROXY as a number of proxies, from 0 up to 10', () => {
    expect(readConfig({ ...production, TRUST_PROXY: '0' }).TRUST_PROXY).toBe(0);
    expect(readConfig({ ...production, TRUST_PROXY: '1' })).toMatchObject({ NODE_ENV: 'production', TRUST_PROXY: 1 });
    expect(readConfig({ ...production, TRUST_PROXY: ' 2 ' }).TRUST_PROXY).toBe(2);
    for (const bad of ['', 'true', '-1', '1.5', 'loopback', '11', '100']) {
      expect(() => readConfig({ ...production, TRUST_PROXY: bad }), `TRUST_PROXY=${bad}`).toThrow(/TRUST_PROXY/);
    }
  });

  it('still requires the database and the signing secret, naming them without echoing values', () => {
    const attempt = () => readConfig({ NODE_ENV: 'production', TRUST_PROXY: '1', MONGODB_URI: 'postgres://alice:s3cret@db.example.net', JWT_SECRET: 'short-s3cret' });
    expect(attempt).toThrow(/MONGODB_URI/);
    expect(attempt).toThrow(/JWT_SECRET/);
    expect(attempt).not.toThrow(/s3cret/);
    expect(() => readConfig({ NODE_ENV: 'production', TRUST_PROXY: '1' })).toThrow(/MONGODB_URI is required/);
  });

  it('refuses an unknown NODE_ENV instead of quietly running as development', () => {
    expect(() => readConfig({ NODE_ENV: 'prod', MONGODB_URI: URI, JWT_SECRET: SECRET, TRUST_PROXY: '1' })).toThrow(/NODE_ENV/);
  });

  it('keeps development simple: TRUST_PROXY is optional there and means 0', () => {
    expect(readConfig({ MONGODB_URI: URI, JWT_SECRET: SECRET }).TRUST_PROXY).toBe(0);
    expect(readConfig({ NODE_ENV: 'test', MONGODB_URI: URI, JWT_SECRET: SECRET }).TRUST_PROXY).toBe(0);
    expect(() => readConfig({ MONGODB_URI: URI, JWT_SECRET: SECRET, TRUST_PROXY: 'banana' })).toThrow(/TRUST_PROXY/);
  });
});

describe('readDatabaseConfig', () => {
  it('needs only the database settings, so the seed script runs without JWT_SECRET', () => {
    expect(readDatabaseConfig({ MONGODB_URI: URI })).toEqual({ MONGODB_URI: URI, MONGODB_DB_NAME: 'slotbook' });
    expect(() => readDatabaseConfig({})).toThrow(/MONGODB_URI is required/);
  });
});

describe('redactConnectionStrings', () => {
  it('hides credentials inside connection strings', () => {
    expect(redactConnectionStrings('failed: mongodb+srv://alice:s3cret@cluster.example.net/db')).toBe(
      'failed: mongodb+srv://<credentials>@cluster.example.net/db',
    );
  });
});
