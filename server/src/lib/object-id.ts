const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** True for a 24-character hex string. Checking first keeps a malformed id from becoming a Mongoose CastError (and a 500). */
export function isObjectIdString(value: string): boolean {
  return OBJECT_ID.test(value);
}
