/**
 * `prepareTradeCoins` builds the `vector<Coin<T>>` a liquidity entry point expects.
 *
 * Amounts are delegated to the `CoinWithBalance` intent instead of selecting coin objects by hand:
 * the intent also covers funds held in the address balance (accumulator), which `listCoins` cannot
 * see. The previous `coin::zero` fallback made the Move call abort while splitting an amount out of
 * an empty coin (`sui::balance::ENotEnough`, abort code 2).
 */
import { Transaction } from '@mysten/sui/transactions';
import Decimal from 'decimal.js';
import { Network } from '../src/constants';
import { TurbosSdk } from '../src/sdk';

const OWNER = '0x' + '22'.repeat(32);
const SUI = '0x2::sui::SUI';
const USDC = '0x' + '33'.repeat(32) + '::usdc::USDC';
const SUI_FRAMEWORK = '0x' + '0'.repeat(63) + '2';

function sdkWithCoins(objects: { objectId: string; balance: string }[] = []) {
  const listCoins = vitest.fn().mockResolvedValue({ objects, hasNextPage: false });
  const sdk = new TurbosSdk(Network.mainnet, { core: { listCoins } } as never);
  return { sdk, listCoins };
}

const prepare = async (coinType: string, amount: string) => {
  const { sdk, listCoins } = sdkWithCoins();
  const txb = new Transaction();
  const coins = await sdk.coin.prepareTradeCoins(
    txb,
    OWNER,
    coinType,
    new Decimal(amount),
  );
  return { coins, commands: txb.getData().commands, listCoins, data: txb.getData() };
};

test('zero amount still yields a placeholder coin', async () => {
  const { commands, listCoins } = await prepare(USDC, '0');

  expect(listCoins).not.toHaveBeenCalled();
  expect(commands).toHaveLength(1);
  expect(commands[0]!.$kind).toBe('MoveCall');
  expect(commands[0]).toMatchObject({
    MoveCall: {
      package: SUI_FRAMEWORK,
      module: 'coin',
      function: 'zero',
      typeArguments: [USDC],
    },
  });
});

test('amounts resolve through a CoinWithBalance intent, not manual coin selection', async () => {
  const { commands, listCoins } = await prepare(USDC, '5000000');

  expect(listCoins).not.toHaveBeenCalled();
  expect(commands).toHaveLength(1);
  expect(commands[0]!.$kind).toBe('$Intent');
  expect(commands[0]).toMatchObject({
    $Intent: {
      name: 'CoinWithBalance',
      data: { type: USDC, balance: 5000000n, outputKind: 'coin' },
    },
  });
});

test('SUI keeps the gas coin fallback (useGasCoin stays at its default)', async () => {
  const { commands } = await prepare(SUI, '100000000');

  expect(commands).toStrictEqual([
    {
      $kind: '$Intent',
      $Intent: {
        name: 'CoinWithBalance',
        inputs: {},
        data: { type: 'gas', balance: 100000000n, outputKind: 'coin' },
      },
    },
  ]);
});

test('sender is set so the intent can be resolved at build time', async () => {
  const { data } = await prepare(USDC, '5000000');

  expect(data.sender).toBe(OWNER);
});
