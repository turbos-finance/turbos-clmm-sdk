import { createSdk } from './helper/create-sdk';

const sdk = createSdk();

test('parse type arguments from pool.type', () => {
  const poolType =
    '0x2abcde::pool::Pool<0x2::sui::SUI, 0x1banana::usdc::USDC, 0x34567::fee3000bps::FEE3000BPS>';
  expect(sdk.pool['parsePoolType'](poolType)).toStrictEqual([
    '0x2::sui::SUI',
    '0x1banana::usdc::USDC',
    '0x34567::fee3000bps::FEE3000BPS',
  ]);
  expect(() => sdk.pool['parsePoolType']('some text')).toThrowError();
});

test('minimum amount by slippage', () => {
  expect(sdk.pool['getMinimumAmountBySlippage'](10, 30).toString()).toBe('7');
  expect(sdk.pool['getMinimumAmountBySlippage'](10, 20).toString()).toBe('8');
  expect(sdk.pool['getMinimumAmountBySlippage'](30, 5).toString()).toBe('29');
  expect(sdk.pool['getMinimumAmountBySlippage'](30, 0).toString()).toBe('30');
});

test.each([-35, -1, 100, 101, 200])('invalid slippage', (slippage) => {
  expect(() => sdk.pool['getMinimumAmountBySlippage'](10, slippage)).toThrowError();
});
