import {
  SuiClient,
  SuiObjectDataOptions,
  SuiObjectResponse,
} from '@mysten/sui.js/client';

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
