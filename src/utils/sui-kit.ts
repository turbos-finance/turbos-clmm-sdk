import {
  SuiClient,
  SuiObjectDataOptions,
  SuiObjectResponse,
  type PaginatedObjectsResponse,
  type SuiObjectDataFilter,
} from '@mysten/sui/client';
import { getObjectFields } from '../lib/legacy';

export const multiGetObjects = async (
  provider: SuiClient,
  ids: string[],
  options?: SuiObjectDataOptions,
): Promise<SuiObjectResponse[]> => {
  const step = 50;
  ids = [...new Set(ids)];
  const objects: SuiObjectResponse[] = [];

  for (let i = 0; i < ids.length; i += step) {
    const result = await provider.multiGetObjects({
      ids: ids.slice(i, i + step),
      options,
    });
    objects.push(...result);
  }

  return objects;
};

export async function forEacGetOwnedObjects<T>(
  provider: SuiClient,
  address: string,
  filter: SuiObjectDataFilter,
): Promise<T[]> {
  let dynamicFields: PaginatedObjectsResponse | undefined;
  let data: T[] = [];
  do {
    dynamicFields = await provider.getOwnedObjects({
      owner: address,
      cursor: dynamicFields?.nextCursor,
      options: { showContent: true, showType: true },
      filter: filter,
    });
    if (dynamicFields) {
      data = [
        ...data,
        ...(dynamicFields.data.map((item) => getObjectFields(item)) as T[]),
      ];
    }
  } while (dynamicFields.hasNextPage);

  return data;
}
