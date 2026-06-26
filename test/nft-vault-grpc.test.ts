/**
 * NFT / Vault gRPC adapter tests (sui 2.0 migration, PR #43).
 *
 * Covers the "notable fix": Positions registry keys are attached via dof::add,
 * so getDynamicField must be called with the 0x2::dynamic_object_field::Wrapper
 * name type — plus the vault linked-table and simulateTransaction commandResults
 * decoding paths. All provider calls are mocked; no network involved.
 */
import { bcs } from '@mysten/sui/bcs';
import { TurbosSdk } from '../src/sdk';
import { Network } from '../src/constants';
import {
  Position as PositionBcs,
  Tick,
  LinkedTableNodeVaultInfo,
  VaultInfo,
} from '../src/bcs/clmm';
import type { Contract } from '../src/lib/contract';

const NFT_ID = '0x' + '11'.repeat(32);
const POSITION_ID = '0x' + '22'.repeat(32);
const POSITIONS_TABLE = '0x' + '33'.repeat(32);
const POOL_ID = '0x' + '44'.repeat(32);
const ADDR = '0x' + '55'.repeat(32);

const CONTRACT_CONFIG = {
  PackageId: '0x' + 'aa'.repeat(32),
  PackageIdOriginal: '0x' + 'ab'.repeat(32),
  PoolConfig: '0x' + 'ac'.repeat(32),
  Positions: POSITIONS_TABLE,
  PoolFactoryAdminCap: '0x' + 'ad'.repeat(32),
  Versioned: '0x' + 'ae'.repeat(32),
  PoolTableId: '0x' + 'af'.repeat(32),
  VaultOriginPackageId: '0x' + 'ba'.repeat(32),
  VaultPackageId: '0x' + 'bb'.repeat(32),
  VaultGlobalConfig: '0x' + 'bc'.repeat(32),
  VaultRewarderManager: '0x' + 'bd'.repeat(32),
  VaultUserTierConfig: '0x' + 'be'.repeat(32),
  AclConfig: '0x' + 'bf'.repeat(32),
} satisfies Contract.Config;

const positionBytes = PositionBcs.serialize({
  id: POSITION_ID,
  tick_lower_index: { bits: 0xffffff9c }, // -100
  tick_upper_index: { bits: 100 },
  liquidity: '424242',
  fee_growth_inside_a: '1',
  fee_growth_inside_b: '2',
  tokens_owed_a: '3',
  tokens_owed_b: '4',
  reward_infos: [],
}).toBytes();

function createSdkWithCore(core: Record<string, unknown>) {
  const sdk = new TurbosSdk(Network.mainnet, { core } as never);
  // contract.json normally comes from S3; stub it out.
  sdk.contract.getConfig = async () => CONTRACT_CONFIG;
  return sdk;
}

describe('nft.getPositionFields (DOF wrapper fix)', () => {
  test('wraps the key type in 0x2::dynamic_object_field::Wrapper<address>', async () => {
    const getDynamicField = vitest.fn().mockResolvedValue({
      dynamicField: { $kind: 'DynamicObject', childId: POSITION_ID },
    });
    const getObject = vitest.fn().mockResolvedValue({
      object: {
        objectId: POSITION_ID,
        type: 'x::position_manager::Position',
        content: positionBytes,
      },
    });
    const sdk = createSdkWithCore({ getDynamicField, getObject });

    const fields = await sdk.position.getPositionFields(NFT_ID);

    expect(getDynamicField).toBeCalledTimes(1);
    const arg = getDynamicField.mock.calls[0]![0]!;
    expect(arg.parentId).toBe(POSITIONS_TABLE);
    // THE fix: without the Wrapper type the derived fieldId points at a
    // non-existent child object (phantom childIds).
    expect(arg.name.type).toBe('0x2::dynamic_object_field::Wrapper<address>');
    expect(arg.name.bcs).toStrictEqual(bcs.Address.serialize(NFT_ID).toBytes());

    expect(getObject).toBeCalledTimes(1);
    expect(getObject.mock.calls[0]![0]!.objectId).toBe(POSITION_ID);
    expect(String(fields.liquidity)).toBe('424242');
    expect(sdk.math.bitsToNumber(fields.tick_lower_index.bits)).toBe(-100);
  });

  test('throws when the registry entry is not a DynamicObject', async () => {
    const sdk = createSdkWithCore({
      getDynamicField: vitest.fn().mockResolvedValue({
        dynamicField: { $kind: 'DynamicField', value: { bcs: new Uint8Array() } },
      }),
    });
    await expect(sdk.position.getPositionFields(NFT_ID)).rejects.toThrowError(
      /not found/,
    );
  });
});

describe('nft.getPositionTick', () => {
  const tickBytes = Tick.serialize({
    id: '0x' + '66'.repeat(32),
    liquidity_gross: '1000',
    liquidity_net: { bits: '340282366920938463463374607431768211449' }, // -7 in i128
    fee_growth_outside_a: '11',
    fee_growth_outside_b: '12',
    reward_growths_outside: ['1', '2', '3'],
    initialized: true,
  }).toBytes();

  test('decodes the Tick dynamic field and converts I32/I128 bits', async () => {
    const getDynamicField = vitest.fn().mockResolvedValue({
      dynamicField: { value: { bcs: tickBytes } },
    });
    const sdk = createSdkWithCore({ getDynamicField });

    const tick = await sdk.position.getPositionTick(POOL_ID, { bits: 0xffffff9c });
    expect(tick).toBeDefined();
    expect(tick!.tickIndex).toBe(-100);
    expect(tick!.initialized).toBe(true);
    expect(tick!.liquidityGross.toString()).toBe('1000');
    expect(tick!.liquidityNet.toString()).toBe('-7');
    expect(tick!.rewardGrowthsOutside.map(String)).toStrictEqual(['1', '2', '3']);

    // name must be typed as the original package's I32
    const arg = getDynamicField.mock.calls[0]![0]!;
    expect(arg.parentId).toBe(POOL_ID);
    expect(arg.name.type).toBe(`${CONTRACT_CONFIG.PackageIdOriginal}::i32::I32`);
  });

  test('returns undefined when the tick field does not exist (core throws)', async () => {
    const sdk = createSdkWithCore({
      getDynamicField: vitest.fn().mockRejectedValue(new Error('not found')),
    });
    await expect(
      sdk.position.getPositionTick(POOL_ID, { bits: 60 }),
    ).resolves.toBeUndefined();
  });
});

describe('nft.getOwner', () => {
  test.each([
    [{ AddressOwner: ADDR }, ADDR],
    [{ ObjectOwner: POOL_ID }, POOL_ID],
    ['Immutable', undefined],
    [{ Shared: { initialSharedVersion: '1' } }, undefined],
  ])('owner %#', async (owner, expected) => {
    const sdk = createSdkWithCore({
      getObject: vitest.fn().mockResolvedValue({
        object: { objectId: NFT_ID, owner, content: null },
      }),
    });
    await expect(sdk.position.getOwner(NFT_ID)).resolves.toBe(expected);
  });
});

describe('vault linked-table reads', () => {
  const vaultInfo = {
    vault_id: '0x' + '77'.repeat(32),
    strategy_id: '0x' + '88'.repeat(32),
    coin_a_type_name: { name: 'a::a::A' },
    coin_b_type_name: { name: 'b::b::B' },
    base_clmm_position_id: POSITION_ID,
    base_lower_index: { bits: 10 },
    base_upper_index: { bits: 20 },
    base_liquidity: '1000',
    limit_clmm_position_id: POSITION_ID,
    limit_lower_index: { bits: 30 },
    limit_upper_index: { bits: 40 },
    limit_liquidity: '2000',
    sqrt_price: '18446744073709551616',
    base_last_tick_index: { bits: 11 },
    limit_last_tick_index: { bits: 31 },
    base_rebalance_threshold: 1,
    limit_rebalance_threshold: 2,
    base_tick_step: 3,
    limit_tick_step: 4,
    share: '555',
    rewards: { contents: [] },
    management_fee_rate: null,
    performance_fee_rate: null,
  };

  test('getStrategyVault unwraps linked_table::Node<ID, VaultInfo>', async () => {
    const nodeBytes = LinkedTableNodeVaultInfo.serialize({
      prev: null,
      next: null,
      value: vaultInfo,
    }).toBytes();
    const getDynamicField = vitest.fn().mockResolvedValue({
      dynamicField: { value: { bcs: nodeBytes } },
    });
    const sdk = createSdkWithCore({ getDynamicField });

    const tableId = '0x' + '99'.repeat(32);
    const vaultNftId = '0x' + '9a'.repeat(32);
    const info = await sdk.vault['getStrategyVault'](tableId, vaultNftId);

    const arg = getDynamicField.mock.calls[0]![0]!;
    expect(arg.parentId).toBe(tableId);
    expect(arg.name.type).toBe('0x2::object::ID');
    expect(arg.name.bcs).toStrictEqual(bcs.Address.serialize(vaultNftId).toBytes());

    expect(info.vault_id).toBe(vaultInfo.vault_id);
    expect(String(info.base_liquidity)).toBe('1000');
    // sanity: the schema itself round-trips
    expect(VaultInfo.parse(VaultInfo.serialize(vaultInfo).toBytes()).share).toStrictEqual(
      info.share,
    );
  });
});

describe('vault.getVaultBalanceAmount (simulateTransaction commandResults)', () => {
  const options = {
    strategyId: '0x' + '88'.repeat(32),
    vaultId: '0x' + '77'.repeat(32),
    coinTypeA: '0x2::sui::SUI',
    coinTypeB: '0x2::sui::SUI',
    address: ADDR,
  };

  test('decodes u64 return values of both moveCalls', async () => {
    const simulateTransaction = vitest.fn().mockResolvedValue({
      $kind: 'Transaction',
      commandResults: [
        { returnValues: [{ bcs: bcs.U64.serialize('12345').toBytes() }] },
        { returnValues: [{ bcs: bcs.U64.serialize('67890').toBytes() }] },
      ],
      Transaction: {},
    });
    const sdk = createSdkWithCore({ simulateTransaction });
    await expect(sdk.vault.getVaultBalanceAmount(options)).resolves.toStrictEqual([
      '12345',
      '67890',
    ]);
  });

  test('falls back to zeros on failed simulation', async () => {
    const sdk = createSdkWithCore({
      simulateTransaction: vitest.fn().mockResolvedValue({ $kind: 'FailedTransaction' }),
    });
    await expect(sdk.vault.getVaultBalanceAmount(options)).resolves.toStrictEqual([
      '0',
      '0',
    ]);
  });

  test('falls back to zeros when commandResults are missing', async () => {
    const sdk = createSdkWithCore({
      simulateTransaction: vitest.fn().mockResolvedValue({
        $kind: 'Transaction',
        Transaction: {},
      }),
    });
    await expect(sdk.vault.getVaultBalanceAmount(options)).resolves.toStrictEqual([
      '0',
      '0',
    ]);
  });
});

describe('vault.getCalculateVaultStepTick', () => {
  const sdk = createSdkWithCore({});

  test('builds a (step+1)*spacing window aligned to tick spacing', () => {
    // sqrt price of tick 0 => current index 0
    const sqrtAtZero = sdk.math.tickIndexToSqrtPriceX64(0).toString();
    expect(sdk.vault.getCalculateVaultStepTick(2, '60', sqrtAtZero)).toStrictEqual([
      -180, 180,
    ]);
  });

  test('clamps to MIN/MAX tick index', () => {
    const sqrtAtZero = sdk.math.tickIndexToSqrtPriceX64(0).toString();
    const [lower, upper] = sdk.vault.getCalculateVaultStepTick(100000, '60', sqrtAtZero);
    expect(lower).toBe(-443636);
    expect(upper).toBe(443636);
  });
});
