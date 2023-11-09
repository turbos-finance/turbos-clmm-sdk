import { createSdk } from './helper/create-sdk';

const sdk = createSdk();

test.each([
  '0x2::sui::SUI',
  '0x2::sui::sui',
  '0x000000000000000000000000000000000000000000000000000002::sui::sui',
])('valid sui literal', (value) => {
  expect(sdk.coin.isSUI(value)).toBeTruthy();
});

test.each([
  '0x32::sui::sui',
  '0x234234234::sui::sui',
  'suki',
  '0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc::afsui::AFSUI',
  'sometext',
])('invalid sui literal', (value) => {
  expect(sdk.coin.isSUI(value)).toBeFalsy();
});
