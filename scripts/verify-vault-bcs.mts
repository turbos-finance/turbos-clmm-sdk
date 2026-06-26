/**
 * Vault BCS schema verification script (pure gRPC self-check).
 *
 * Same approach as verify-bcs.mts: fetch content(BCS) and json(core's default
 * representation) for the same object, parse(content) with our schema, then
 * compare scalar values field-by-field.
 *
 * Usage:
 *   # 1. Top-level Strategy object
 *   npx tsx scripts/verify-vault-bcs.mts <strategyId> strategy
 *
 *   # 2. LinkedTable<ID, VaultInfo> dynamic field inside Strategy (VaultInfo via Node).
 *   #    Third argument is the vault NFT ID (the dynamic field key).
 *   npx tsx scripts/verify-vault-bcs.mts <vaultsTableId> vault-info <vaultNftId>
 *
 *   # 3. User-held vault::Vault NFT
 *   npx tsx scripts/verify-vault-bcs.mts <vaultNftObjectId> vault-nft
 *
 * Mainnet by default. NETWORK=testnet to switch.
 */
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { bcs } from '@mysten/sui/bcs';
import {
  Strategy as StrategyBcs,
  VaultNft as VaultNftBcs,
  LinkedTableNodeVaultInfo,
} from '../src/bcs/clmm';

const NETWORK = (process.env['NETWORK'] as 'mainnet' | 'testnet') ?? 'mainnet';
const BASE_URL =
  NETWORK === 'mainnet'
    ? 'https://fullnode.mainnet.sui.io:443'
    : 'https://fullnode.testnet.sui.io:443';

async function main() {
  const objectId = process.argv[2];
  const kind = (process.argv[3] ?? 'strategy').toLowerCase();
  const vaultNftId = process.argv[4];

  if (!objectId) {
    console.error(
      'Usage: npx tsx scripts/verify-vault-bcs.mts <objectId> <strategy|vault-info|vault-nft> [vaultNftId]',
    );
    process.exit(1);
  }

  const client = new SuiGrpcClient({ network: NETWORK, baseUrl: BASE_URL });

  if (kind === 'strategy') {
    const { object } = await client.core.getObject({
      objectId,
      include: { content: true, json: true },
    });
    if (!object.content) {
      console.error('Strategy object has no content');
      process.exit(1);
    }
    const parsed = StrategyBcs.parse(object.content) as Record<string, unknown>;
    print('strategy', objectId, object.type, parsed, object.json);
  } else if (kind === 'vault-info') {
    if (!vaultNftId) {
      console.error('vault-info mode requires vaultNftId as the 4th argument');
      process.exit(1);
    }
    const { dynamicField } = await client.core.getDynamicField({
      parentId: objectId,
      name: {
        type: '0x2::object::ID',
        bcs: bcs.Address.serialize(vaultNftId).toBytes(),
      },
    });
    if (!dynamicField.value.bcs) {
      console.error('dynamicField.value.bcs is empty');
      process.exit(1);
    }
    const node = LinkedTableNodeVaultInfo.parse(dynamicField.value.bcs) as Record<
      string,
      unknown
    >;
    // DynamicFieldValue has no json field; for cross-checks use JSON-RPC (see README / manual curl).
    print(
      'vault-info(node)',
      `${objectId} / ${vaultNftId}`,
      dynamicField.value.type,
      node,
      undefined,
    );
  } else if (kind === 'vault-nft') {
    const { object } = await client.core.getObject({
      objectId,
      include: { content: true, json: true },
    });
    if (!object.content) {
      console.error('Vault NFT object has no content');
      process.exit(1);
    }
    const parsed = VaultNftBcs.parse(object.content) as Record<string, unknown>;
    print('vault-nft', objectId, object.type, parsed, object.json);
  } else {
    console.error(
      `Unknown mode: ${kind} (expected one of: strategy | vault-info | vault-nft)`,
    );
    process.exit(1);
  }
}

function print(name: string, id: string, type: unknown, parsed: unknown, json: unknown) {
  console.log(`\n=== ${name} @ ${id} (${NETWORK}) ===`);
  console.log('type:', type);
  console.log('\n--- BCS parsed (our schema) ---');
  console.log(JSON.stringify(parsed, bigintReplacer, 2));
  console.log('\n--- core json (reference) ---');
  console.log(JSON.stringify(json, bigintReplacer, 2));
  console.log(
    '\nCheck field-by-field: vault_id/strategy_id/u64/u128/I32.bits/TypeName.name etc.',
  );
  console.log(
    'Match = schema field order is correct. Garbled field = the schema is wrong before that field.',
  );
}

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === 'bigint' ? value.toString() : value;
}

main().catch((err) => {
  console.error('verification failed:', err);
  process.exit(1);
});
