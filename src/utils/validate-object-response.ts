import {
  SuiObjectResponse,
  getObjectDeletedResponse,
  getObjectId,
  getObjectNotExistsResponse,
} from '@mysten/sui.js';

export const validateObjectResponse = (
  obj: SuiObjectResponse,
  key: string,
): obj is { data: NonNullable<SuiObjectResponse['data']> } => {
  const objectId = getObjectId(obj);

  if (getObjectDeletedResponse(obj)) {
    throw new Error(`${key}(${objectId}) had been deleted`);
  }

  if (getObjectNotExistsResponse(obj)) {
    throw new Error(`${key}(${objectId}) is not found`);
  }

  return true;
};
