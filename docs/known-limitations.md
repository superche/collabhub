# v0.1 已知限制与下一阶段

## 明确未实现

- 单节点进程内 document ownership；没有 Redis room directory、跨实例 pub/sub 或跨 region leader。
- example 使用本地 JSON 文件的 DraftRepositoryStorageAdapter；没有 PostgreSQL 原子 WAL/outbox、compaction 或备份工具。
- trusted in-process strategy；没有 WASM/进程沙箱、CPU/内存硬限制、签名与 canary 治理。
- 没有 Yjs/OT 长文本 subdocument、per-user undo/redo、tree reparent、schema migration runner 或操作历史压缩。
- example auth 是 actor query 参数；没有 JWT/JWKS、document capability 或生产租户隔离。
- 客户端 pending queue 只在页面生命周期内存中保留；刷新页面不会恢复未确认 intent。
- fractional rank 没有后台 rebalance；极端反复插入同一间隙会降低数值间隔。
- diagnostic panel 是应用内开发面，不是独立 control plane；没有服务端 p95/broadcast timeline 或 trace viewer。
- v0.1 未承诺 100 connections / 20 ops/s / 10 MB snapshot 的生产 SLO。

## v0.2 优先级

1. PostgreSQL `append WAL + snapshot pointer + outbox` 单事务 adapter，并增加 commit/broadcast crash injection。
2. 持久化 client pending intents，加入显式 rebase policy 与过期离线窗口。
3. AuthAdapter、capability negotiation、rate limit、payload schema validator 与 structured telemetry。
4. tree/counter/tombstone restore 完整语义、rank rebalance 与 golden trace migrator。
5. 独立 DevTools timeline 和可导出 trace，记录 operation、strategy decision、ack/broadcast latency。
6. Redis 多实例 runtime adapter与 room ownership/migration 演练。
