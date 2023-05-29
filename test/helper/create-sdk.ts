import { JsonRpcProvider, testnetConnection } from '@mysten/sui.js';
import { Network, TurbosSdk } from '../../src';

export const createSdk = () =>
  new TurbosSdk(Network.testnet, new JsonRpcProvider(testnetConnection));
