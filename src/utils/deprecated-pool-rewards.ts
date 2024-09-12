/**
 * deprecated pool rewards position index
 */

const deprecatedPools: { [x: string]: number[] } = {
  '0x839595a83dbb6b076a0fddad42dd512b66c065aa7ef3d298daa00a327d53ab31': [0],
  '0x6a3be30a31f88d9055da7f26f53dd34c85bc5aab9028212361ccf67f5f00fd46': [0],
};

export const deprecatedPoolRewards = (pool: string, index: number) => {
  if (deprecatedPools[pool]) {
    return deprecatedPools[pool]!.includes(index);
  }
  return false;
};

export const isDeprecatedPool = (pool: string): boolean => {
  return !!deprecatedPools[pool];
};
