import { createSdk } from './helper/create-sdk';

const sdk = createSdk();

describe('parse pool type', () => {
  const poolType =
    '0x2abcde::pool::Pool<0x2::sui::SUI, 0x1banana::usdc::USDC, 0x34567::fee3000bps::FEE3000BPS>';
  const poolType1 = '0x2abcde::pool::Pool<0x2::sui::SUI, 0x1banana::usdc::USDC>';

  test('normal', () => {
    expect(sdk.pool.parsePoolType(poolType)).toStrictEqual([
      '0x2::sui::SUI',
      '0x1banana::usdc::USDC',
      '0x34567::fee3000bps::FEE3000BPS',
    ]);
    expect(sdk.pool.parsePoolType(poolType1)).toStrictEqual([
      '0x2::sui::SUI',
      '0x1banana::usdc::USDC',
    ]);
  });

  test('specific length', () => {
    expect(sdk.pool.parsePoolType(poolType, 3)).toHaveLength(3);
    expect(sdk.pool.parsePoolType(poolType1, 2)).toHaveLength(2);

    expect(() => sdk.pool.parsePoolType(poolType, 2)).toThrowError();
    expect(() => sdk.pool.parsePoolType(poolType1, 3)).toThrowError();
  });

  test('invalid type', () => {
    expect(() => sdk.pool.parsePoolType('some text')).toHaveLength(0);
  });
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
