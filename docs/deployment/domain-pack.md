# 外挂 Domain Pack

单机与分布式镜像都不再要求把业务规则写死在 CollabHub 中。两种服务使用相同的外挂加载方式，开发和生产无需维护两套规则。

## JSON 配置

字段修改、实体增删、列表排序和严格事务可以直接使用 JSON 配置：

```bash
docker run --rm --network host \
  -v "$PWD/deploy/domain-pack/domain-pack.example.json:/config/domain-pack.json:ro" \
  -e COLLABHUB_DOMAIN_PACK_CONFIG=/config/domain-pack.json \
  -e COLLABHUB_ROLE=gateway \
  -e DATABASE_URL=... -e REDIS_URL=... -e INTERNAL_TOKEN=... \
  -v "$PWD/secrets:/run/secrets:ro" \
  -e JWT_SHARED_SECRET_FILE=/run/secrets/jwt-shared-secret -e JWT_ISSUER=my-app -e JWT_AUDIENCE=collabhub \
  ghcr.io/superche/collabhub:0.2.0
```

简单路径由业务已有后端使用 HS256 签发短期 token。业务已经接入托管身份服务时，用 `JWT_JWKS_URL` 替代 `JWT_SHARED_SECRET_FILE`。

JSON 文件可以配置：

- Domain Pack ID 与 schema version；
- 新文档初始 JSON，值为 `"$documentId"` 时会替换成真实文档 ID；
- 启用哪些内置 JSON 策略；
- 某类旧操作继续合并、直接拒绝还是要求重新加载。

配置上限为 1 MiB，服务启动前会完成校验，不能执行代码。

## ESM 外挂模块

联动字段、业务校验、自定义解冲突等逻辑使用 ESM 文件：

```bash
docker run --rm --network host \
  -v "$PWD/deploy/domain-pack/domain-pack.example.mjs:/config/domain-pack.mjs:ro" \
  -e COLLABHUB_DOMAIN_PACK_MODULE=/config/domain-pack.mjs \
  ... \
  ghcr.io/superche/collabhub:0.2.0
```

模块导出 Domain Pack 对象或工厂函数。运行时会注入 `jsonStrategies` 和 `defineDomainPack`，外挂文件不需要安装 npm 依赖。完整代码见[联动示例](../../deploy/domain-pack/domain-pack.example.mjs)。

ESM 文件是受信任的服务端代码，不是安全沙盒。必须经过代码审查、只读挂载，并确保所有 Gateway 和 Worker 使用完全相同的不可变文件。`COLLABHUB_DOMAIN_PACK_CONFIG` 与 `COLLABHUB_DOMAIN_PACK_MODULE` 只能设置一个。

AWS 和阿里云 Terraform 都支持 `domain_pack_config_json` 或 `domain_pack_module_source`，并把选定文件分发到每台 VM。单机镜像也暴露 `/config`，本地验证时可直接挂载同一份文件。
