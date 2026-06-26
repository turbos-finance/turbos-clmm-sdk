/**
 * computeSwapResult gRPC migration end-to-end verification.
 *
 * Builds a pool_fetcher::compute_swap_result moveCall, then uses
 * simulateTransaction + SwapEvent BCS decoding and cross-checks against event.json.
 *
 * Usage: npx tsx scripts/verify-compute-swap.mts <poolId>
 */
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { SwapEvent as SwapEventBcs } from '../src/bcs/clmm';

const NETWORK = (process.env['NETWORK'] as 'mainnet' | 'testnet') ?? 'mainnet';
const BASE_URL =
  NETWORK === 'mainnet'
    ? 'https://fullnode.mainnet.sui.io:443'
    : 'https://fullnode.testnet.sui.io:443';

const MAINNET = {
  PackageId: '0xa5a0c25c79e428eba04fb98b3fb2a34db45ab26d4c8faf0d7e39d66a63891e64',
  Versioned: '0xf1cf0e81048df168ebeb1b8030fad24b3e0b53ae827c25053fff0779c1445b6f',
};

async function main() {
  const poolId = process.argv[2];
  if (!poolId) {
    console.error('Usage: npx tsx scripts/verify-compute-swap.mts <poolId>');
    process.exit(1);
  }

  const client = new SuiGrpcClient({ network: NETWORK, baseUrl: BASE_URL });

  const { object } = await client.core.getObject({
    objectId: poolId,
    include: { content: true },
  });
  const tArgs = (object.type ?? '')
    .split('<')[1]!
    .slice(0, -1)
    .split(',')
    .map((s) => s.trim());

  const tx = new Transaction();
  tx.moveCall({
    target: `${MAINNET.PackageId}::pool_fetcher::compute_swap_result`,
    typeArguments: tArgs,
    arguments: [
      tx.object(poolId),
      tx.pure.bool(true),
      tx.pure.u128('1000000000'),
      tx.pure.bool(true),
      tx.pure.u128('4295048016'),
      tx.object('0x6'),
      tx.object(MAINNET.Versioned),
    ],
  });
  tx.setSender('0x0000000000000000000000000000000000000000000000000000000000000000');

  const result = await client.core.simulateTransaction({
    transaction: tx,
    checksEnabled: false,
    include: { events: true },
  });

  if (result.$kind === 'FailedTransaction') {
    console.error('simulation failed');
    process.exit(1);
  }

  const events = result.Transaction.events ?? [];
  const swap = events.find((e) => e.eventType.includes('::pool::SwapEvent'));
  if (!swap) {
    console.error('SwapEvent missing');
    process.exit(1);
  }

  const decoded = SwapEventBcs.parse(swap.bcs);
  console.log('--- BCS parsed (our schema) ---');
  console.log(JSON.stringify(decoded, bigintReplacer, 2));
  console.log('\n--- event.json (reference) ---');
  console.log(JSON.stringify(swap.json, bigintReplacer, 2));
  console.log(
    '\nIf both sides match, the SwapEvent schema is correct (pool/a_to_b/amount_a/b/fee_amount/tick_*.bits/sqrt_price/...).',
  );
}

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === 'bigint' ? value.toString() : value;
}

main().catch((err) => {
  console.error('verification failed:', err);
  process.exit(1);
});
