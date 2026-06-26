import type { SuiClientTypes } from '@mysten/sui/client';

/**
 * core API object adapter layer (replaces 1.x JSON-RPC SuiObjectResponse handling).
 *
 * In 2.0, core objects expose objectId/version/digest/owner/type at the top level,
 * and getObject throws directly for missing objects (no more deleted/notExists branches).
 * Move struct content is delivered as BCS bytes in the content field
 * (requires include:{content:true}) and parsed via schemas under src/bcs.
 */

/** Core object with content (element type for getObject/getObjects with include:{content:true}) */
export type CoreObjectWithContent = SuiClientTypes.Object<{ content: true }>;

/**
 * Parse an object's Move struct content with a BCS schema.
 * Requires the object to have been fetched with include:{ content: true }.
 * @param schema A bcs schema from src/bcs (must implement parse(bytes))
 */
export function parseObjectFields<T>(
  object: { objectId: string; content?: Uint8Array | null },
  schema: { parse(bytes: Uint8Array): T },
): T {
  if (!object.content) {
    throw new Error(
      `Object(${object.objectId}) content is missing; request it with include:{ content: true }`,
    );
  }
  return schema.parse(object.content);
}
