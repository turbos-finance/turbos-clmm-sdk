import {
  SuiClient,
  SuiObjectDataOptions,
  SuiObjectResponse,
  type PaginatedObjectsResponse,
  type SuiObjectDataFilter,
} from '@mysten/sui/client';
import { unstable_getObjectFields } from '..';

export const multiGetObjects = async (
  provider: SuiClient,
  ids: string[],
  options?: SuiObjectDataOptions,
): Promise<SuiObjectResponse[]> => {
  const max = 50;
  const len = ids.length;
  if (len > max) {
    const requests = [];
    let i = 0;
    const times = Math.ceil(len / max);
    for (i; i < times; i++) {
      requests.push(
        provider.multiGetObjects({
          ids: ids.slice(i * max, (i + 1) * max),
          options,
        }),
      );
    }
    const response = await Promise.all(requests);
    return response.flat();
  }

  return await provider.multiGetObjects({
    ids,
    options,
  });
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
        ...(dynamicFields.data.map((item) => unstable_getObjectFields(item)) as T[]),
      ];
    }
  } while (dynamicFields.hasNextPage);

  return data;
}
