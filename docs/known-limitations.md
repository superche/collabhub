# v0.2 已知限制

- `0.2.0` 仍是技术预览；`v1.0.0` 必须由仓库所有者明确批准。
- 共享模型只支持 JSON。日期、Map、类实例、二进制和循环对象需要业务自行编码。
- reducer 模型修改普通数组时，可能用一条 patch 替换该数组；高频大列表应使用内置实体/排序命令。
- IndexedDB pending 队列能跨页面刷新，但只在当前浏览器配置内有效；它不是跨设备离线合并，清理站点数据会删除队列。
- 暂不包含字符级富文本 CRDT、多人共享 undo/redo、自动 schema migration 和多 Region active-active 写入。
- BlockNote 同一顶层 block 内的并发文本仍是 LWW。
- Render 公共 Demo 使用内存存储并会删除空闲 room，不是持久化参考。
- 单机文件存储不能水平扩容；生产多节点需要 PostgreSQL + Redis、鉴权、TLS、备份、监控和恢复演练。

## 下一阶段

1. 一等 schema migration 和 operation compaction。
2. 跨 Tab pending 协调与崩溃注入 soak test。
3. 面向字符级富文本的 Yjs 混合字段 Adapter。
4. 运维仪表盘和生产部署验证任务。
