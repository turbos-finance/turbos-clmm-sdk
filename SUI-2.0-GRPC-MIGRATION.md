# turbos-clmm-sdk · 一次性迁移到 @mysten/sui 2.0 + gRPC

> 决策：跳过 JSON-RPC 平迁，直接上 `SuiGrpcClient`（JSON-RPC 公共端点 2026/7 下线）。
> 参考：[SDK 2.0 JSON-RPC→gRPC 迁移](https://sdk.mystenlabs.com/sui/migrations/sui-2.0/json-rpc-migration) · [@mysten/sui 2.0 变更](https://sdk.mystenlabs.com/sui/migrations/sui-2.0/sui)

## 难度总评

**中高，约 1.5–2.5 周（含回归测试）**。不是重写整个 SDK——transaction building、`bcs`、`utils`、`cryptography`、数学库都基本不变；gRPC 通过统一 `client.core.*` API 提供，多数读操作有直接对应。但有 **3 块重活**，且 quote 精度风险高，必须 1.x↔2.x 结果对拍。

## 关键约束：`provider` 调用风格要换

现状：`turbos-clmm-sdk` 直接调 JSON-RPC 专有方法（`provider.getObject`、`provider.devInspectTransactionBlock`…）。
目标：改用传输无关的 **`provider.core.*`** API，`provider` 类型从 `SuiClient` → `ClientWithCoreApi`。这样底层走 gRPC，未来要切 GraphQL 也无需再动业务层。

## 三块重活

### 重活 1 — `legacy.ts`(153 行) + 全部调用点（最大）

`getObjectFields` / `getObjectId` / `getMoveObject` / `getMoveObjectType` / `getObjectReference` / `getObjectDeletedResponse` / `getObjectNotExistsResponse` 以及 `utils/validate-object-response.ts`，全部基于 JSON-RPC `SuiObjectResponse` 的 `data.content.fields / dataType` 形状。core API 返回的是 `SuiClientTypes.GetObjectsResponse`（对象内容结构不同，Move 字段已解析）。

- 这套 helper 在整个 SDK 到处用（约 66 处涉及 `content/fields/options/showXxx` 形状依赖）。
- **要重写这套适配层**，让它消费 core API 的新返回结构；调用点逐个核对。
- 顺带：core API 里对象**不存在会抛异常**（v1 返回 null），`validateObjectResponse`、`getObjectFields(...) ?? undefined` 的兜底逻辑改成 try/catch。

### 重活 2 — 6 处 `devInspectTransactionBlock` → `core.simulateTransaction`（精度风险最高）

分布：`trade.ts`×2、`pool.ts`×1、`vault.ts`×3。两种读取方式，迁移难度不同：

**(a) 读 emitted events 的 `parsedJson`（trade.ts ×2、pool.ts ×1）** —— 最棘手

```ts
// 现状：依赖 JSON-RPC 便利字段 parsedJson
const result = await this.provider.devInspectTransactionBlock({
  transactionBlock: txb,
  sender,
});
if (result.error) throw new Error(result.error);
return result.events.map((e) => e.parsedJson as Trade.ComputedSwapResult);
```

合约 `pool_fetcher::compute_swap_result` / `fetch_ticks` 是靠 **emit event** 回传结果。`core.simulateTransaction` 返回的 event 很可能**只有 BCS bytes + type，没有 `parsedJson`**，需要用 `@mysten/sui/bcs` 定义对应 struct schema **手动解码**。这是要验证并大概率重写的点。

```ts
const result = await this.provider.core.simulateTransaction({
  transaction: txb,
  checksEnabled: false,
  include: { events: true }, // 确认 core simulate 是否暴露 events；否则改用 commandResults 返回值
});
// events 若无 parsedJson → 用 bcs schema 解码 contents.bcs
```

**(b) 读 `results[].returnValues` + `bcs.U64.parse`（vault.ts ×3）** —— 较直接

```ts
// 现状
bcs.U64.parse(Uint8Array.from(result.results![0]![0].returnValues![0]![0]))
// 迁移：字段路径 results → commandResults，bcs.U64.parse 不变
const r = await this.provider.core.simulateTransaction({ transaction, checksEnabled: false, include: { commandResults: true }});
bcs.U64.parse(Uint8Array.from(r.commandResults![0].returnValues![0]...))
```

> **必须做**：迁移前后对同一组 pool/amount 跑 quote 对拍，误差为 0 才算通过。这是 SDK 的定价核心。

### 重活 3 — `getCoinMetadata` 降级

core API **没有** `getCoinMetadata`。改用 gRPC `client.stateService.getCoinInfo({ coinType })`（响应含 `metadata`），或 GraphQL `coinMetadata`。`coin.ts:17` 一处。

## provider 方法映射（约 20 处调用点）

| 现状 JSON-RPC                                  | 替换                                                               | 位置                  |
| ---------------------------------------------- | ------------------------------------------------------------------ | --------------------- |
| `getObject` ×5                                 | `core.getObject`（`include` 替代 `options.showXxx`，不存在抛异常） | pool/coin/position 等 |
| `getDynamicFieldObject` ×4                     | `core.getDynamicField`                                             | pool/position/vault   |
| `multiGetObjects` ×1 + `utils/sui-kit.ts` 封装 | `core.getObjects`                                                  | trade.ts + sui-kit    |
| `getOwnedObjects` ×1 + `forEacGetOwnedObjects` | `core.listOwnedObjects`                                            | sui-kit               |
| `getDynamicFields` ×1                          | `core.listDynamicFields`                                           |                       |
| `getCoins` ×1                                  | `core.listCoins`                                                   | coin.ts:40            |
| `getCoinMetadata` ×1                           | gRPC `stateService.getCoinInfo` / GraphQL                          | coin.ts:17            |
| `devInspectTransactionBlock` ×6                | `core.simulateTransaction`                                         | 见重活 2              |

## 其余改动点（轻）

| 项                                 | 改动                                                                                                                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk.ts` 构造                      | `SuiClient`/`SuiClientOptions`/`getFullnodeUrl` 移除 → `SuiGrpcClient`（`@mysten/sui/grpc`），用 `baseUrl` + 必填 `network`                                                                                       |
| `sdk.ts` 的 `instanceof SuiClient` | 2.0 无 `SuiClient` 类 → 改 duck-typing 或按 `ClientWithCoreApi` 处理                                                                                                                                              |
| `provider` 类型                    | `SuiClient` → `ClientWithCoreApi`                                                                                                                                                                                 |
| 类型 import                        | `@mysten/sui/client` 的 JSON-RPC 类型（`SuiObjectResponse`/`PaginatedCoins`/`DynamicFieldPage`/`SuiObjectDataOptions`/`PaginatedObjectsResponse`/`SuiObjectDataFilter` 等）→ 换成 `SuiClientTypes` 下的 core 类型 |
| `bcs` schema 变更                  | 仅 `vault.ts` 用 `bcs.U64`（不受影响 ✅）；SDK 未直接解析 effects/owner BCS，`Failed→Failure`、`ConsensusV2→ConsensusAddressOwner` 等低风险                                                                       |
| `Commands`                         | 若用到 `@mysten/sui/transactions` 的 `Commands` → `TransactionCommands`（当前未见，确认即可）                                                                                                                     |
| 默认过期                           | 2.0 交易默认 `currentEpoch+1` 过期；若 SDK 构造的交易需原行为，`tx.setExpiration({ None: true })`                                                                                                                 |
| 打包                               | ESM only：删 `exports.require`（CJS 产物），tsup 只出 ESM；`tsconfig` `moduleResolution` `node`→`NodeNext`/`Bundler`                                                                                              |
| 版本                               | 这是 breaking，发 `4.0.0`；`peerDependencies.@mysten/sui` → `^2`                                                                                                                                                  |

## 执行顺序建议

1. 工程层先行：tsconfig + tsup 改 ESM-only + `peerDependencies` 提到 `^2`，让项目能编译。
2. `sdk.ts` 换 `SuiGrpcClient`，`provider` 类型改 `ClientWithCoreApi`。
3. 重写 `legacy.ts` 适配层 + `utils/sui-kit.ts`（重活 1），跑通对象读取类方法。
4. 逐文件改 provider 调用（map 表），处理 null→throw。
5. 攻 6 处 `devInspect`（重活 2），**quote 1.x↔2.x 对拍**。
6. `getCoinMetadata` 降级（重活 3）。
7. `vitest` 全绿 + 真实节点冒烟（pool 报价、tick 抓取、vault 估值、swap 模拟）。
8. 发 4.0，再升 indexer。

## 验证清单

- [ ] `tsc` 通过，产物为纯 ESM。
- [ ] 单测全绿。
- [ ] **quote 对拍**：同 pool/amount，`computeSwapResult` / `computeSwapResultV2` / `fetch_ticks` / vault 估值，1.x 与 2.0 结果完全一致。
- [ ] 对象不存在场景走 try/catch，不再依赖 null。
- [ ] 连真实 gRPC full node（非公共端点）冒烟。

---

_生成于 2026-06-26，依据官方 SDK 2.0 迁移文档与本仓库源码分析。_
