/**
 * parseObjectFields adapter tests (sui 2.0 migration).
 * The 1.x JSON-RPC field helpers were replaced by a single BCS-based parser.
 */
import { parseObjectFields } from '../src/lib/legacy';
import { Fee } from '../src/bcs/clmm';

const ADDR = '0x' + 'aa'.repeat(32);

test('parses BCS content with the given schema', () => {
  const content = Fee.serialize({ id: ADDR, fee: 500, tick_spacing: 10 }).toBytes();
  const fields = parseObjectFields({ objectId: ADDR, content }, Fee);
  expect(fields.fee).toBe(500);
  expect(fields.tick_spacing).toBe(10);
});

test('throws a descriptive error when content is missing', () => {
  expect(() => parseObjectFields({ objectId: ADDR, content: null }, Fee)).toThrowError(
    /content is missing/,
  );
  expect(() => parseObjectFields({ objectId: ADDR }, Fee)).toThrowError(ADDR);
});
