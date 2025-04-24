import { normalizeStructTag, SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { Base } from './base';
import { validateObjectResponse } from '../utils/validate-object-response';
import { getObjectFields } from './legacy';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import { MAX_TICK_INDEX, MIN_TICK_INDEX } from '../constants';
import { ONE_MINUTE } from './trade';
import { bcs } from '@mysten/sui/bcs';
import { SuiObjectResponse } from '@mysten/sui/client';
import { NFT } from './nft';
import { unstable_getObjectFields } from '..';
import { forEacGetOwnedObjects, multiGetObjects } from '../utils/sui-kit';
import { isNullObjectId } from '../utils/is-null-object-id';

export declare module Vault {
  export interface VaultStrategyField {
    clmm_pool_id: string;
    id: {
      id: string;
    };
    coin_a_type_name: {
      fields: {
        name: string;
      };
      type: string;
    };
    coin_b_type_name: {
      fields: {
        name: string;
      };
      type: string;
    };
    effective_tick_lower: {
      fields: {
        bits: number;
      };
      type: string;
    };
    effective_tick_upper: {
      fields: {
        bits: number;
      };
      type: string;
    };
    total_share: string;

    vaults: {
      fields: {
        id: {
          id: string;
        };
      };
    };
    accounts: {
      fields: {
        id: {
          id: string;
        };
      };
    };
    default_base_rebalance_threshold: number;
    default_limit_rebalance_threshold: number;
    base_tick_step_minimum: number;
    limit_tick_step_minimum: number;
    fee_type_name: {
      fields: {
        name: string;
      };
    };
  }

  export interface VaultsIdMyStrategyVaultField {
    name: string;
    value: {
      fields: {
        value: {
          fields: {
            sqrt_price: string;
            strategy_id: string;
            vault_id: string;
            base_liquidity: string;
            limit_liquidity: string;
            limit_clmm_position_id: string;
            base_clmm_position_id: string;
            base_lower_index: {
              fields: {
                bits: number;
              };
            };
            base_upper_index: {
              fields: {
                bits: number;
              };
            };
            limit_lower_index: {
              fields: {
                bits: number;
              };
            };
            limit_upper_index: {
              fields: {
                bits: number;
              };
            };
            coin_a_type_name: {
              fields: {
                name: string;
              };
            };
            coin_b_type_name: {
              fields: {
                name: string;
              };
            };
          };
        };
      };
    };
  }

  export interface CreateAndDepositVaultArguments {
    txb?: Transaction;
    deadline?: number;
    address: string;
    strategyId: string;
    poolId: string;
    coinTypeA: string;
    coinTypeB: string;
    amountA: string;
    amountB: string;
    baseLowerIndex: number;
    baseUpperIndex: number;
    limitLowerIndex: number;
    limitUpperIndex: number;
    baseTickStep: number;
    limitTickStep: number;
  }

  export interface CreateVaultArguments
    extends Pick<
      Vault.CreateAndDepositVaultArguments,
      | 'strategyId'
      | 'txb'
      | 'address'
      | 'baseLowerIndex'
      | 'baseUpperIndex'
      | 'limitLowerIndex'
      | 'limitUpperIndex'
    > {}

  export interface DepositVaultArguments
    extends Pick<
      Vault.CreateAndDepositVaultArguments,
      | 'strategyId'
      | 'txb'
      | 'address'
      | 'deadline'
      | 'poolId'
      | 'coinTypeA'
      | 'coinTypeB'
      | 'amountA'
      | 'amountB'
    > {
    vaultId: string;
  }

  export interface WithdrawVaultArguments {
    txb?: Transaction;
    deadline?: number;
    slippage?: string | number;
    strategyId: string;
    vaultId: string;
    poolId: string;
    address: string;
    percentage: number;
    onlyTokenA?: boolean;
    onlyTokenB?: boolean;
  }

  export interface collectClmmRewardDirectReturnVaultArguments {
    txb?: Transaction;
    address: string;
    strategyId: string;
    poolId: string;
    vaultId: string;
  }

  export interface CloseVaultArguments {
    txb?: Transaction;
    strategyId: string;
    vaultId: string;
  }

  export interface withdrawAllVaultArguments
    extends WithdrawVaultArguments,
      collectClmmRewardDirectReturnVaultArguments,
      CloseVaultArguments {}

  export interface OnlyTokenSwapWithReturnOptions
    extends Pick<
      Vault.CreateAndDepositVaultArguments,
      | 'coinTypeA'
      | 'coinTypeB'
      | 'amountA'
      | 'amountB'
      | 'poolId'
      | 'address'
      | 'txb'
      | 'deadline'
    > {
    liquidity: string;
    sqrt_price: string;
    lowerIndex: number;
    upperIndex: number;
    a2b: boolean;
    slippage?: string | number;
  }

  export interface VaultWithdrawEvents {
    amount_a: string;
    amount_b: string;
    percentage: string;
  }

  export interface EventParseJson {
    a_to_b: boolean;
    amount_a: string;
    amount_b: string;
    tick_current_index: {
      bits: number;
    };
    tick_pre_index: {
      bits: number;
    };
  }

  export interface VaultBalanceAmountOptions {
    strategyId: string;
    vaultId: string;
    coinTypeA: string;
    coinTypeB: string;
    address: string;
  }

  export interface MyVaultOwnedObjects {
    description: string;
    id: { id: string };
    name: string;
    strategy_id: string;
    url: string;
    coin_a_type_name: {
      fields: {
        name: string;
      };
    };
    coin_b_type_name: {
      fields: {
        name: string;
      };
    };
  }

  export interface TurbosMyVaultPosition extends NFT.PositionField {
    tickLower: number;
    tickUpper: number;
    objectId: string;
  }

  export interface TurbosMyVault {
    coinTypeA: string;
    coinTypeB: string;
    strategyId: string;
    url: string;
    name: string;
    id: string;
    nftId: string;
    vaultId: string;
    baseLowerTick: number;
    baseUpperTick: number;
    limitLowerTick: number;
    limitUpperTick: number;
    sqrt_price: string;
    base_liquidity: string;
    limit_liquidity: string;
    clmm_pool_id: string;
    limit_clmm_position_id: string;
    base_clmm_position_id: string;
    accountsId: string;
    limit_clmm_position?: TurbosMyVaultPosition;
    base_clmm_position?: TurbosMyVaultPosition;
  }

  export interface TurbosVaultAmount
    extends Pick<
      TurbosMyVault,
      | 'strategyId'
      | 'vaultId'
      | 'base_liquidity'
      | 'limit_liquidity'
      | 'baseLowerTick'
      | 'baseUpperTick'
      | 'limitLowerTick'
      | 'limitUpperTick'
      | 'coinTypeA'
      | 'coinTypeB'
    > {
    address: string;
    poolSqrtPrice: string;
  }
}

export class Vault extends Base {
  async createAndDepositVault(
    options: Vault.CreateAndDepositVaultArguments,
  ): Promise<Transaction> {
    const {
      address,
      strategyId,
      poolId,
      coinTypeA,
      coinTypeB,
      baseLowerIndex,
      baseUpperIndex,
      limitLowerIndex,
      limitUpperIndex,
      baseTickStep,
      limitTickStep,
    } = options;
    let txb = options.txb || new Transaction();

    const contract = await this.contract.getConfig();
    const typeArguments = await this.pool.getPoolTypeArguments(poolId);

    let _baseLowerIndex = baseLowerIndex;
    let _baseUpperIndex = baseUpperIndex;
    let _limitLowerIndex = limitLowerIndex;
    let _limitUpperIndex = limitUpperIndex;
    let _sendCoinA: TransactionObjectArgument;
    let _sendCoinB: TransactionObjectArgument;

    if (options.amountA === '0' && options.amountB === '0') {
      return txb;
    } else if (options.amountB === '0' || options.amountA === '0') {
      // only A Token or B Token
      const poolFields = await this.pool.getPool(poolId);
      const swapWithReturnResult = await this.onlyTokenSwapWithReturn({
        liquidity: poolFields.liquidity,
        sqrt_price: poolFields.sqrt_price,
        lowerIndex: baseLowerIndex,
        upperIndex: baseUpperIndex,
        amountA: options.amountA,
        amountB: options.amountB,
        coinTypeA,
        coinTypeB,
        poolId,
        txb,
        address,
        deadline: options.deadline,
        a2b: options.amountB === '0' ? true : false,
      });

      const strategyFields = await this.getStrategy(strategyId);
      const [swapBaseLowerIndex, swapBaseUpperIndex] = this.getCalculateVaultStepTick(
        baseTickStep,
        poolFields.tick_spacing.toString(),
        swapWithReturnResult.swapResultSqrtPrice,
      );

      const [swapLimitLowerIndex, swapLimitUpperIndex] = this.getCalculateVaultStepTick(
        strategyFields.base_tick_step_minimum,
        poolFields.tick_spacing.toString(),
        swapWithReturnResult.swapResultSqrtPrice,
      );

      txb = swapWithReturnResult.txb;
      _baseLowerIndex = swapBaseLowerIndex;
      _baseUpperIndex = swapBaseUpperIndex;
      _limitLowerIndex = swapLimitLowerIndex;
      _limitUpperIndex = swapLimitUpperIndex;
      _sendCoinA = swapWithReturnResult.coinVecA!;
      _sendCoinB = swapWithReturnResult.coinVecB!;
    } else {
      // A Token and B Token
      const [sendCoinA, mergeCoinA] = await this.coin.takeAmountFromCoins(
        address,
        coinTypeA,
        Number(options.amountA),
        txb,
      );
      const [sendCoinB, mergeCoinB] = await this.coin.takeAmountFromCoins(
        address,
        coinTypeB,
        Number(options.amountB),
        txb,
      );

      _sendCoinA = sendCoinA!;
      _sendCoinB = sendCoinB!;

      const coins: TransactionObjectArgument[] = [];
      [mergeCoinA, mergeCoinB].forEach((item) => {
        if (item) {
          coins.push(item);
        }
      });

      if (coins.length > 0) {
        txb.transferObjects(coins, address);
      }
    }

    txb.moveCall({
      target: `${contract.VaultPackageId}::router::open_vault_and_deposit`,
      arguments: [
        txb.object(contract.VaultGlobalConfig),
        txb.object(contract.VaultRewarderManager),
        txb.object(strategyId),
        txb.object(poolId),
        txb.object(contract.Positions),
        _sendCoinA!,
        _sendCoinB!,
        txb.pure.u32(Number(Math.abs(_baseLowerIndex).toFixed(0))),
        txb.pure.bool(_baseLowerIndex < 0),
        txb.pure.u32(Number(Math.abs(_baseUpperIndex).toFixed(0))),
        txb.pure.bool(_baseUpperIndex < 0),
        txb.pure.u32(Number(Math.abs(_limitLowerIndex).toFixed(0))),
        txb.pure.bool(_limitLowerIndex < 0),
        txb.pure.u32(Number(Math.abs(_limitUpperIndex).toFixed(0))),
        txb.pure.bool(_limitUpperIndex < 0),
        txb.pure.u32(baseTickStep),
        txb.pure.u32(limitTickStep),
        txb.pure.address(address),
        txb.object(SUI_CLOCK_OBJECT_ID),
        txb.object(contract.Versioned),
      ],
      typeArguments: typeArguments,
    });

    return txb;
  }

  async createVault(options: Vault.CreateVaultArguments): Promise<Transaction> {
    const {
      strategyId,
      address,
      baseLowerIndex,
      baseUpperIndex,
      limitLowerIndex,
      limitUpperIndex,
    } = options;
    const txb = options.txb || new Transaction();
    const contract = await this.contract.getConfig();

    const fields = await this.getStrategy(strategyId);

    txb.moveCall({
      target: `${contract.VaultPackageId}::router::open_vault`,
      arguments: [
        txb.object(contract.VaultGlobalConfig),
        txb.object(strategyId),
        txb.pure.u32(Number(Math.abs(baseLowerIndex).toFixed(0))),
        txb.pure.bool(baseLowerIndex < 0),
        txb.pure.u32(Number(Math.abs(baseUpperIndex).toFixed(0))),
        txb.pure.bool(baseUpperIndex < 0),
        txb.pure.u32(Number(Math.abs(limitLowerIndex).toFixed(0))),
        txb.pure.bool(limitLowerIndex < 0),
        txb.pure.u32(Number(Math.abs(limitUpperIndex).toFixed(0))),
        txb.pure.bool(limitUpperIndex < 0),
        txb.pure.address(address),
      ],
      typeArguments: [
        fields.coin_a_type_name.fields.name,
        fields.coin_b_type_name.fields.name,
      ],
    });

    return txb;
  }

  async depositVault(options: Vault.DepositVaultArguments): Promise<Transaction> {
    const { strategyId, vaultId, poolId, coinTypeA, coinTypeB, address } = options;

    let txb = options.txb || new Transaction();
    const contract = await this.contract.getConfig();
    const typeArguments = await this.pool.getPoolTypeArguments(poolId);

    let _sendCoinA: TransactionObjectArgument;
    let _sendCoinB: TransactionObjectArgument;

    if (!options.amountA && !options.amountB) {
      return txb;
    } else if (options.amountB === '0' || options.amountA === '0') {
      const strategyFields = await this.getStrategy(strategyId);
      const vaultFields = await this.getStrategyVault(
        strategyFields.vaults.fields.id.id,
        vaultId,
      );
      const poolFields = await this.pool.getPool(poolId);

      const baseLowerIndex = this.math.bitsToNumber(
        vaultFields.value.fields.value.fields.base_lower_index.fields.bits,
      );
      const baseUpperIndex = this.math.bitsToNumber(
        vaultFields.value.fields.value.fields.base_upper_index.fields.bits,
      );

      const swapWithReturnResult = await this.onlyTokenSwapWithReturn({
        liquidity: poolFields.liquidity,
        sqrt_price: poolFields.sqrt_price,
        lowerIndex: baseLowerIndex,
        upperIndex: baseUpperIndex,
        amountA: options.amountA,
        amountB: options.amountB,
        coinTypeA,
        coinTypeB,
        poolId,
        txb,
        address,
        deadline: options.deadline,
        a2b: options.amountB === '0' ? true : false,
      });

      txb = swapWithReturnResult.txb;
      _sendCoinA = swapWithReturnResult.coinVecA!;
      _sendCoinB = swapWithReturnResult.coinVecB!;
    } else {
      const [sendCoinA, mergeCoinA] = await this.coin.takeAmountFromCoins(
        address,
        coinTypeA,
        Number(options.amountA),
        txb,
      );
      const [sendCoinB, mergeCoinB] = await this.coin.takeAmountFromCoins(
        address,
        coinTypeB,
        Number(options.amountB),
        txb,
      );

      _sendCoinA = sendCoinA!;
      _sendCoinB = sendCoinB!;

      const coins: TransactionObjectArgument[] = [];
      [mergeCoinA, mergeCoinB].forEach((item) => {
        if (item) {
          coins.push(item);
        }
      });

      if (coins.length > 0) {
        txb.transferObjects(coins, address);
      }
    }

    txb.moveCall({
      target: `${contract.VaultPackageId}::router::deposit`,
      arguments: [
        txb.object(contract.VaultGlobalConfig),
        txb.object(contract.VaultRewarderManager),
        txb.object(strategyId),
        txb.object(vaultId),
        txb.object(poolId),
        txb.object(contract.Positions),
        _sendCoinA!,
        _sendCoinB!,
        txb.object(SUI_CLOCK_OBJECT_ID),
        // versioned
        txb.object(contract.Versioned),
      ],
      typeArguments: typeArguments,
    });

    return txb;
  }

  async withdrawVaultV2(options: Vault.WithdrawVaultArguments): Promise<Transaction> {
    const { strategyId, vaultId, poolId, address, percentage } = options;
    const txb = options.txb || new Transaction();

    if (options.onlyTokenA && options.onlyTokenB) {
      return txb;
    } else if (options.onlyTokenA || options.onlyTokenB) {
      return this.onlyTokenWithdrawVault(options);
    }

    const contract = await this.contract.getConfig();
    const typeArguments = await this.pool.getPoolTypeArguments(poolId);

    txb.moveCall({
      target: `${contract.VaultPackageId}::router::withdraw_v2`,
      arguments: [
        txb.object(contract.VaultGlobalConfig),
        txb.object(contract.VaultUserTierConfig),
        txb.object(contract.VaultRewarderManager),
        txb.object(strategyId),
        txb.object(vaultId),
        txb.object(poolId),
        txb.object(contract.Positions),
        txb.pure.u64(percentage),
        txb.pure.bool(percentage === 1000000),
        txb.pure.address(address),
        txb.object(SUI_CLOCK_OBJECT_ID),
        // versioned
        txb.object(contract.Versioned),
      ],
      typeArguments: typeArguments,
    });

    return txb;
  }

  async collectClmmRewardDirectReturnVault(
    options: Vault.collectClmmRewardDirectReturnVaultArguments,
  ): Promise<Transaction> {
    const { address, strategyId, poolId, vaultId } = options;
    const txb = options.txb || new Transaction();
    const contract = await this.contract.getConfig();
    const typeArguments = await this.pool.getPoolTypeArguments(poolId);

    const pool = await this.pool.getPool(poolId);

    pool.reward_infos.forEach((info, index) => {
      txb.moveCall({
        target: `${contract.VaultPackageId}::router::collect_clmm_reward_direct_return`,
        arguments: [
          txb.object(contract.VaultGlobalConfig),
          txb.object(strategyId),
          txb.object(vaultId),
          txb.object(poolId),
          txb.object(contract.Positions),
          txb.object(info.fields.vault), //clmm reward vault
          txb.pure.u64(index), // reward vault index
          txb.pure.address(address),
          txb.object(SUI_CLOCK_OBJECT_ID),
          // versioned
          txb.object(contract.Versioned),
        ],
        typeArguments: [...typeArguments, info.fields.vault_coin_type],
      });
    });

    return txb;
  }

  async closeVault(options: Vault.CloseVaultArguments): Promise<Transaction> {
    const { strategyId, vaultId } = options;
    const txb = options.txb || new Transaction();

    const contract = await this.contract.getConfig();
    const fields = await this.getStrategy(strategyId);

    txb.moveCall({
      target: `${contract.VaultPackageId}::router::close_vault`,
      arguments: [
        txb.object(contract.VaultGlobalConfig),
        txb.object(strategyId),
        txb.object(vaultId),
      ],
      typeArguments: [
        fields.coin_a_type_name.fields.name,
        fields.coin_b_type_name.fields.name,
      ],
    });

    return txb;
  }

  async withdrawAllVault(options: Vault.withdrawAllVaultArguments) {
    let txb = await this.collectClmmRewardDirectReturnVault(options);
    txb = await this.withdrawVaultV2({ txb, ...options });
    txb = await this.closeVault({ txb, ...options });
    return txb;
  }

  async computeTokenWithdrawVaultSwapResult(options: Vault.WithdrawVaultArguments) {
    const { poolId, strategyId, vaultId, percentage, address } = options;
    let txb = options.txb ? Transaction.from(options.txb) : new Transaction();

    txb = await this.collectClmmRewardDirectReturnVault(options);

    const contract = await this.contract.getConfig();
    const typeArguments = await this.pool.getPoolTypeArguments(poolId);

    const [coinVecA, coinVecB] = txb.moveCall({
      target: `${contract.VaultPackageId}::vault::withdraw_v2`,
      arguments: [
        txb.object(contract.VaultGlobalConfig),
        txb.object(contract.VaultUserTierConfig),
        txb.object(contract.VaultRewarderManager),
        txb.object(strategyId),
        txb.object(vaultId),
        txb.object(poolId),
        txb.object(contract.Positions),
        txb.pure.u64(percentage),
        txb.pure.bool(percentage === 1000000),
        txb.object(SUI_CLOCK_OBJECT_ID),
        // versioned
        txb.object(contract.Versioned),
      ],
      typeArguments: typeArguments,
    });

    const result = await this.provider.devInspectTransactionBlock({
      transactionBlock: txb,
      sender: address,
    });

    if (result.error) {
      throw new Error(result.error);
    }

    let amountA: string | undefined;
    let amountB: string | undefined;
    result.events.map((event) => {
      const eventResult = event.parsedJson as Vault.VaultWithdrawEvents;
      if (eventResult.percentage) {
        amountA = eventResult.amount_a;
        amountB = eventResult.amount_b;
      }
    });

    if (!amountA || !amountB) {
      throw new Error('event does not exist');
    }
    const a2b = options.onlyTokenB ? true : false;

    const [returnCoinA, returnCoinB] = txb.moveCall({
      target: `${contract.PackageId}::swap_router::swap_${
        a2b ? 'a_b' : 'b_a'
      }_with_return_`,
      typeArguments: typeArguments,
      arguments: [
        txb.object(poolId),
        txb.makeMoveVec({
          elements: [a2b ? coinVecA! : coinVecB!],
        }),
        txb.pure.u64(a2b ? amountA : amountB),
        txb.pure.u64(
          this.trade.amountOutWithSlippage(
            new Decimal(0),
            options.slippage?.toString() || '99',
            true,
          ),
        ),
        txb.pure.u128(
          this.math
            .tickIndexToSqrtPriceX64(a2b ? MIN_TICK_INDEX : MAX_TICK_INDEX)
            .toString(),
        ),
        txb.pure.bool(true),
        txb.pure.address(address),
        txb.pure.u64(Date.now() + (options.deadline || ONE_MINUTE * 3)),
        txb.object(SUI_CLOCK_OBJECT_ID),
        txb.object(contract.Versioned),
      ],
    });

    txb.transferObjects(
      [options.onlyTokenB ? coinVecB! : coinVecA!, returnCoinB!, returnCoinA!],
      address,
    );

    const finalSwapResult = await this.provider.devInspectTransactionBlock({
      transactionBlock: txb,
      sender: address,
    });

    let jsonResult: Vault.EventParseJson | undefined;
    finalSwapResult.events.map((event) => {
      const eventResult = event.parsedJson as Vault.EventParseJson;
      if (eventResult.a_to_b !== undefined) {
        jsonResult = eventResult;
      }
    });

    if (!jsonResult) {
      throw new Error('event does not exist');
    }

    const [coinA, coinB] = await Promise.all([
      this.coin.getMetadata(typeArguments[0]),
      this.coin.getMetadata(typeArguments[1]),
    ]);

    const _nextTickPrice = this.math.tickIndexToPrice(
      this.math.bitsToNumber(jsonResult.tick_current_index.bits),
      coinA.decimals,
      coinB.decimals,
    );

    const _sqrt_price = this.trade.sqrtPriceWithSlippage(
      _nextTickPrice,
      options.slippage?.toString() || '1',
      options.onlyTokenB ? true : false,
      coinA.decimals,
      coinB.decimals,
    );
    return {
      amountA,
      amountB,
      resultAmountA: jsonResult.amount_a,
      resultAmountB: jsonResult.amount_b,
      sqrt_price: _sqrt_price,
      current_index: this.math.bitsToNumber(jsonResult.tick_current_index.bits),
      prev_index: this.math.bitsToNumber(jsonResult.tick_pre_index.bits),
      a2b: jsonResult.a_to_b,
    };
  }

  protected async onlyTokenSwapWithReturn(options: Vault.OnlyTokenSwapWithReturnOptions) {
    const {
      coinTypeA,
      coinTypeB,
      liquidity,
      sqrt_price,
      lowerIndex,
      upperIndex,
      poolId,
      address,
      a2b,
    } = options;
    let txb = options.txb || new Transaction();

    const [coinA, coinB] = await Promise.all([
      this.coin.getMetadata(coinTypeA),
      this.coin.getMetadata(coinTypeB),
    ]);
    const current_price = this.math
      .sqrtPriceX64ToPrice(new BN(sqrt_price), coinA.decimals, coinB.decimals)
      .toString();

    const [bigAmountA, bigAmountB] = this.pool.getTokenAmountsFromLiquidity({
      liquidity: new BN(liquidity),
      currentSqrtPrice: new BN(sqrt_price),
      lowerSqrtPrice: this.math.tickIndexToSqrtPriceX64(lowerIndex),
      upperSqrtPrice: this.math.tickIndexToSqrtPriceX64(upperIndex),
    });

    const amountA = new Decimal(bigAmountA.toString()).div(10 ** coinA.decimals);
    const amountB = new Decimal(bigAmountB.toString()).div(10 ** coinB.decimals);
    const total = amountA.mul(current_price).add(amountB);

    const ratioB = amountB.div(total);
    const ratioA = new Decimal(1).sub(ratioB);
    const swapAmount = new Decimal(
      a2b ? options.amountA.toString() : options.amountB.toString(),
    )
      .mul(a2b ? ratioB : ratioA)
      .toFixed(0);

    const swapResult = await this.trade.computeSwapResultV2({
      pools: [
        {
          pool: poolId,
          a2b,
          amountSpecified: swapAmount,
        },
      ],
      amountSpecifiedIsInput: true,
      address,
    });

    const {
      txb: transaction,
      coinVecA,
      coinVecB,
    } = await this.trade.swapWithReturn({
      poolId,
      coinType: a2b ? coinTypeA : coinTypeB,
      amountA: a2b ? options.amountA : swapResult[0]!.amount_a,
      swapAmount: swapAmount,
      amountB: a2b ? swapResult[0]!.amount_b : options.amountB,
      nextTickIndex: this.math.bitsToNumber(swapResult[0]!.tick_current_index.bits),
      slippage: options.slippage?.toString() || '5',
      amountSpecifiedIsInput: true,
      a2b,
      address,
      deadline: options.deadline,
      txb: txb,
    });

    txb = transaction;

    return {
      txb,
      coinVecA,
      coinVecB,
      swapResultSqrtPrice: swapResult[0]!.sqrt_price,
    };
  }

  protected async onlyTokenWithdrawVault(options: Vault.WithdrawVaultArguments) {
    const { poolId, strategyId, vaultId, percentage, address } = options;

    let devTxb = options.txb ? Transaction.from(options.txb) : new Transaction();
    const res = await this.computeTokenWithdrawVaultSwapResult({
      ...options,
      txb: devTxb,
    });

    let txb = options.txb || new Transaction();
    const contract = await this.contract.getConfig();
    const typeArguments = await this.pool.getPoolTypeArguments(poolId);

    const [coinVecA, coinVecB] = txb.moveCall({
      target: `${contract.VaultPackageId}::vault::withdraw_v2`,
      arguments: [
        txb.object(contract.VaultGlobalConfig),
        txb.object(contract.VaultUserTierConfig),
        txb.object(contract.VaultRewarderManager),
        txb.object(strategyId),
        txb.object(vaultId),
        txb.object(poolId),
        txb.object(contract.Positions),
        txb.pure.u64(percentage),
        txb.pure.bool(percentage === 1000000),
        txb.object(SUI_CLOCK_OBJECT_ID),
        // versioned
        txb.object(contract.Versioned),
      ],
      typeArguments: typeArguments,
    });

    const a2b = options.onlyTokenB ? true : false;
    const [returnCoinA, returnCoinB] = txb.moveCall({
      target: `${contract.PackageId}::swap_router::swap_${
        a2b ? 'a_b' : 'b_a'
      }_with_return_`,
      typeArguments: typeArguments,
      arguments: [
        txb.object(poolId),
        txb.makeMoveVec({
          elements: [a2b ? coinVecA! : coinVecB!],
        }),
        txb.pure.u64(a2b ? res.amountA : res.amountB),
        txb.pure.u64(
          this.trade.amountOutWithSlippage(
            new Decimal(a2b ? res.resultAmountB : res.resultAmountA),
            options.slippage?.toString() || '1',
            true,
          ),
        ),
        txb.pure.u128(res.sqrt_price),
        txb.pure.bool(true),
        txb.pure.address(address),
        txb.pure.u64(Date.now() + (options.deadline || ONE_MINUTE * 3)),
        txb.object(SUI_CLOCK_OBJECT_ID),
        txb.object(contract.Versioned),
      ],
    });

    txb.transferObjects(
      [options.onlyTokenB ? coinVecB! : coinVecA!, returnCoinB!, returnCoinA!],
      address,
    );

    return txb;
  }

  protected async getStrategy(strategyId: string): Promise<Vault.VaultStrategyField> {
    return this.getCacheOrSet(
      `strategy-${strategyId}`,
      async () => {
        const result = await this.provider.getObject({
          id: strategyId,
          options: { showContent: true },
        });
        validateObjectResponse(result, 'strategyId');
        return getObjectFields(result) as unknown as Vault.VaultStrategyField;
      },
      1500,
    );
  }

  protected async getStrategyVault(
    vaultId: string,
    vaultValue: string,
  ): Promise<Vault.VaultsIdMyStrategyVaultField> {
    return this.getCacheOrSet(
      `vaultId-${vaultId}-${vaultValue}`,
      async () => {
        const result = await this.provider.getDynamicFieldObject({
          parentId: vaultId,
          name: {
            type: '0x2::object::ID',
            value: vaultValue,
          },
        });
        validateObjectResponse(result, 'vaultId-value');
        return getObjectFields(result) as unknown as Vault.VaultsIdMyStrategyVaultField;
      },
      1500,
    );
  }

  getCalculateVaultStepTick(
    step: number,
    tick_spacing: string,
    sqrt_price: string,
  ): [number, number] {
    const tick_space = Number(tick_spacing);
    const current_index = this.math.sqrtPriceX64ToTickIndex(new BN(sqrt_price));

    const lower_index =
      current_index - (current_index % tick_space) - (step + 1) * tick_space;
    const upper_index =
      current_index - (current_index % tick_space) + (step + 1) * tick_space;
    return [
      lower_index < MIN_TICK_INDEX ? MIN_TICK_INDEX : lower_index,
      upper_index > MAX_TICK_INDEX ? MAX_TICK_INDEX : upper_index,
    ];
  }

  async getVaultBalanceAmount(
    options: Vault.VaultBalanceAmountOptions,
  ): Promise<[string, string]> {
    const { strategyId, vaultId, coinTypeA, coinTypeB, address } = options;
    const txb = new Transaction();
    const vaultContract = await this.contract.getConfig();
    txb.moveCall({
      target: `${vaultContract.VaultPackageId}::vault::vault_balance_amount`,
      arguments: [txb.object(strategyId), txb.pure.address(vaultId)],
      typeArguments: [normalizeStructTag(coinTypeA)],
    });

    txb.moveCall({
      target: `${vaultContract.VaultPackageId}::vault::vault_balance_amount`,
      arguments: [txb.object(strategyId), txb.pure.address(vaultId)],
      typeArguments: [normalizeStructTag(coinTypeB)],
    });

    try {
      const result = await this.provider.devInspectTransactionBlock({
        transactionBlock: txb,
        sender: address,
      });

      if (result.error) {
        return ['0', '0'];
      }

      return [
        bcs.U64.parse(Uint8Array.from(result.results![0]!.returnValues![0]![0])),
        bcs.U64.parse(Uint8Array.from(result.results![1]!.returnValues![0]![0])),
      ];
    } catch (err) {
      console.log(`getVaultBalanceAmount error: ${err}`);
    }
    return ['0', '0'];
  }

  async getMyVaults(address: string) {
    const vaultContract = await this.contract.getConfig();

    const objects = await forEacGetOwnedObjects<Vault.MyVaultOwnedObjects>(
      this.provider,
      address,
      {
        StructType: `${vaultContract.VaultOriginPackageId}::vault::Vault`,
      },
    );

    if (objects.length === 0) {
      return [];
    }

    const strategyIds = objects.map((item) => item.strategy_id);
    const strategyObjects = await multiGetObjects(
      this.provider,
      Array.from(new Set(strategyIds)),
      {
        showContent: true,
      },
    );
    const obj: Record<
      string,
      { vaultId: string; clmm_pool_id: string; accountsId: string }
    > = {};
    strategyObjects.forEach((item) => {
      const fields = unstable_getObjectFields(
        item,
      ) as unknown as Vault.VaultStrategyField;
      obj[fields.id.id] = {
        vaultId: fields.vaults.fields.id.id,
        clmm_pool_id: fields.clmm_pool_id,
        accountsId: fields.accounts.fields.id.id,
      };
    });

    const gets: Promise<SuiObjectResponse>[] = [];
    objects.forEach((item) => {
      if (obj[item.strategy_id]?.vaultId) {
        gets.push(
          this.provider.getDynamicFieldObject({
            parentId: obj[item.strategy_id]!.vaultId,
            name: {
              type: '0x2::object::ID',
              value: item.id.id,
            },
          }),
        );
      }
    });

    if (gets.length < 1) {
      return [];
    }

    const vaultObjects = await Promise.all(gets);

    const myVaults: Vault.TurbosMyVault[] = objects.map((item) => {
      const res = vaultObjects.find((vault) => {
        const fields = unstable_getObjectFields(
          vault,
        ) as unknown as Vault.VaultsIdMyStrategyVaultField;
        return fields.name === item.id.id;
      })!;
      const fieldObject = unstable_getObjectFields(
        res,
      ) as unknown as Vault.VaultsIdMyStrategyVaultField;
      const field = fieldObject.value.fields.value.fields;

      return {
        accountsId: obj[item.strategy_id]!.accountsId,
        coinTypeA: item.coin_a_type_name.fields.name,
        coinTypeB: item.coin_b_type_name.fields.name,
        strategyId: item.strategy_id,
        url: item.url,
        name: item.name,
        id: item.id.id,
        nftId: item.id.id,
        vaultId: field.vault_id,
        baseLowerTick: this.math.bitsToNumber(field.base_lower_index.fields.bits),
        baseUpperTick: this.math.bitsToNumber(field.base_upper_index.fields.bits),
        limitLowerTick: this.math.bitsToNumber(field.limit_lower_index.fields.bits),
        limitUpperTick: this.math.bitsToNumber(field.limit_upper_index.fields.bits),
        sqrt_price: field.sqrt_price,
        base_liquidity: field.base_liquidity,
        limit_liquidity: field.limit_liquidity,
        clmm_pool_id: obj[item.strategy_id]!.clmm_pool_id,
        limit_clmm_position_id: field.limit_clmm_position_id,
        base_clmm_position_id: field.base_clmm_position_id,
      };
    });

    const vaultPositions: string[] = [];
    myVaults.forEach((item) => {
      !isNullObjectId(item.limit_clmm_position_id) &&
        vaultPositions.push(item.limit_clmm_position_id);
      !isNullObjectId(item.base_clmm_position_id) &&
        vaultPositions.push(item.base_clmm_position_id);
    });

    const positionObjects = await multiGetObjects(
      this.provider,
      Array.from(new Set(vaultPositions)),
      {
        showContent: true,
      },
    );

    positionObjects.forEach((position) => {
      const fields = unstable_getObjectFields(position) as unknown as NFT.PositionField;
      const myVaultPosition = {
        ...fields,
        tickLower: this.math.bitsToNumber(fields.tick_lower_index.fields.bits),
        tickUpper: this.math.bitsToNumber(fields.tick_upper_index.fields.bits),
        objectId: fields.id.id,
      };

      let index: number | undefined;
      const myVault = myVaults.find((item, i) => {
        const isFind =
          item.limit_clmm_position_id === fields.id.id ||
          item.base_clmm_position_id === fields.id.id;
        if (isFind) {
          index = i;
        }
        return isFind;
      });

      if (
        myVault &&
        index !== undefined &&
        myVault.limit_clmm_position_id === fields.id.id
      ) {
        myVault.limit_clmm_position = myVaultPosition;
        myVaults[index] = myVault;
      } else if (
        myVault &&
        index !== undefined &&
        myVault.base_clmm_position_id === fields.id.id
      ) {
        myVault.base_clmm_position = myVaultPosition;
        myVaults[index] = myVault;
      }
    });

    return myVaults;
  }

  async getVaultAmount(options: Vault.TurbosVaultAmount): Promise<[string, string]> {
    const [baseAmountA, baseAmountB] = this.pool.getTokenAmountsFromLiquidity({
      liquidity: new BN(
        options.base_liquidity === undefined ? 100_000_000 : options.base_liquidity,
      ),
      currentSqrtPrice: new BN(options.poolSqrtPrice),
      lowerSqrtPrice: this.math.tickIndexToSqrtPriceX64(options.baseLowerTick),
      upperSqrtPrice: this.math.tickIndexToSqrtPriceX64(options.baseUpperTick),
    });

    const [limitAmountA, limitAmountB] = this.pool.getTokenAmountsFromLiquidity({
      liquidity: new BN(
        options.limit_liquidity === undefined ? 100_000_000 : options.limit_liquidity,
      ),
      currentSqrtPrice: new BN(options.poolSqrtPrice),
      lowerSqrtPrice: this.math.tickIndexToSqrtPriceX64(options.limitLowerTick),
      upperSqrtPrice: this.math.tickIndexToSqrtPriceX64(options.limitUpperTick),
    });

    const [amountA, amountB] = await this.getVaultBalanceAmount({
      strategyId: options.strategyId,
      vaultId: options.vaultId,
      coinTypeA: options.coinTypeA,
      coinTypeB: options.coinTypeB,
      address: options.address,
    });

    return [
      baseAmountA.add(limitAmountA).add(new BN(amountA)).toString(),
      baseAmountB.add(limitAmountB).add(new BN(amountB)).toString(),
    ];
  }
}
