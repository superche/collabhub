# 接入条件

在写 Adapter 前必须满足以下条件；任一不满足都不应宣称可直接接入。

| 条件 | 接入方承诺 | v0.1 验收点 |
|---|---|---|
| 稳定文档身份 | tenant/document id 不复用 | room key 与 repository key 使用同一 id |
| 单一写权威 | 活跃协同会话内所有共享修改进入 mutation gateway | REST POST/PUT 返回 409 |
| 可操作化领域 | UI action 能映射为版本化 operation | DraftCommandAdapter catalog |
| 稳定实体 id | id 不随排序变化，客户端可生成 | sectionId 独立于 orderKey |
| schema/version | snapshot 与 op 携带版本 | hello/op/schema check |
| canonical patch 消费 | store 能处理 accept/reject/resync | ProjectionAdapter + Client Core |
| 幂等/重试 | clientId + operationId 稳定 | duplicate 与 reconnect tests |
| 有界工作集 | 活跃文档能进入单节点内存 | pending、payload、recovery window 上限 |
| 网络能力 | WebSocket + snapshot recovery | 双浏览器 offline/online e2e |

生产接入还必须实现真实 AuthAdapter、租户隔离、限流、备份、容量模型、审计与策略升级；example 的 actor query 参数不是认证。
