# 架构与可靠性

## 核心判断

CollabHub 的稳定边界是“权威 operation protocol”，不是 room 框架、CRDT 数据结构或 React store。每个文档只有一个服务端定序点；客户端只提交 intent、维护可丢弃 optimistic overlay，并消费 canonical patch。

```text
React components -> Draft actions -> DraftCommandBus -> DraftCommandTransport
                                             ├── REST -> Draft API -> DraftRepository
                                             └── Collab adapter -> Client Core
                                                                    │ operation
                                                                    ▼
WebSocket gateway -> Room Worker -> pipeline -> Domain Pack
          │              │          │             │
          │              ├── WAL / receipt / outbox └── strategy
          │              └── canonical patch -> all clients -> projection -> DraftStore
          └── Redis route/presence; PostgreSQL watermark catch-up
```

公开的 protocol、Client Core、Server Core 接口都不包含 `ws`、Express 或具体 room runtime 类型。`server-core` 提供可嵌入单机 runtime；`server-distributed` 提供可替换的无状态 Gateway、单写 Room Worker、PostgreSQL 权威提交与 Redis 临时路由。

## Commit 与恢复

权威会话对同一文档的 submit 串行执行：

1. 校验 envelope 与 document，运行 authenticate/authorize。
2. 校验 schema，运行 normalize，再由 Domain Pack version policy 决定 resolve/reject/resync。
3. 按 strategy id/version resolve；并发历史按已提交 canonical version 筛选，reject/resync 不改版本。
4. 计算 next state，运行 Domain Pack invariants 与 beforeCommit。
5. 单机 runtime 先 append WAL，再推进内存 canonical state/version；此后 snapshot/observer/afterCommit 失败不得回滚 accepted。
6. 分布式 runtime 把 WAL、receipt、head version 与 outbox 放在同一 PostgreSQL 事务，并用 owner epoch fencing 旧 writer。

一次 strategy resolution 可以返回多条 patch。Server Core 先将整组 patch 应用为 next state，再运行 invariant，并以一个 WAL record 和 canonical version 提交。因此同一文档内的实体变化、计数器和派生汇总可以原子联动；客户端不能通过先写本地 Store 再依赖副作用获得这一保证。

启动恢复会加载最近 snapshot，再回放其后的 WAL。为了让幂等键跨 snapshot/重启有效，历史 WAL 的 operationId 也会重建进 result index。snapshot 和 WAL 都经 `StorageAdapter`，example 将它们原子保存到中心 DraftRepository 文件。

分布式 runtime 的 outbox dispatcher 至少一次发布 canonical event；Gateway 同时比较 PostgreSQL head watermark，从 WAL 修复 Redis Pub/Sub 丢失。snapshot 先写不可变版本，再 CAS 推进 head pointer。

## 客户端模型

Client Core 维护两层状态：

```text
projected state = canonical state + pending optimistic patches
```

accepted 推进 canonical 并移除 pending；rejected 丢弃对应 overlay；resyncRequired 或版本 gap 请求 snapshot。每个 pending operation 保留创建时的 operationId 与 baseVersion：触发 resync 的 intent 在 snapshot 到达后结算，其他 pending 以原 envelope 重试并由业务 version policy 决定能否基于最新权威状态解析。断线期间 operation 只进入有界 pending queue，重连 hello/snapshot/ready 后重放。

## Presence

presence message 直接在同文档 socket 集合中广播。它不调用 session.submit，不增加 canonical version，不写 repository/WAL/snapshot。大资产也不应进入 operation payload；只同步 asset id 与 metadata。

## Example 的依赖约束

`src/components` 与 `src/domain` 的自动化 import boundary test 禁止 `@collabhub/*`。CollabHub 只集中在：

- `src/collab/collabhub-draft-transport.ts`
- `src/collab/draft-command-adapter.ts`
- `src/collab/draft-projection-adapter.ts`
- `src/app/composition-root.ts`
- `server/draft-domain-pack.ts`
- `server/draft-storage-adapter.ts`

因此删除 `src/collab`、把 composition root 固定为 `RestDraftTransport` 后，React 组件、DraftDocument、DraftStore、DraftCommandBus 与 REST 业务仍成立。

BlockNote 示例遵循同一边界：组件只依赖 BlockNote 与应用 Runtime；`src/collab` 把块变化转换为版本化 operation；服务端 Domain Pack 只认识通用 Block JSON，不 import BlockNote。编辑器库因此不是 canonical schema 的所有者。
