import { bcs, type BcsType, type BcsStruct } from '@mysten/sui/bcs';

// Re-export so the dts emitter can name BcsStruct/BcsType through the SDK's
// public surface instead of pnpm-internal paths (avoids TS2742 on every
// bcs.struct() export below).
export type { BcsType, BcsStruct };

/**
 * BCS schemas for Turbos CLMM on-chain Move structs.
 *
 * Field order and types strictly mirror the Move sources (turbos-clmm/sources/*.move).
 * BCS encodes by field declaration order — any order/type mismatch yields silently
 * misaligned garbage that TypeScript cannot catch. Every schema MUST be verified
 * against the content of a real on-chain object.
 *
 * Usage: after core.getObject({ objectId, include: { content: true } }) returns BCS bytes,
 *   const fields = Pool.parse(object.content);
 */

// ---- primitives / shared types ----
// Sui UID = struct UID { id: ID }, ID = struct ID { bytes: address }; BCS = 32-byte address.
export const Uid = bcs.Address;

// Sui Balance<T> = struct { value: u64 }; BCS = u64. Parsed as a balance string.
export const BalanceValue = bcs.u64();

// turbos I32 (sources/lib/i32.move): struct I32 { bits: u32 }
export const I32 = bcs.struct('I32', {
  bits: bcs.u32(),
});

// Sui Table<K, V> = struct { id: UID, size: u64 } (metadata only; entries live in dynamic fields)
export const Table = bcs.struct('Table', {
  id: Uid,
  size: bcs.u64(),
});

// std::type_name::TypeName = struct { name: 0x1::ascii::String }; BCS = length-prefixed bytes
export const TypeName = bcs.struct('TypeName', {
  name: bcs.string(),
});

// ---- pool.move ----
// struct PoolRewardInfo has key, store { id, vault, vault_coin_type, emissions_per_second, growth_global, manager }
export const PoolRewardInfo = bcs.struct('PoolRewardInfo', {
  id: Uid,
  vault: bcs.Address,
  vault_coin_type: bcs.string(),
  emissions_per_second: bcs.u128(),
  growth_global: bcs.u128(),
  manager: bcs.Address,
});

export type PoolRewardInfoFields = ReturnType<typeof PoolRewardInfo.parse>;

// struct Pool<phantom A, B, Fee> has key, store { ... }（sources/pool.move:131）
export const Pool = bcs.struct('Pool', {
  id: Uid,
  coin_a: BalanceValue,
  coin_b: BalanceValue,
  protocol_fees_a: bcs.u64(),
  protocol_fees_b: bcs.u64(),
  sqrt_price: bcs.u128(),
  tick_current_index: I32,
  tick_spacing: bcs.u32(),
  max_liquidity_per_tick: bcs.u128(),
  fee: bcs.u32(),
  fee_protocol: bcs.u32(),
  unlocked: bcs.bool(),
  fee_growth_global_a: bcs.u128(),
  fee_growth_global_b: bcs.u128(),
  liquidity: bcs.u128(),
  tick_map: Table,
  deploy_time_ms: bcs.u64(),
  reward_infos: bcs.vector(PoolRewardInfo),
  reward_last_updated_time_ms: bcs.u64(),
});

export type PoolFields = ReturnType<typeof Pool.parse>;

// struct PositionRewardInfo has store { reward_growth_inside: u128, amount_owed: u64 }
export const PositionRewardInfo = bcs.struct('PositionRewardInfo', {
  reward_growth_inside: bcs.u128(),
  amount_owed: bcs.u64(),
});

export type PositionRewardInfoFields = ReturnType<typeof PositionRewardInfo.parse>;

// fee.move: struct Fee<phantom T> has key, store { id: UID, fee: u32, tick_spacing: u32 }
export const Fee = bcs.struct('Fee', {
  id: Uid,
  fee: bcs.u32(),
  tick_spacing: bcs.u32(),
});

// position_manager.move: struct Position has key, store { ... }
// Note: the on-chain position object is position_manager::Position (with tick_lower/upper_index),
// which is different from pool.move's Position — do not mix them up.
export const Position = bcs.struct('Position', {
  id: Uid,
  tick_lower_index: I32,
  tick_upper_index: I32,
  liquidity: bcs.u128(),
  fee_growth_inside_a: bcs.u128(),
  fee_growth_inside_b: bcs.u128(),
  tokens_owed_a: bcs.u64(),
  tokens_owed_b: bcs.u64(),
  reward_infos: bcs.vector(PositionRewardInfo),
});

export type PositionFields = ReturnType<typeof Position.parse>;

// ---- pool_factory.move ----
// struct PoolSimpleInfo has copy, store { pool_id, pool_key, coin_type_a/b, fee_type, fee, tick_spacing }
export const PoolSimpleInfo = bcs.struct('PoolSimpleInfo', {
  pool_id: bcs.Address,
  pool_key: bcs.Address,
  coin_type_a: TypeName,
  coin_type_b: TypeName,
  fee_type: TypeName,
  fee: bcs.u32(),
  tick_spacing: bcs.u32(),
});

// pools is Table<ID, PoolSimpleInfo>; each entry object is 0x2::dynamic_field::Field<ID, PoolSimpleInfo>
// Field BCS = { id: UID, name: Name, value: Value }
export const PoolFactoryField = bcs.struct('Field', {
  id: Uid,
  name: bcs.Address,
  value: PoolSimpleInfo,
});

// ---- tick / nft ----
// turbos I128 (sources/lib/i128.move): struct I128 { bits: u128 }
export const I128 = bcs.struct('I128', {
  bits: bcs.u128(),
});

// pool.move: struct Tick has key, store { id, liquidity_gross, liquidity_net:I128, fee_growth_outside_a/b, reward_growths_outside:vector<u128>, initialized }
export const Tick = bcs.struct('Tick', {
  id: Uid,
  liquidity_gross: bcs.u128(),
  liquidity_net: I128,
  fee_growth_outside_a: bcs.u128(),
  fee_growth_outside_b: bcs.u128(),
  reward_growths_outside: bcs.vector(bcs.u128()),
  initialized: bcs.bool(),
});

// position_nft.move: struct TurbosPositionNFT has key, store { ... }
// Url = sui::url::Url = { url: ascii::String }; BCS = string
export const TurbosPositionNFT = bcs.struct('TurbosPositionNFT', {
  id: Uid,
  name: bcs.string(),
  description: bcs.string(),
  img_url: bcs.string(),
  pool_id: bcs.Address,
  position_id: bcs.Address,
  coin_type_a: TypeName,
  coin_type_b: TypeName,
  fee_type: TypeName,
});

export type TurbosPositionNFTFields = ReturnType<typeof TurbosPositionNFT.parse>;

// Tick dynamic field on a pool: 0x2::dynamic_field::Field<I32, Tick>
export const PositionTickField = bcs.struct('Field', {
  id: Uid,
  name: I32,
  value: Tick,
});

// pool::TickInfo (pool_fetcher::fetch_ticks event element; copy+drop value type)
// Field order matches pool::TickInfo: id, tick_index, liquidity_gross, liquidity_net(I128),
// fee_growth_outside_a/b(u128), reward_growths_outside(vector<u128>), initialized
export const TickInfo = bcs.struct('TickInfo', {
  id: bcs.Address,
  tick_index: I32,
  liquidity_gross: bcs.u128(),
  liquidity_net: I128,
  fee_growth_outside_a: bcs.u128(),
  fee_growth_outside_b: bcs.u128(),
  reward_growths_outside: bcs.vector(bcs.u128()),
  initialized: bcs.bool(),
});

// pool_fetcher::FetchTicksResultEvent { ticks: vector<TickInfo>, next_cursor: Option<I32> }
export const FetchTicksResultEvent = bcs.struct('FetchTicksResultEvent', {
  ticks: bcs.vector(TickInfo),
  next_cursor: bcs.option(I32),
});

// ---- vault.move ----
// 0x2::bag::Bag has key, store { id: UID, size: u64 }
export const Bag = bcs.struct('Bag', {
  id: Uid,
  size: bcs.u64(),
});

// vault::VaultRewardInfo has store { reward, reward_debt, reward_harvested: u128 }
export const VaultRewardInfo = bcs.struct('VaultRewardInfo', {
  reward: bcs.u128(),
  reward_debt: bcs.u128(),
  reward_harvested: bcs.u128(),
});

// 0x2::vec_map::VecMap<TypeName, VaultRewardInfo>
// VecMap { contents: vector<Entry<K,V>> }, Entry { key: K, value: V }
export const VaultRewardVecMap = bcs.struct('VecMap', {
  contents: bcs.vector(
    bcs.struct('Entry', {
      key: TypeName,
      value: VaultRewardInfo,
    }),
  ),
});

// vault::VaultInfo has store { ... } (field order matches the Move source; BCS encodes in order)
export const VaultInfo = bcs.struct('VaultInfo', {
  vault_id: bcs.Address,
  strategy_id: bcs.Address,
  coin_a_type_name: TypeName,
  coin_b_type_name: TypeName,
  base_clmm_position_id: bcs.Address,
  base_lower_index: I32,
  base_upper_index: I32,
  base_liquidity: bcs.u128(),
  limit_clmm_position_id: bcs.Address,
  limit_lower_index: I32,
  limit_upper_index: I32,
  limit_liquidity: bcs.u128(),
  sqrt_price: bcs.u128(),
  base_last_tick_index: I32,
  limit_last_tick_index: I32,
  base_rebalance_threshold: bcs.u32(),
  limit_rebalance_threshold: bcs.u32(),
  base_tick_step: bcs.u32(),
  limit_tick_step: bcs.u32(),
  share: bcs.u128(),
  rewards: VaultRewardVecMap,
  management_fee_rate: bcs.option(bcs.u64()),
  performance_fee_rate: bcs.option(bcs.u64()),
});

export type VaultInfoFields = ReturnType<typeof VaultInfo.parse>;

// 0x2::linked_table::Node<ID, VaultInfo> (getDynamicField value.bcs)
// Node { prev: Option<K>, next: Option<K>, value: V }
export const LinkedTableNodeVaultInfo = bcs.struct('Node', {
  prev: bcs.option(bcs.Address),
  next: bcs.option(bcs.Address),
  value: VaultInfo,
});

// 0x2::linked_table::LinkedTable<ID, VaultInfo> metadata
// { id: UID, size: u64, head: Option<ID>, tail: Option<ID> }
export const VaultLinkedTable = bcs.struct('VaultLinkedTable', {
  id: Uid,
  size: bcs.u64(),
  head: bcs.option(bcs.Address),
  tail: bcs.option(bcs.Address),
});

// vault::Strategy has key { ... } (field order matches the on-chain Move source)
export const Strategy = bcs.struct('Strategy', {
  id: Uid,
  clmm_pool_id: bcs.Address,
  effective_tick_lower: I32,
  effective_tick_upper: I32,
  total_share: bcs.u128(),
  rewarders: bcs.vector(TypeName),
  coin_a_type_name: TypeName,
  coin_b_type_name: TypeName,
  fee_type_name: TypeName,
  vaults: VaultLinkedTable,
  vault_index: bcs.u64(),
  accounts: Table,
  management_fee_rate: bcs.u64(),
  performance_fee_rate: bcs.u64(),
  protocol_fees: Bag,
  image_url: bcs.string(),
  tick_spacing: bcs.u32(),
  default_base_rebalance_percentage: bcs.u32(),
  default_limit_rebalance_percentage: bcs.u32(),
  base_tick_step_minimum: bcs.u32(),
  limit_tick_step_minimum: bcs.u32(),
  status: bcs.u8(),
});

export type StrategyFields = ReturnType<typeof Strategy.parse>;

// vault::Vault (user-held NFT object)
export const VaultNft = bcs.struct('Vault', {
  id: Uid,
  index: bcs.u64(),
  strategy_id: bcs.Address,
  coin_a_type_name: TypeName,
  coin_b_type_name: TypeName,
  name: bcs.string(),
  description: bcs.string(),
  url: bcs.string(),
});

export type VaultNftFields = ReturnType<typeof VaultNft.parse>;

// ---- vault event BCS schemas ----
// vault::WithdrawEvent (emitted by vault::vault::withdraw_v2)
export const WithdrawEvent = bcs.struct('WithdrawEvent', {
  vault_id: bcs.Address,
  strategy_id: bcs.Address,
  clmm_pool_id: bcs.Address,
  percentage: bcs.u64(),
  burn_clmm_nft: bcs.bool(),
  amount_a: bcs.u64(),
  amount_b: bcs.u64(),
  protocol_fee_a_amount: bcs.u64(),
  protocol_fee_b_amount: bcs.u64(),
});

// pool::SwapEvent (emitted by swap_router; used by the vault onlyToken path)
export const SwapEvent = bcs.struct('SwapEvent', {
  pool: bcs.Address,
  recipient: bcs.Address,
  amount_a: bcs.u64(),
  amount_b: bcs.u64(),
  liquidity: bcs.u128(),
  tick_current_index: I32,
  tick_pre_index: I32,
  sqrt_price: bcs.u128(),
  protocol_fee: bcs.u64(),
  fee_amount: bcs.u64(),
  a_to_b: bcs.bool(),
  is_exact_in: bcs.bool(),
});
