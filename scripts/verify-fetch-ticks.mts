/**
 * fetchTicks gRPC migration end-to-end verification.
 *
 * Builds the same simulateTransaction as pool.ts::fetchTicks, pulls one page of
 * ticks, BCS-decodes via FetchTicksResultEvent, and prints scalars for the
 * first few ticks.
 *
 * Usage:
 *   npx tsx scripts/verify-fetch-ticks.mts <poolId>
 *
 * Mainnet by default. NETWORK=testnet to switch.
 *
 * Note: mainnet PackageId / Versioned are hardcoded below. For testnet,
 * edit the constants accordingly.
 */
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { FetchTicksResultEvent } from '../src/bcs/clmm';

const NETWORK = (process.env['NETWORK'] as 'mainnet' | 'testnet') ?? 'mainnet';
const BASE_URL =
  NETWORK === 'mainnet'
    ? 'https://fullnode.mainnet.sui.io:443'
    : 'https://fullnode.testnet.sui.io:443';

// mainnet contract config (matches the turbos contract.json fetched by the SDK)
const MAINNET = {
  PackageId: '0xa5a0c25c79e428eba04fb98b3fb2a34db45ab26d4c8faf0d7e39d66a63891e64',
  Versioned: '0xf1cf0e81048df168ebeb1b8030fad24b3e0b53ae827c25053fff0779c1445b6f',
};

async function main() {
  const poolId = process.argv[2];
  if (!poolId) {
    console.error('Usage: npx tsx scripts/verify-fetch-ticks.mts <poolId>');
    process.exit(1);
  }

  const client = new SuiGrpcClient({ network: NETWORK, baseUrl: BASE_URL });

  // 1. Extract type arguments from the pool object
  const { object } = await client.core.getObject({
    objectId: poolId,
    include: { content: true },
  });
  const type = object.type ?? '';
  const tArgs = type
    .split('<')[1]!
    .slice(0, -1)
    .split(',')
    .map((s) => s.trim());
  console.log('pool type args:', tArgs);

  // 2. Build the fetch_ticks call (identical to pool.ts)
  const tx = new Transaction();
  const limit = 900;
  tx.moveCall({
    target: `${MAINNET.PackageId}::pool_fetcher::fetch_ticks`,
    typeArguments: tArgs,
    arguments: [
      tx.object(poolId),
      tx.pure.vector('u32', []),
      tx.pure.bool(true),
      tx.pure.u64(limit),
      tx.object(MAINNET.Versioned),
    ],
  });
  tx.setSender('0x0000000000000000000000000000000000000000000000000000000000000000');

  // 3. simulateTransaction
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
  console.log(`emitted ${events.length} events; types:`);
  for (const e of events) console.log('  -', e.eventType);

  const evt = events.find((e) =>
    e.eventType.includes('::pool_fetcher::FetchTicksResultEvent'),
  );
  if (!evt) {
    console.error('FetchTicksResultEvent missing');
    process.exit(1);
  }

  const decoded = FetchTicksResultEvent.parse(evt.bcs);

  console.log(`\ndecoded ticks count: ${decoded.ticks.length}`);
  console.log('next_cursor:', decoded.next_cursor);
  console.log('\n--- first 3 tick scalars ---');
  for (const t of decoded.ticks.slice(0, 3)) {
    console.log({
      id: t.id,
      tick_index_bits: t.tick_index.bits,
      liquidity_gross: t.liquidity_gross.toString(),
      liquidity_net_bits: t.liquidity_net.bits.toString(),
      fee_growth_outside_a: t.fee_growth_outside_a.toString(),
      fee_growth_outside_b: t.fee_growth_outside_b.toString(),
      reward_growths_outside: t.reward_growths_outside.map((v) => v.toString()),
      initialized: t.initialized,
    });
  }

  // 4. Cross-check with JSON-RPC (same pool, small slice of ticks; compare parsedJson vs BCS)
  console.log('\n--- JSON-RPC parsedJson cross-check (same tx, same event) ---');
  const jsonRes = await fetch('https://fullnode.mainnet.sui.io:443', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_devInspectTransactionBlock',
      params: [
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        await tx.toJSON({ client }),
      ],
    }),
  });
  const json = await jsonRes.json();
  const e0 = json?.result?.events?.find?.((e: any) =>
    String(e.type).includes('FetchTicksResultEvent'),
  );
  console.log('parsedJson.ticks[0]:', e0?.parsedJson?.ticks?.[0]);
  console.log('parsedJson.next_cursor:', e0?.parsedJson?.next_cursor);
}

main().catch((err) => {
  console.error('verification failed:', err);
  process.exit(1);
});
