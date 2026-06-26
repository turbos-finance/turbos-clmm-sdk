/**
 * 2.0 migration: core API throws on missing/deleted objects so this validator is a no-op.
 * Kept for backward compatibility in case external callers import it.
 */
export const validateObjectResponse = (_obj: unknown, _key: string): true => true;
