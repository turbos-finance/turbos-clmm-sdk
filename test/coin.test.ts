import { createSdk } from './helper/create-sdk';

const sdk = createSdk();

test.each(['a::sui::SUI', '0x2::sui::sui', '0x000000000000002::sui::sui'])(
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
