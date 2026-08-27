# v0.1 稳定协议与 operation pipeline

## Operation envelope

每个 operation 带 `tenantId + documentId`、`actorId + clientId`、全局幂等 `operationId`、客户端观察到的 `baseVersion`，以及独立的 schema/strategy id/version。`intent` 仅用于诊断和重放，不是 canonical state。

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

resolve/invariant 必须确定、无 I/O、无副作用。v0.1 是 trusted in-process extension，不运行不可信插件。pre-commit hook 抛错 fail closed；commit 后的 snapshot、observer 与 publish 失败不能把已提交 operation 改成 rejected。分布式 runtime 通过 transactional outbox 重试 publish。
