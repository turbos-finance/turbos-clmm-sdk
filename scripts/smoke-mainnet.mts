/**
 * Mainnet end-to-end smoke test — exercises every read path that was migrated
 * but only compile-checked, never actually run.
 *
 * Design: each check returns { ok, info } and we summarize PASS/FAIL at the end.
 * No assertions — just run-through + print key fields for eyeball/diff verification.
 *
 * Usage: npx tsx scripts/smoke-mainnet.mts
 *
 * No private key needed; every call is read-only + simulate.
 */
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { TurbosSdk } from '../src/sdk';
import { bcs } from '@mysten/sui/bcs';
import { LinkedTableNodeVaultInfo } from '../src/bcs/clmm';
import { Network } from '../src';

// Known mainnet objects (from prior event queries / contract.json)
const POOL_ID = '0x5eb2dfcdd1b15d2021328258f6d5ec081e9a0cdcfa9e13a0eaeb9b5f7505ca78'; // SUI/USDC 3000bps
const STRATEGY_ID = '0x4880c0a3ea02c10382321828894f1c15d75348a965840d358f7127bc62d7e55c';
const VAULTS_TABLE = '0x47ffb069fa94b1d58a9351a61d29e5e966819a8ba9f2ba04841c79ffbce8108d';
const HEAD_VAULT_NFT =
  '0xa45b3db52dc5a1e995dc7cd355bc87c046a9f18b71c03194eec95ac2acaa1d05';

type Check = { name: string; ok: boolean; info: string };

const results: Check[] = [];
function record(name: string, ok: boolean, info: string) {
  results.push({ name, ok, info });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} :: ${info}`);
}

async function safe(name: string, fn: () => Promise<string>) {
  try {
    const info = await fn();
    record(name, true, info);
  } catch (err) {
    record(name, false, (err as Error).message);
  }
}

async function main() {
  const sdk = new TurbosSdk(Network.mainnet);
  const rawClient = sdk.provider as SuiGrpcClient;

  // 1. coin.getMetadata（SUI）
  await safe('coin.getMetadata(SUI)', async () => {
    const m = await sdk.coin.getMetadata('0x2::sui::SUI');
    return `symbol=${m.symbol} decimals=${m.decimals}`;
  });

  // 2. pool.getPool + parsePool (with types split)
  let parsedPool: any;
  await safe('pool.getPool', async () => {
    parsedPool = await sdk.pool.getPool(POOL_ID);
    return `id=${parsedPool.id} types=${parsedPool.types.length} liquidity=${parsedPool.liquidity} sqrt=${parsedPool.sqrt_price}`;
  });

  // 3. pool.getPoolTypeArguments
  await safe('pool.getPoolTypeArguments', async () => {
    const t = await sdk.pool.getPoolTypeArguments(POOL_ID);
    if (t.length !== 3) throw new Error(`expected 3 type args, got ${t.length}`);
    return t.join(' | ');
  });

  // 4. contract.getFees → multiGetObjects + Fee BCS
  await safe('contract.getFees (multiGetObjects+Fee BCS)', async () => {
    const fees = await sdk.contract.getFees();
    if (!fees.length) throw new Error('no fees');
    return `count=${fees.length} sample=${JSON.stringify(fees[0])}`;
  });

  // 5. pool.getPools (withLocked=true but limited to discovering the first page) —
  //    call listDynamicFields directly and verify one page.
  await safe('listDynamicFields(PoolTableId) + PoolFactoryField BCS', async () => {
    const contract = await sdk.contract.getConfig();
    const page = await rawClient.core.listDynamicFields({
      parentId: contract.PoolTableId,
      cursor: undefined,
    });
    if (!page.dynamicFields.length) throw new Error('no pool factory dynamic fields');
    const firstFieldId = page.dynamicFields[0]!.fieldId;
    const { object } = await rawClient.core.getObject({
      objectId: firstFieldId,
      include: { content: true },
    });
    const { PoolFactoryField } = await import('../src/bcs/clmm');
    const parsed = PoolFactoryField.parse(object.content!);
    return `firstFieldId=${firstFieldId} pool_id=${parsed.value.pool_id} fee=${parsed.value.fee}`;
  });

  // 6. nft.getPositionTick (uses an I32 dynamic field near the pool's current tick)
  await safe('nft.getPositionTick (dynamic field name=I32 BCS)', async () => {
    // Find an initialized=true tick near the current tick
    const ticks = await sdk.pool.fetchTicks(POOL_ID);
    if (!ticks.length) throw new Error('no ticks');
    const sample = ticks[0]!;
    const t = await sdk.position.getPositionTick(POOL_ID, {
      bits: sample.tick_index < 0 ? 4294967296 + sample.tick_index : sample.tick_index,
    });
    if (!t)
      throw new Error('getPositionTick returned undefined for known initialized tick');
    return `tick_index=${t.tickIndex} initialized=${
      t.initialized
    } liq_gross=${t.liquidityGross.toString()}`;
  });

  // 7. Discover a real Position NFT: reverse-lookup via the sender of a recent IncreaseLiquidityEvent
  let sampleNftId: string | undefined;
  await safe('discover Position NFT via LP event sender + listOwnedObjects', async () => {
    const r = await fetch('https://fullnode.mainnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'suix_queryEvents',
        params: [
          {
            MoveEventModule: {
              package:
                '0x91bfbc386a41afcfd9b2533058d7e915a1d3829089cc268ff4333d54d6339ca1',
              module: 'position_manager',
            },
          },
          null,
          20,
          true,
        ],
      }),
    });
    const j = await r.json();
    const senders: string[] = [
      ...new Set((j?.result?.data ?? []).map((e: any) => e.sender as string)),
    ] as string[];
    for (const sender of senders) {
      const page = await rawClient.core.listOwnedObjects({
        owner: sender,
        type: '0x91bfbc386a41afcfd9b2533058d7e915a1d3829089cc268ff4333d54d6339ca1::position_nft::TurbosPositionNFT',
        include: { content: true },
      });
      if (page.objects.length) {
        sampleNftId = page.objects[0]!.objectId;
        return `holder=${sender} nftId=${sampleNftId}`;
      }
    }
    throw new Error('no holder with TurbosPositionNFT found among recent LP senders');
  });

  if (sampleNftId) {
    await safe('nft.getFields(NFT) + parseObjectFields(TurbosPositionNFT)', async () => {
      const f = await sdk.position.getFields(sampleNftId!);
      return `pool_id=${f.pool_id} position_id=${f.position_id} name=${f.name}`;
    });

    await safe('nft.getPositionFields(NFT) (dynamic object field, childId)', async () => {
      const p = await sdk.position.getPositionFields(sampleNftId!);
      return `liq=${p.liquidity} tickL=${p.tick_lower_index.bits} tickU=${p.tick_upper_index.bits}`;
    });
  }

  // 8. vault.getStrategy (run even on cache hit to confirm the path doesn't throw)
  await safe('vault.getStrategy', async () => {
    const s = await sdk.vault['getStrategy'](STRATEGY_ID);
    return `vaults.id=${s.vaults.id} vault_index=${s.vault_index} status=${s.status} rewarders=${s.rewarders.length}`;
  });

  // 9. vault.getStrategyVault (head)
  await safe('vault.getStrategyVault(head)', async () => {
    const v = await sdk.vault['getStrategyVault'](VAULTS_TABLE, HEAD_VAULT_NFT);
    return `vault_id=${v.vault_id} base_liq=${v.base_liquidity} sqrt=${v.sqrt_price}`;
  });

  // 10. Find a VaultInfo node with non-empty rewards / non-null fees — walk the linked_table
  let nodeWithRewards: any = null;
  await safe('discover VaultInfo with non-empty rewards / non-null Option', async () => {
    let cur: string | null = HEAD_VAULT_NFT;
    let walked = 0;
    while (cur && walked < 30) {
      const { dynamicField } = await rawClient.core.getDynamicField({
        parentId: VAULTS_TABLE,
        name: { type: '0x2::object::ID', bcs: bcs.Address.serialize(cur).toBytes() },
      });
      const node: any = LinkedTableNodeVaultInfo.parse(dynamicField.value.bcs);
      const hasRewards = (node.value.rewards.contents?.length ?? 0) > 0;
      const hasOptFee =
        node.value.management_fee_rate !== null ||
        node.value.performance_fee_rate !== null;
      if (hasRewards || hasOptFee) {
        nodeWithRewards = node;
        return `nft=${cur} rewardsEntries=${node.value.rewards.contents.length} mgmtFee=${node.value.management_fee_rate} perfFee=${node.value.performance_fee_rate}`;
      }
      cur = node.next;
      walked++;
    }
    return `walked ${walked} nodes, no non-empty rewards / Option found (acceptable — schema verified via shape)`;
  });

  if (nodeWithRewards) {
    const e0 = nodeWithRewards.value.rewards.contents[0];
    record(
      'VaultInfo rewards Entry shape',
      !!e0?.key?.name && e0?.value?.reward !== undefined,
      `key.name=${e0?.key?.name?.slice(0, 40)} reward=${e0?.value?.reward} reward_debt=${
        e0?.value?.reward_debt
      }`,
    );
  }

  // 11. vault.getVaultBalanceAmount (head vault has liquidity=0; returning [0,0] still counts
  //     as PASS — we only need the path to execute end-to-end)
  await safe(
    'vault.getVaultBalanceAmount (simulateTransaction.commandResults)',
    async () => {
      const [a, b] = await sdk.vault.getVaultBalanceAmount({
        strategyId: STRATEGY_ID,
        vaultId: HEAD_VAULT_NFT,
        coinTypeA: '0x2::sui::SUI',
        coinTypeB:
          '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
        address: '0x0000000000000000000000000000000000000000000000000000000000000000',
      });
      return `amountA=${a} amountB=${b}`;
    },
  );

  // 12. vault.getMyVaults — find an address that actually holds a Vault NFT.
  //     Use queryEvents to locate the sender of a recent OpenVaultEvent.
  let vaultHolder: string | undefined;
  await safe('discover Vault NFT holder via DepositVaultEvent', async () => {
    const r = await fetch('https://fullnode.mainnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'suix_queryEvents',
        params: [
          {
            MoveEventType:
              '0x0a0d6e83196f523bb0623187d789ce602d1f63b3e7baa02b580df7ff0ccd17e0::vault::DepositEvent',
          },
          null,
          10,
          true,
        ],
      }),
    });
    const j = await r.json();
    const evts = j?.result?.data ?? [];
    for (const e of evts) {
      if (e?.sender) {
        vaultHolder = e.sender;
        return `holder=${e.sender}`;
      }
    }
    throw new Error('no DepositEvent sender found');
  });

  if (vaultHolder) {
    await safe(
      'vault.getMyVaults(holder) (listOwnedObjects + chained reads)',
      async () => {
        const vs = await sdk.vault.getMyVaults(vaultHolder!);
        return `count=${vs.length}${
          vs[0] ? ` sample=vaultId=${vs[0].vaultId} liq=${vs[0].base_liquidity}` : ''
        }`;
      },
    );
  }

  // Summary
  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  console.log('\n========== SUMMARY ==========');
  console.log(`${ok} PASS / ${fail} FAIL / ${results.length} total`);
  if (fail) {
    console.log('\nfailures:');
    for (const r of results.filter((r) => !r.ok)) console.log(`  - ${r.name}: ${r.info}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
