import { Network, TurbosSdk } from '../../src';
import { SuiGrpcClient } from '@mysten/sui/grpc';

export const createSdk = () =>
  new TurbosSdk(
    Network.testnet,
    new SuiGrpcClient({
      network: 'testnet',
      baseUrl: 'https://fullnode.testnet.sui.io:443',
    }),
  );
