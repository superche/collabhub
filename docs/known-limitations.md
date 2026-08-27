# v0.1 已知限制与下一阶段

## 明确未实现

- `0.1.0` 仍是 technical preview；`v1.0.0` 必须在完整验收后由仓库所有者明确批准。
- 免费公开 Demo 使用 Render ephemeral filesystem，闲置会休眠，冷启动与数据重置属于演示环境限制。
- 分布式 runtime 支持单 region 水平扩容；没有跨 region active-active、自动 global failover 或数据主权路由。
- PostgreSQL snapshot 目前存 JSONB；没有对象存储 adapter、WAL compaction、PITR/备份自动化工具。
- 多 patch 联动只保证单个 document 内原子提交；跨 document、外部业务数据库或第三方系统仍需要事务协调。
- trusted in-process strategy；没有 WASM/进程沙箱、CPU/内存硬限制、签名与 canary 治理。
- 没有 Yjs/OT 长文本 subdocument、per-user undo/redo、tree reparent、schema migration runner 或操作历史压缩。
- 分布式 Gateway 已支持 JWT/JWKS 与 document grant，但 token 签发、业务授权、租户 RLS/独立库、审计仍是部署方责任；example 使用显式开发身份。
- 客户端 pending queue 只在页面生命周期内存中保留；刷新页面不会恢复未确认 intent。
- fractional rank 没有后台 rebalance；极端反复插入同一间隙会降低数值间隔。
- diagnostic panel 是应用内开发面，不是独立 control plane；没有服务端 p95/broadcast timeline 或 trace viewer。
- 2C4G 水位是保守调度起点，不是生产 SLO；尚未交付云数据库下的长稳压测报告。
- Kubernetes 清单提供 CPU HPA；mailbox、connection、egress 与 commit-latency 自定义指标需接入 Prometheus Adapter/KEDA。
- BlockNote 示例以顶层块为冲突粒度；同块并发输入是 LWW，不等价于其原生 Yjs 字符级合并。
- BlockNote 的协同光标、canonical undo/redo 与默认 UI 拆包尚未实现。

## v0.2 优先级

1. 对象存储 snapshot、WAL compaction、备份恢复工具与 crash-injection 长稳测试。
2. 持久化 client pending intents，为业务 version policy 加入过期离线窗口与决策可观测性。
3. 租户 RLS/授权审计、capability negotiation、payload schema validator 与 OpenTelemetry。
4. tree/counter/tombstone restore 完整语义、rank rebalance 与 schema migration runner。
5. 独立 DevTools timeline，记录 strategy decision、outbox age、fencing 与 broadcast latency。
6. 多 region 主从切换与 tenant placement policy。
