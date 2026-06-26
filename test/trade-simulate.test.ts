/**
 * Trade simulation adapter tests (sui 2.0 migration).
 *
 * devInspectTransactionBlock was replaced by core.simulateTransaction and
 * SwapEvent decoding moved from event.parsedJson to BCS bytes. These tests run
 * against a mocked ClientWithCoreApi (no network).
 */
import { Transaction } from '@mysten/sui/transactions';
import { TurbosSdk } from '../src/sdk';
import { Network, MIN_SQRT_PRICE, MAX_SQRT_PRICE } from '../src/constants';
import { SwapEvent as SwapEventBcs } from '../src/bcs/clmm';
import Decimal from 'decimal.js';

const POOL = '0x' + '11'.repeat(32);
const SENDER = '0x' + '22'.repeat(32);

const swapEventBytes = (
  overrides: Partial<Parameters<typeof SwapEventBcs.serialize>[0]> = {},
) =>
  SwapEventBcs.serialize({
    pool: POOL,
    recipient: SENDER,
    amount_a: '1000',
    amount_b: '997',
    liquidity: '123456789',
    tick_current_index: { bits: 0xffffff9c }, // -100
    tick_pre_index: { bits: 0xffffffce }, // -50
    sqrt_price: '18446744073709551616',
    protocol_fee: '3',
    fee_amount: '30',
    a_to_b: true,
    is_exact_in: true,
    ...overrides,
  }).toBytes();

function sdkWithSimulateResult(result: unknown) {
  const core = {
    simulateTransaction: vitest.fn().mockResolvedValue(result),
  };
  const sdk = new TurbosSdk(Network.mainnet, { core } as never);
  return { sdk, core };
}

describe('simulateComputeSwapResult', () => {
  test('decodes pool::SwapEvent BCS into ComputedSwapResult strings', async () => {
    const { sdk, core } = sdkWithSimulateResult({
      $kind: 'Transaction',
      Transaction: {
        events: [
          // unrelated event must be ignored
          { eventType: '0xabc::foo::BarEvent', bcs: new Uint8Array([1, 2, 3]) },
          { eventType: '0xabc::pool::SwapEvent', bcs: swapEventBytes() },
        ],
      },
    });

    const txb = new Transaction();
    const results = await sdk.trade['simulateComputeSwapResult'](txb, SENDER);

    expect(core.simulateTransaction).toBeCalledTimes(1);
    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.pool).toBe(POOL);
    expect(r.amount_a).toBe('1000');
    expect(r.amount_b).toBe('997');
    expect(r.a_to_b).toBe(true);
    expect(r.is_exact_in).toBe(true);
    expect(r.sqrt_price).toBe('18446744073709551616');
    // two's complement bits survive; consumer converts via math.bitsToNumber
    expect(sdk.math.bitsToNumber(r.tick_current_index.bits)).toBe(-100);
    expect(sdk.math.bitsToNumber(r.tick_pre_index.bits)).toBe(-50);
  });

  test('keeps event order for multi-hop simulations', async () => {
    const { sdk } = sdkWithSimulateResult({
      $kind: 'Transaction',
      Transaction: {
        events: [
          { eventType: '0xabc::pool::SwapEvent', bcs: swapEventBytes({ amount_a: '1' }) },
          { eventType: '0xabc::pool::SwapEvent', bcs: swapEventBytes({ amount_a: '2' }) },
        ],
      },
    });
    const results = await sdk.trade['simulateComputeSwapResult'](
      new Transaction(),
      SENDER,
    );
    expect(results.map((r) => r.amount_a)).toStrictEqual(['1', '2']);
  });

  test('throws when the simulation fails', async () => {
    const { sdk } = sdkWithSimulateResult({ $kind: 'FailedTransaction' });
    await expect(
      sdk.trade['simulateComputeSwapResult'](new Transaction(), SENDER),
    ).rejects.toThrowError(/simulation failed/);
  });

  test('returns empty list when no events were emitted', async () => {
    const { sdk } = sdkWithSimulateResult({
      $kind: 'Transaction',
      Transaction: { events: undefined },
    });
    const results = await sdk.trade['simulateComputeSwapResult'](
      new Transaction(),
      SENDER,
    );
    expect(results).toHaveLength(0);
  });
});

describe('pure trade helpers', () => {
  const sdk = new TurbosSdk(Network.mainnet, { core: {} } as never);

  test('amountOutWithSlippage', () => {
    expect(sdk.trade.amountOutWithSlippage(new Decimal(1000), '1', true)).toBe('990');
    expect(sdk.trade.amountOutWithSlippage(new Decimal(1000), '1', false)).toBe('1010');
  });

  test('getDefaultSqrtPriceLimit', () => {
    expect(sdk.trade.getDefaultSqrtPriceLimit(true)).toBe(MIN_SQRT_PRICE);
    expect(sdk.trade.getDefaultSqrtPriceLimit(false)).toBe(MAX_SQRT_PRICE);
  });

  test('getFunctionNameAndTypeArguments single pool', () => {
    const types: [string, string, string] = [
      '0x2::sui::SUI',
      '0xb::usdc::USDC',
      '0xf::fee::FEE',
    ];
    expect(
      sdk.trade['getFunctionNameAndTypeArguments'](
        [types],
        '0x2::sui::SUI',
        '0xb::usdc::USDC',
      ),
    ).toStrictEqual({ functionName: 'swap_a_b', typeArguments: types });
    expect(
      sdk.trade['getFunctionNameAndTypeArguments'](
        [types],
        '0xb::usdc::USDC',
        '0x2::sui::SUI',
      ),
    ).toStrictEqual({ functionName: 'swap_b_a', typeArguments: types });
  });
});
