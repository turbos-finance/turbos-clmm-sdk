import { JsonRpcProvider, localnetConnection } from '@mysten/sui.js';
import { Network, TurbosSdk } from '../src';

const sdk = new TurbosSdk(new JsonRpcProvider(localnetConnection), Network.localnet);

test('parse type arguments from pool.type', () => {
  const poolType =
    '0x2abcde::pool::Pool<0x2::sui::SUI, 0x1banana::usdc::USDC, 0x34567::fee3000bps::FEE3000BPS>';
  expect(sdk.pool['getPoolTypeArguments'](poolType)).toStrictEqual([
    '0x2::sui::SUI',
    '0x1banana::usdc::USDC',
    '0x34567::fee3000bps::FEE3000BPS',
  ]);
  expect(() => sdk.pool['getPoolTypeArguments']('some text')).toThrowError();
});

test.each(['a::sui::SUI', 'a.sui', 'SUI', 'sui', 'suik'])(
  'valid sui literal',
  (value) => {
    expect(sdk.pool['isSUI'](value)).toBeTruthy();
  },
);

test.each(['a::sbui', 'a.su', 'suki', 's ui', 'sometext'])(
  'invalid sui literal',
  (value) => {
    expect(sdk.pool['isSUI'](value)).toBeFalsy();
  },
);

test('minimum amount by slippage', () => {
  expect(sdk.pool['getMinimumAmountBySlippage'](10, 30).toString()).toBe('7');
  expect(sdk.pool['getMinimumAmountBySlippage'](10, 20).toString()).toBe('8');
  expect(sdk.pool['getMinimumAmountBySlippage'](10, 5).toString()).toBe('9.5');
  expect(sdk.pool['getMinimumAmountBySlippage'](10, 0).toString()).toBe('10');
});

test.each([-35, -1, 100, 101, 200])('invalid slippage', (slippage) => {
  expect(() => sdk.pool['getMinimumAmountBySlippage'](10, slippage)).toThrowError();
});
