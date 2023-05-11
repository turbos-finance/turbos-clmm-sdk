import { JsonRpcProvider, testnetConnection } from '@mysten/sui.js';
import { Network, TurbosSdk } from '../../src';

export const createSdk = () =>
  new TurbosSdk(new JsonRpcProvider(testnetConnection), Network.testnet);
