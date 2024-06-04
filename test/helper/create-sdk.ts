import { Network, TurbosSdk } from '../../src';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

export const createSdk = () =>
  new TurbosSdk(Network.testnet, new SuiClient({ url: getFullnodeUrl(Network.testnet) }));
