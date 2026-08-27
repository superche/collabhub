# v0.1 稳定协议与 operation pipeline

## Operation envelope

每个 operation 带 `tenantId + documentId`、`actorId + clientId`、全局幂等 `operationId`、客户端创建该 operation 时观察到的 `baseVersion`，以及独立的 schema/strategy id/version。`baseVersion` 与 operationId 一起保持不可变；重连或 snapshot recovery 不会把同一个 operation 伪装成新版本。`intent` 仅用于诊断和重放，不是 canonical state。

服务端结果有四种：

- `accepted`：canonicalVersion + 增量 patches；重复 operation 返回原结果并标记 `duplicate`。
- `rejected`：版本不推进，返回结构化 reason 与可选 corrective patches。
- `resyncRequired`：客户端超出 recovery window、schema 不兼容或出现版本 gap；返回 snapshotRef。
- `retryLater`：owner 切换、临时故障或 mailbox 背压；客户端保留同一 operationId，不移除 pending，延迟重试。

Wire 类型在 `packages/protocol/src/index.ts`。WebSocket 只承载 JSON 编码，不定义协议语义。Gateway 在 hello 后绑定不可变 `ConnectionContext`；后续 operation/recover/presence 的 tenant、document、actor、client 均以连接上下文为准。

## Canonical patches

v0.1 包含 `set/remove/entityUpsert/entityDelete/listOrder`。它们是投影协议，不等同于用户意图；例如 `section.move` intent 经 list strategy 解析后才产生一个 canonical `listOrder` position。

普通操作不传整份文档：

```json
{
  "operationType": "property.set",
  "strategyId": "json.property-lww",
  "payload": { "path": "/title", "value": "Launch plan" }
}
```

## 内置策略

| operation | strategy | 并发语义 |
|---|---|---|
| `property.set/unset` | `json.property-lww@1.0` | 服务端接收顺序 LWW，字段粒度 patch |
| `entity.create/delete/restore` | `json.entity-lifecycle@1.0` | 稳定 id；create 冲突拒绝，delete/restore 显式 |
| `list.move/insert` | `json.list-order@1.0` | 服务端基于当前序列生成 fractional rank |
| `transaction.apply` | `json.reject-if-stale@1.0` | baseVersion 必须严格等于 currentVersion |

## Pipeline 扩展

Server Core 提供 `OperationPipelineHook`：authenticate、authorize、schemaValidate、normalize、beforeResolve、invariantCheck、beforeCommit、afterCommit。策略通过 `DomainPack.strategies` 注册；业务约束通过 `DomainPack.invariants` 注册。

单机 session 与分布式 Room Worker 都调用同一个 `AuthoritativeOperationPipeline`。二者只在 commit adapter 上不同：前者 append WAL，后者使用 PostgreSQL transaction、receipt、fencing 与 outbox；版本判断和冲突语义不分叉。

## 版本与冲突

服务端把历史记录为 `{ canonicalVersion, operation }`。对一个提交时观察到 v7 的 operation，`concurrentOperations` 是所有 **提交版本大于 v7** 的记录；不能用历史 operation 自身的 `baseVersion` 判断，因为一个 baseVersion=2 的 operation 可能实际在 v9 才提交。

旧版本处理分两层：

1. `DomainPack.operationVersionPolicy` 根据当前权威状态、提交版本、版本差、历史完整性和已提交并发操作，决定 `resolve`、`reject` 或 `resync`。
2. 选中的 strategy 负责实际合并，例如 LWW、基于当前序列重算位置、业务 intent 重放，或 `reject-if-stale` 严格拒绝。

没有业务 policy 时采用安全默认值：历史完整且未超过 `maxRecoveryGap` 才进入 strategy；否则要求 snapshot recovery。业务确认某类 intent 可只依赖当前权威状态重算时，可以显式越过 recovery window：

```ts
const rebaseable = new Set(['json.property-lww', 'json.list-order', 'draft.section-command'])

export const DraftDomainPack = defineDomainPack({
  // schemaVersion, strategies, invariants, initialState ...
  operationVersionPolicy: {
    decide(context) {
      if (rebaseable.has(context.operation.strategyId)) return { kind: 'resolve' }
      return context.recoveryWindowExceeded
        ? { kind: 'resync', reason: 'fresh state required' }
        : { kind: 'resolve' }
    },
  },
})
```

### 方案对比

| 方案 | 优点 | 代价 | 结论 |
|---|---|---|---|
| 所有旧版本 reject/resync | 最保守 | 高频冲突、离线体验差 | 作为无 policy 的越界兜底 |
| recovery 后改写 `baseVersion` | 实现表面简单 | 破坏 operation 身份、幂等 fingerprint 与严格事务语义 | 不采用 |
| 不可变 operation + 业务 version policy | 低侵入；结构化业务可按 intent 解冲突 | 业务需声明哪些策略可安全重算 | **v0.1 采用** |
| 全量 OT/CRDT | 字符级并发体验强 | 领域模型迁移与运行复杂度高 | 后续作为可选 Domain Pack |

resolve/invariant 必须确定、无 I/O、无副作用。v0.1 是 trusted in-process extension，不运行不可信插件。pre-commit hook 抛错 fail closed；commit 后的 snapshot、observer 与 publish 失败不能把已提交 operation 改成 rejected。分布式 runtime 通过 transactional outbox 重试 publish。
