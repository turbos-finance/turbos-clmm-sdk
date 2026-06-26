/**
 * BCS schema self-consistency tests for the sui 2.0 gRPC migration (PR #43).
 *
 * Every schema in src/bcs/clmm.ts must round-trip (serialize -> parse) without
 * losing or reordering data. Field order mirrors the Move sources; a mismatch
 * here would produce silently misaligned garbage at runtime, so these tests
 * lock the schema shape down.
 */
import {
  I32,
  I128,
  Fee,
  Pool,
  Position,
  PoolSimpleInfo,
  PoolFactoryField,
  Tick,
  TickInfo,
  TurbosPositionNFT,
  FetchTicksResultEvent,
  SwapEvent,
  WithdrawEvent,
  Strategy,
  VaultInfo,
  VaultNft,
  LinkedTableNodeVaultInfo,
} from '../src/bcs/clmm';

const ADDR_A = '0x' + '11'.repeat(32);
const ADDR_B = '0x' + '22'.repeat(32);
const ADDR_C = '0x' + '33'.repeat(32);

describe('primitive wrappers', () => {
  test('I32 round-trip keeps raw bits (two-complement encoding untouched)', () => {
    // -443636 as u32 two's complement
    const negativeBits = 0xffffffff - 443636 + 1;
    expect(I32.parse(I32.serialize({ bits: negativeBits }).toBytes()).bits).toBe(
      negativeBits,
    );
    expect(I32.parse(I32.serialize({ bits: 443636 }).toBytes()).bits).toBe(443636);
  });

  test('I128 round-trip', () => {
    const bits = '340282366920938463463374607431768211455'; // u128 max
    expect(String(I128.parse(I128.serialize({ bits }).toBytes()).bits)).toBe(bits);
  });
});

describe('clmm core structs', () => {
  test('Fee round-trip', () => {
    const parsed = Fee.parse(
      Fee.serialize({ id: ADDR_A, fee: 3000, tick_spacing: 60 }).toBytes(),
    );
    expect(parsed.id).toBe(ADDR_A);
    expect(parsed.fee).toBe(3000);
    expect(parsed.tick_spacing).toBe(60);
  });

  test('Pool round-trip preserves every field', () => {
    const input = {
      id: ADDR_A,
      coin_a: '1000000000',
      coin_b: '2000000000',
      protocol_fees_a: '10',
      protocol_fees_b: '20',
      sqrt_price: '18446744073709551616', // 1.0 in X64
      tick_current_index: { bits: 0xfff93d0c }, // negative tick
      tick_spacing: 60,
      max_liquidity_per_tick: '11505743598341114571880798222544994',
      fee: 3000,
      fee_protocol: 30,
      unlocked: true,
      fee_growth_global_a: '123456789',
      fee_growth_global_b: '987654321',
      liquidity: '5000000000000',
      tick_map: { id: ADDR_B, size: '128' },
      deploy_time_ms: '1700000000000',
      reward_infos: [
        {
          id: ADDR_C,
          vault: ADDR_B,
          vault_coin_type: '0x2::sui::SUI',
          emissions_per_second: '1000000',
          growth_global: '99',
          manager: ADDR_A,
        },
      ],
      reward_last_updated_time_ms: '1700000000001',
    };
    const parsed = Pool.parse(Pool.serialize(input).toBytes());
    expect(parsed.id).toBe(ADDR_A);
    expect(String(parsed.coin_a)).toBe('1000000000');
    expect(String(parsed.sqrt_price)).toBe('18446744073709551616');
    expect(parsed.tick_current_index.bits).toBe(0xfff93d0c);
    expect(parsed.tick_spacing).toBe(60);
    expect(parsed.fee).toBe(3000);
    expect(parsed.unlocked).toBe(true);
    expect(String(parsed.liquidity)).toBe('5000000000000');
    expect(parsed.tick_map.id).toBe(ADDR_B);
    expect(parsed.reward_infos).toHaveLength(1);
    expect(parsed.reward_infos[0]!.vault_coin_type).toBe('0x2::sui::SUI');
    expect(String(parsed.reward_infos[0]!.emissions_per_second)).toBe('1000000');
    expect(String(parsed.reward_last_updated_time_ms)).toBe('1700000000001');
  });

  test('Position round-trip', () => {
    const parsed = Position.parse(
      Position.serialize({
        id: ADDR_A,
        tick_lower_index: { bits: 100 },
        tick_upper_index: { bits: 200 },
        liquidity: '777',
        fee_growth_inside_a: '1',
        fee_growth_inside_b: '2',
        tokens_owed_a: '3',
        tokens_owed_b: '4',
        reward_infos: [{ reward_growth_inside: '5', amount_owed: '6' }],
      }).toBytes(),
    );
    expect(parsed.tick_lower_index.bits).toBe(100);
    expect(parsed.tick_upper_index.bits).toBe(200);
    expect(String(parsed.liquidity)).toBe('777');
    expect(String(parsed.reward_infos[0]!.amount_owed)).toBe('6');
  });

  test('TurbosPositionNFT round-trip', () => {
    const parsed = TurbosPositionNFT.parse(
      TurbosPositionNFT.serialize({
        id: ADDR_A,
        name: 'Turbos Position',
        description: 'desc',
        img_url: 'https://example.com/nft.png',
        pool_id: ADDR_B,
        position_id: ADDR_C,
        coin_type_a: { name: '0x2::sui::SUI' },
        coin_type_b: { name: ADDR_B.slice(2) + '::usdc::USDC' },
        fee_type: { name: 'fee3000bps::FEE3000BPS' },
      }).toBytes(),
    );
    expect(parsed.pool_id).toBe(ADDR_B);
    expect(parsed.position_id).toBe(ADDR_C);
    expect(parsed.coin_type_a.name).toBe('0x2::sui::SUI');
  });

  test('PoolFactoryField (dynamic field Field<ID, PoolSimpleInfo>) round-trip', () => {
    const info = {
      pool_id: ADDR_A,
      pool_key: ADDR_B,
      coin_type_a: { name: 'a' },
      coin_type_b: { name: 'b' },
      fee_type: { name: 'f' },
      fee: 500,
      tick_spacing: 10,
    };
    const parsed = PoolFactoryField.parse(
      PoolFactoryField.serialize({ id: ADDR_C, name: ADDR_A, value: info }).toBytes(),
    );
    expect(parsed.value.pool_id).toBe(ADDR_A);
    expect(parsed.value.fee).toBe(500);
    expect(
      PoolSimpleInfo.parse(PoolSimpleInfo.serialize(info).toBytes()).tick_spacing,
    ).toBe(10);
  });

  test('Tick / TickInfo round-trip', () => {
    const tick = Tick.parse(
      Tick.serialize({
        id: ADDR_A,
        liquidity_gross: '1000',
        liquidity_net: { bits: '1000' },
        fee_growth_outside_a: '1',
        fee_growth_outside_b: '2',
        reward_growths_outside: ['3', '4', '5'],
        initialized: true,
      }).toBytes(),
    );
    expect(String(tick.liquidity_gross)).toBe('1000');
    expect(tick.initialized).toBe(true);
    expect(tick.reward_growths_outside).toHaveLength(3);

    const info = TickInfo.parse(
      TickInfo.serialize({
        id: ADDR_B,
        tick_index: { bits: 60 },
        liquidity_gross: '9',
        liquidity_net: { bits: '9' },
        fee_growth_outside_a: '0',
        fee_growth_outside_b: '0',
        reward_growths_outside: [],
        initialized: false,
      }).toBytes(),
    );
    expect(info.tick_index.bits).toBe(60);
    expect(info.initialized).toBe(false);
  });

  test('FetchTicksResultEvent round-trip incl. Option<I32> cursor', () => {
    const tickInfo = {
      id: ADDR_A,
      tick_index: { bits: 1 },
      liquidity_gross: '1',
      liquidity_net: { bits: '1' },
      fee_growth_outside_a: '0',
      fee_growth_outside_b: '0',
      reward_growths_outside: [],
      initialized: true,
    };
    const withCursor = FetchTicksResultEvent.parse(
      FetchTicksResultEvent.serialize({
        ticks: [tickInfo],
        next_cursor: { bits: 61 },
      }).toBytes(),
    );
    expect(withCursor.ticks).toHaveLength(1);
    expect(withCursor.next_cursor?.bits).toBe(61);

    const noCursor = FetchTicksResultEvent.parse(
      FetchTicksResultEvent.serialize({ ticks: [], next_cursor: null }).toBytes(),
    );
    expect(noCursor.ticks).toHaveLength(0);
    expect(noCursor.next_cursor).toBeNull();
  });

  test('SwapEvent round-trip', () => {
    const parsed = SwapEvent.parse(
      SwapEvent.serialize({
        pool: ADDR_A,
        recipient: ADDR_B,
        amount_a: '100',
        amount_b: '99',
        liquidity: '123456',
        tick_current_index: { bits: 5 },
        tick_pre_index: { bits: 4 },
        sqrt_price: '18446744073709551616',
        protocol_fee: '1',
        fee_amount: '2',
        a_to_b: true,
        is_exact_in: false,
      }).toBytes(),
    );
    expect(parsed.pool).toBe(ADDR_A);
    expect(String(parsed.amount_a)).toBe('100');
    expect(parsed.a_to_b).toBe(true);
    expect(parsed.is_exact_in).toBe(false);
    expect(parsed.tick_pre_index.bits).toBe(4);
  });
});

describe('vault structs', () => {
  const vaultInfo = {
    vault_id: ADDR_A,
    strategy_id: ADDR_B,
    coin_a_type_name: { name: 'a::a::A' },
    coin_b_type_name: { name: 'b::b::B' },
    base_clmm_position_id: ADDR_C,
    base_lower_index: { bits: 10 },
    base_upper_index: { bits: 20 },
    base_liquidity: '1000',
    limit_clmm_position_id: ADDR_A,
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
    rewards: {
      contents: [
        {
          key: { name: 'r::r::R' },
          value: { reward: '1', reward_debt: '2', reward_harvested: '3' },
        },
      ],
    },
    management_fee_rate: '100',
    performance_fee_rate: null,
  };

  test('VaultInfo round-trip incl. VecMap rewards and Option fee rates', () => {
    const parsed = VaultInfo.parse(VaultInfo.serialize(vaultInfo).toBytes());
    expect(parsed.vault_id).toBe(ADDR_A);
    expect(String(parsed.base_liquidity)).toBe('1000');
    expect(parsed.rewards.contents).toHaveLength(1);
    expect(parsed.rewards.contents[0]!.key.name).toBe('r::r::R');
    expect(String(parsed.management_fee_rate)).toBe('100');
    expect(parsed.performance_fee_rate).toBeNull();
  });

  test('LinkedTableNodeVaultInfo round-trip (prev/next Options)', () => {
    const parsed = LinkedTableNodeVaultInfo.parse(
      LinkedTableNodeVaultInfo.serialize({
        prev: null,
        next: ADDR_B,
        value: vaultInfo,
      }).toBytes(),
    );
    expect(parsed.prev).toBeNull();
    expect(parsed.next).toBe(ADDR_B);
    expect(parsed.value.strategy_id).toBe(ADDR_B);
  });

  test('Strategy round-trip', () => {
    const parsed = Strategy.parse(
      Strategy.serialize({
        id: ADDR_A,
        clmm_pool_id: ADDR_B,
        effective_tick_lower: { bits: 1 },
        effective_tick_upper: { bits: 2 },
        total_share: '99',
        rewarders: [{ name: 'r::r::R' }],
        coin_a_type_name: { name: 'a::a::A' },
        coin_b_type_name: { name: 'b::b::B' },
        fee_type_name: { name: 'f::f::F' },
        vaults: { id: ADDR_C, size: '2', head: ADDR_A, tail: ADDR_B },
        vault_index: '7',
        accounts: { id: ADDR_C, size: '2' },
        management_fee_rate: '100',
        performance_fee_rate: '200',
        protocol_fees: { id: ADDR_A, size: '0' },
        image_url: 'https://img',
        tick_spacing: 60,
        default_base_rebalance_percentage: 5,
        default_limit_rebalance_percentage: 6,
        base_tick_step_minimum: 7,
        limit_tick_step_minimum: 8,
        status: 0,
      }).toBytes(),
    );
    expect(parsed.vaults.id).toBe(ADDR_C);
    expect(parsed.vaults.head).toBe(ADDR_A);
    expect(String(parsed.vault_index)).toBe('7');
    expect(parsed.status).toBe(0);
    expect(parsed.rewarders[0]!.name).toBe('r::r::R');
  });

  test('VaultNft / WithdrawEvent round-trip', () => {
    const nft = VaultNft.parse(
      VaultNft.serialize({
        id: ADDR_A,
        index: '3',
        strategy_id: ADDR_B,
        coin_a_type_name: { name: 'a::a::A' },
        coin_b_type_name: { name: 'b::b::B' },
        name: 'Turbos Vault',
        description: 'd',
        url: 'https://u',
      }).toBytes(),
    );
    expect(nft.strategy_id).toBe(ADDR_B);
    expect(String(nft.index)).toBe('3');

    const wd = WithdrawEvent.parse(
      WithdrawEvent.serialize({
        vault_id: ADDR_A,
        strategy_id: ADDR_B,
        clmm_pool_id: ADDR_C,
        percentage: '1000000',
        burn_clmm_nft: true,
        amount_a: '10',
        amount_b: '20',
        protocol_fee_a_amount: '1',
        protocol_fee_b_amount: '2',
      }).toBytes(),
    );
    expect(String(wd.percentage)).toBe('1000000');
    expect(wd.burn_clmm_nft).toBe(true);
    expect(String(wd.amount_b)).toBe('20');
  });
});
