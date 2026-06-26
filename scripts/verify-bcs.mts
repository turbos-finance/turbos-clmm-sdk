/**
 * BCS schema verification script (no JSON-RPC; pure gRPC self-check).
 *
 * Approach: fetch both content(BCS bytes) and json (core's JSON representation)
 * for the same real object, parse(content) with our schema, then compare against
 * json. Matching scalar values prove the field order is correct.
 *
 * Usage:
 *   npx tsx scripts/verify-bcs.mts <objectId> [pool|fee|position]
 *   # e.g. npx tsx scripts/verify-bcs.mts 0xabc... pool
 *
 * Connects to mainnet by default. For testnet:
 *   NETWORK=testnet npx tsx scripts/verify-bcs.mts ...
 *
 * Note: uses GrpcWebFetchTransport (fetch-based) by default. If you hit
 * transport/connection errors, the node likely has gRPC-web disabled — switch
 * to native gRPC:
 *   pnpm add -D @grpc/grpc-js @protobuf-ts/grpc-transport
 * and uncomment the native transport block below.
 */
import { SuiGrpcClient } from '@mysten/sui/grpc';
// import { GrpcTransport } from '@protobuf-ts/grpc-transport';
// import { ChannelCredentials } from '@grpc/grpc-js';
import { Pool, Fee, Position } from '../src/bcs/clmm';

const NETWORK = (process.env['NETWORK'] as 'mainnet' | 'testnet') ?? 'mainnet';
const BASE_URL =
  NETWORK === 'mainnet'
    ? 'https://fullnode.mainnet.sui.io:443'
    : 'https://fullnode.testnet.sui.io:443';

const SCHEMAS: Record<string, { parse(b: Uint8Array): unknown }> = {
  pool: Pool,
  fee: Fee,
  position: Position,
};

async function main() {
  const objectId = process.argv[2];
  const schemaName = (process.argv[3] ?? 'pool').toLowerCase();
  if (!objectId) {
    console.error('Usage: npx tsx scripts/verify-bcs.mts <objectId> [pool|fee|position]');
    process.exit(1);
  }
  const bcsSchema = SCHEMAS[schemaName];
  if (!bcsSchema) {
    console.error(
      `Unknown schema: ${schemaName}. Available: ${Object.keys(SCHEMAS).join(', ')}`,
    );
    process.exit(1);
  }

  const client = new SuiGrpcClient({ network: NETWORK, baseUrl: BASE_URL });
  // For native gRPC, comment out the line above and use:
  // const client = new SuiGrpcClient({
  //   network: NETWORK,
  //   transport: new GrpcTransport({
  //     host: BASE_URL.replace('https://', ''),
  //     channelCredentials: ChannelCredentials.createSsl(),
  //   }),
  // });

  const { object } = await client.core.getObject({
    objectId,
    include: { content: true, json: true },
  });

  if (!object.content) {
    console.error(
      'Object has no content (likely not a Move object, or it does not exist)',
    );
    process.exit(1);
  }

  const parsed = bcsSchema.parse(object.content) as Record<string, unknown>;

  console.log(`\n=== ${schemaName} @ ${objectId} (${NETWORK}) ===`);
  console.log('type:', object.type);
  console.log('\n--- BCS parsed (our schema) ---');
  console.log(JSON.stringify(parsed, bigintReplacer, 2));
  console.log('\n--- core json (reference) ---');
  console.log(JSON.stringify(object.json, bigintReplacer, 2));
  console.log(
    '\nField-by-field, compare the scalar values above (sqrt_price/fee/tick_spacing/liquidity, etc).',
  );
  console.log(
    'Match = schema field order is correct. Misaligned/garbled field = the schema is wrong before that field.',
  );
}

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === 'bigint' ? value.toString() : value;
}

main().catch((err) => {
  console.error('verification failed:', err);
  process.exit(1);
});
