import { JsonRpcProvider, testnetConnection } from '@mysten/sui.js';
import { TurbosSdk, Network } from '../src';

const sdk = new TurbosSdk(new JsonRpcProvider(testnetConnection), Network.testnet);

test.each(['a::sui::SUI', 'a.sui', 'SUI', 'sui', 'suik'])(
  'valid sui literal',
  (value) => {
    expect(sdk.coin.isSUI(value)).toBeTruthy();
  },
);

test.each(['a::sbui', 'a.su', 'suki', 's ui', 'sometext'])(
  'invalid sui literal',
  (value) => {
    expect(sdk.coin.isSUI(value)).toBeFalsy();
  },
);
