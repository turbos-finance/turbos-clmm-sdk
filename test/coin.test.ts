import { createSdk } from './helper/create-sdk';

const sdk = createSdk();

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
