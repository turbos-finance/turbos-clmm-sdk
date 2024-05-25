import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui.js/utils';
import {
  TransactionBlock,
  type TransactionObjectArgument,
} from '@mysten/sui.js/transactions';
import { Base } from './base';
import { validateObjectResponse } from '../utils/validate-object-response';
import { getObjectFields } from './legacy';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import { MAX_TICK_INDEX, MIN_TICK_INDEX } from '../constants';
import { ONE_MINUTE } from './trade';

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
    txb?: TransactionBlock;
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
    txb?: TransactionBlock;
    deadline?: number;
    strategyId: string;
    vaultId: string;
    poolId: string;
    address: string;
    percentage: number;
    onlyTokenA?: boolean;
    onlyTokenB?: boolean;
  }

  export interface collectClmmRewardDirectReturnVaultArguments {
    txb?: TransactionBlock;
    address: string;
    strategyId: string;
    poolId: string;
    vaultId: string;
    rewardVaultId: string;
    rewardVaultIndex: number;
    rewardVaultCoinType: string;
  }

  export interface CloseVaultArguments {
    txb?: TransactionBlock;
    strategyId: string;
    vaultId: string;
  }

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
  }

  export interface VaultWithdrawEvents {
    amount_a: string;
    amount_b: string;
    percentage: string;
  }
}

export class Vault extends Base {
  async createAndDepositVault(
    options: Vault.CreateAndDepositVaultArguments,
  ): Promise<TransactionBlock> {
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
    let txb = options.txb || new TransactionBlock();

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
        txb.pure(Math.abs(_baseLowerIndex).toFixed(0), 'u32'),
        txb.pure(_baseLowerIndex < 0, 'bool'),
        txb.pure(Math.abs(_baseUpperIndex).toFixed(0), 'u32'),
        txb.pure(_baseUpperIndex < 0, 'bool'),
        txb.pure(Math.abs(_limitLowerIndex).toFixed(0), 'u32'),
        txb.pure(_limitLowerIndex < 0, 'bool'),
        txb.pure(Math.abs(_limitUpperIndex).toFixed(0), 'u32'),
        txb.pure(_limitUpperIndex < 0, 'bool'),
        txb.pure(baseTickStep, 'u32'),
        txb.pure(limitTickStep, 'u32'),
        txb.pure(address, 'address'),
        txb.object(SUI_CLOCK_OBJECT_ID),
        txb.object(contract.Versioned),
      ],
      typeArguments: typeArguments,
    });

    return txb;
  }

  async createVault(options: Vault.CreateVaultArguments): Promise<TransactionBlock> {
    const {
      strategyId,
      address,
      baseLowerIndex,
      baseUpperIndex,
      limitLowerIndex,
      limitUpperIndex,
    } = options;
    const txb = options.txb || new TransactionBlock();
    const contract = await this.contract.getConfig();

    const fields = await this.getStrategy(strategyId);

    txb.moveCall({
      target: `${contract.VaultPackageId}::router::open_vault`,
      arguments: [
        txb.object(contract.VaultGlobalConfig),
        txb.object(strategyId),
        txb.pure(Math.abs(baseLowerIndex).toFixed(0), 'u32'),
        txb.pure(baseLowerIndex < 0, 'bool'),
        txb.pure(Math.abs(baseUpperIndex).toFixed(0), 'u32'),
        txb.pure(baseUpperIndex < 0, 'bool'),
        txb.pure(Math.abs(limitLowerIndex).toFixed(0), 'u32'),
        txb.pure(limitLowerIndex < 0, 'bool'),
        txb.pure(Math.abs(limitUpperIndex).toFixed(0), 'u32'),
        txb.pure(limitUpperIndex < 0, 'bool'),
        txb.pure(address, 'address'),
      ],
      typeArguments: [
        fields.coin_a_type_name.fields.name,
        fields.coin_b_type_name.fields.name,
      ],
    });

    return txb;
  }

  async depositVault(options: Vault.DepositVaultArguments): Promise<TransactionBlock> {
    const { strategyId, vaultId, poolId, coinTypeA, coinTypeB, address } = options;

    let txb = options.txb || new TransactionBlock();
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

  async withdrawVault(options: Vault.WithdrawVaultArguments): Promise<TransactionBlock> {
    const { strategyId, vaultId, poolId, address, percentage } = options;
    const txb = options.txb || new TransactionBlock();

    if (options.onlyTokenA && options.onlyTokenB) {
      return txb;
    } else if (options.onlyTokenA || options.onlyTokenB) {
      return this.onlyTokenWithdrawVault(options);
    }

    const contract = await this.contract.getConfig();
    const typeArguments = await this.pool.getPoolTypeArguments(poolId);

    txb.moveCall({
      target: `${contract.VaultPackageId}::router::withdraw`,
      arguments: [
        txb.object(contract.VaultGlobalConfig),
        txb.object(contract.VaultRewarderManager),
        txb.object(strategyId),
        txb.object(vaultId),
        txb.object(poolId),
        txb.object(contract.Positions),
        txb.pure(percentage, 'u64'),
        txb.pure(percentage === 1000000, 'bool'),
        txb.pure(address, 'address'),
        txb.object(SUI_CLOCK_OBJECT_ID),
        // versioned
        txb.object(contract.Versioned),
      ],
      typeArguments: typeArguments,
    });

    return txb;
  }

  async withdrawVaultV2(
    options: Vault.WithdrawVaultArguments,
  ): Promise<TransactionBlock> {
    const { strategyId, vaultId, poolId, address, percentage } = options;
    const txb = options.txb || new TransactionBlock();

    if (options.onlyTokenA && options.onlyTokenB) {
      return txb;
    } else if (options.onlyTokenA || options.onlyTokenB) {
      return this.onlyTokenWithdrawVault(options, 2);
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
        txb.pure(percentage, 'u64'),
        txb.pure(percentage === 1000000, 'bool'),
        txb.pure(address, 'address'),
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
  ): Promise<TransactionBlock> {
    const {
      address,
      strategyId,
      poolId,
      vaultId,
      rewardVaultId,
      rewardVaultIndex,
      rewardVaultCoinType,
    } = options;
    const txb = options.txb || new TransactionBlock();
    const contract = await this.contract.getConfig();
    const typeArguments = await this.pool.getPoolTypeArguments(poolId);

    txb.moveCall({
      target: `${contract.VaultPackageId}::router::collect_clmm_reward_direct_return`,
      arguments: [
        txb.object(contract.VaultGlobalConfig),
        txb.object(strategyId),
        txb.object(vaultId),
        txb.object(poolId),
        txb.object(contract.Positions),
        txb.object(rewardVaultId), //clmm reward vault
        txb.pure(rewardVaultIndex, 'u64'), // reward vault index
        txb.pure(address, 'address'),
        txb.object(SUI_CLOCK_OBJECT_ID),
        // versioned
        txb.object(contract.Versioned),
      ],
      typeArguments: [...typeArguments, rewardVaultCoinType],
    });

    return txb;
  }

  async closeVault(options: Vault.CloseVaultArguments): Promise<TransactionBlock> {
    const { strategyId, vaultId } = options;
    const txb = options.txb || new TransactionBlock();

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
    let txb = options.txb || new TransactionBlock();

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
      slippage: '1',
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

  protected async onlyTokenWithdrawVault(
    options: Vault.WithdrawVaultArguments,
    version: 1 | 2 = 1,
  ) {
    const { poolId, strategyId, vaultId, percentage, address } = options;
    let txb = options.txb || new TransactionBlock();

    const contract = await this.contract.getConfig();
    const typeArguments = await this.pool.getPoolTypeArguments(poolId);

    const argumentsConfig = [
      txb.object(contract.VaultGlobalConfig),
      txb.object(contract.VaultRewarderManager),
    ];

    version === 2 &&
      argumentsConfig.splice(1, 0, txb.object(contract.VaultUserTierConfig));

    const [coinVecA, coinVecB] = txb.moveCall({
      target: `${contract.VaultPackageId}::vault::withdraw${version === 2 ? '_v2' : ''}`,
      arguments: [
        ...argumentsConfig,
        txb.object(strategyId),
        txb.object(vaultId),
        txb.object(poolId),
        txb.object(contract.Positions),
        txb.pure(percentage, 'u64'),
        txb.pure(percentage === 1000000, 'bool'),
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

    let amountA;
    let amountB;
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

    const swapResult = await this.trade.computeSwapResultV2({
      pools: [
        {
          pool: poolId,
          a2b: options.onlyTokenB ? true : false,
          amountSpecified: options.onlyTokenB ? amountA : amountB,
        },
      ],
      amountSpecifiedIsInput: true,
      address,
    });

    const [coinA, coinB] = await Promise.all([
      this.coin.getMetadata(typeArguments[0]),
      this.coin.getMetadata(typeArguments[1]),
    ]);

    const nextTickPrice = this.math.tickIndexToPrice(
      this.math.bitsToNumber(swapResult[0]!.tick_current_index.bits),
      coinA.decimals,
      coinB.decimals,
    );

    const sqrt_price = this.trade.sqrtPriceWithSlippage(
      nextTickPrice,
      '1',
      options.onlyTokenB ? true : false,
      coinA.decimals,
      coinB.decimals,
    );

    txb.moveCall({
      target: `${contract.PackageId}::swap_router::${
        options.onlyTokenB ? 'swap_a_b' : 'swap_b_a'
      }`,
      typeArguments: typeArguments,
      arguments: [
        txb.object(poolId),
        txb.makeMoveVec({
          objects: [options.onlyTokenB ? coinVecA! : coinVecB!],
        }),
        txb.pure(options.onlyTokenB ? amountA : amountB, 'u64'),
        txb.pure(
          this.trade.amountOutWithSlippage(
            new Decimal(
              options.onlyTokenB ? swapResult[0]!.amount_b : swapResult[0]!.amount_a,
            ),
            '1',
            true,
          ),
          'u64',
        ),
        txb.pure(sqrt_price, 'u128'),
        txb.pure(true, 'bool'),
        txb.pure(address, 'address'),
        txb.pure(Date.now() + (options.deadline || ONE_MINUTE * 3), 'u64'),
        txb.object(SUI_CLOCK_OBJECT_ID),
        txb.object(contract.Versioned),
      ],
    });

    txb.transferObjects([options.onlyTokenB ? coinVecB! : coinVecA!], address);

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
        return getObjectFields(result) as Vault.VaultStrategyField;
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
        return getObjectFields(result) as Vault.VaultsIdMyStrategyVaultField;
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
}
