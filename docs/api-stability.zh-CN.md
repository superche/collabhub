# API 稳定性

CollabHub 1.x 保持已发布 `@collabhub/*` 包的 TypeScript 公共导出向后兼容。次版本可以增加新的导出和可选字段；删除导出、修改必填字段或改变协议含义必须发布新的主版本。

CollabHub 1.x 的线上信封固定使用 `protocolVersion: "0.1"`。服务端遇到不支持的协议必须明确拒绝，不能猜测。Domain Pack 的数据结构变化通过显式迁移完成；旧客户端的数据结构不再适用时，服务端要求 snapshot recovery。

`public-api-baseline.json` 保存 1.0 批准的声明文件哈希。`pnpm release:check` 会重新构建全部包；公共声明未经评审发生变化时，发布门禁失败。

兼容承诺覆盖包的公共导出，不覆盖未被 package exports 暴露的 `dist/` 文件、案例内部实现、脚本、诊断文案以及明确标记为实验性的字段。
