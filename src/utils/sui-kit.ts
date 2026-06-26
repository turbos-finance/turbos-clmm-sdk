import type { ClientWithCoreApi, SuiClientTypes } from '@mysten/sui/client';
import { parseObjectFields, type CoreObjectWithContent } from '../lib/legacy';

/**
 * Batch-read objects via the core API, always with include:{ content: true }.
 * core.getObjects returns Error elements for missing objects; we throw on the first
 * (every caller expects the objects to exist).
 */
export const multiGetObjects = async (
  provider: ClientWithCoreApi,
  ids: string[],
): Promise<CoreObjectWithContent[]> => {
  const step = 50;
  ids = [...new Set(ids)];
  const objects: CoreObjectWithContent[] = [];

  for (let i = 0; i < ids.length; i += step) {
    const { objects: batch } = await provider.core.getObjects({
      objectIds: ids.slice(i, i + step),
      include: { content: true },
    });
    for (const obj of batch) {
      if (obj instanceof Error) {
        throw obj;
      }
      objects.push(obj);
    }
  }

  return objects;
};

/**
 * Iterate all owned objects of a given type under an address and parse each
 * Move content with the supplied schema.
 * @param type Full struct type (replaces 1.x SuiObjectDataFilter; maps to core's type filter)
 * @param schema BCS schema for the corresponding struct
 */
export async function forEacGetOwnedObjects<T>(
  provider: ClientWithCoreApi,
  address: string,
  type: string,
  schema: { parse(bytes: Uint8Array): T },
): Promise<T[]> {
  const data: T[] = [];
  let cursor: string | null | undefined = undefined;
  let hasNextPage = true;

  while (hasNextPage) {
    const result: SuiClientTypes.ListOwnedObjectsResponse<{ content: true }> =
      await provider.core.listOwnedObjects({
        owner: address,
        cursor,
        type,
        include: { content: true },
      });
    for (const obj of result.objects) {
      data.push(parseObjectFields(obj, schema));
    }
    cursor = result.cursor;
    hasNextPage = result.hasNextPage;
  }

  return data;
}
