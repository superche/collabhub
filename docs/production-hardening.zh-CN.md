# 生产硬化

Render 是公网 Demo：它证明 HTTPS/WSS、Origin 限制、Room 分享、断线恢复和 Room 回收可以在真实公网运行；它故意使用内存存储。生产参考仍使用同一个运行时，只是换成 PostgreSQL、Redis、受验证 JWT、私网和备份。

## 最小生产结构

- 两台 Linux VM，每台 2C4G，各运行一个 Gateway 和 Worker。
- 一个私网 PostgreSQL 16，保存 snapshot、operation、幂等回执和 outbox，是数据来源。
- 一个私网 Redis 7，保存租约、路由、Presence、广播和全局限流；丢失后可以重建。
- 一个 HTTPS/WSS 负载均衡，只把公网流量转发到 Gateway `7000`。Worker `7100`、数据库、Redis 和 metrics 只走私网。
- 继续由业务已有后端签发短期 JWT。最简单的路径只需一条后端专用 HS256 密钥；已有 Clerk/Auth0/Supabase 一类身份服务时可改用 JWKS。两种模式都会校验 issuer、audience、tenant、actor 和文档权限。

云厂商不限。已有 VM 直接用[通用 VM 部署](../deploy/vm/README.md)，阿里云认证环境使用[阿里云 Terraform](../deploy/alicloud/README.zh-CN.md)。Kubernetes 和 AWS 只是可选外壳。

## 数据升级

数据库表结构只向前升级；每次升级的版本和 checksum 记录在 `collabhub_database_migration`。所有节点都能安全执行，PostgreSQL 锁保证同一时间只有一个节点升级。

业务数据迁移写在 Domain Pack 旁边：

```ts
export default defineDomainPack({
  id: 'my-app',
  schemaVersion: '2',
  migrations: [{
    fromVersion: '1',
    toVersion: '2',
    migrate: state => ({ ...state, archived: false }),
  }],
  // strategies、initialState、invariants...
})
```

Worker 会先重放旧 WAL，再运行无 I/O、结果固定的迁移函数；随后在 Room owner epoch 保护下，一次事务写入新 snapshot、schema 指针、checksum 和审计记录。路径缺失或有歧义时直接停止激活。单机模式复用同一套迁移函数。

升级 schema 前：暂停这个业务的写入，等客户端 pending 队列清零，备份数据库，先发布全部 Worker，再发布客户端。旧 schema 的 operation 会要求客户端重新加载 snapshot，不会被服务端猜测转换。Room 升级后，回滚必须恢复经过演练的数据库备份，或再做一次向前迁移；不能直接用旧程序连接新数据。

镜像使用不可变 digest，并逐台 VM 升级。通用 VM 升级脚本会在 readiness 失败时恢复上一份本地镜像。数据模型已经迁移后，回滚仍要恢复数据库或继续向前迁移，不能把容器回滚当成数据回滚。

## 回收与恢复

默认保留最近 1,000 个 WAL 版本、7 天幂等回执、24 小时已投递 outbox、每份文档 3 个 snapshot，每 10 分钟清理一次。清理只会删除已被 snapshot 覆盖且超出窗口的 WAL，当前 snapshot 永远不会删除。Presence 从不进入 WAL 或 snapshot。

每天备份 PostgreSQL，并至少保留 7 天时间点恢复日志。每个版本至少做一次恢复演练：把最新备份恢复到隔离数据库，启动一个 Worker，读取代表性文档，对比 canonical version 和状态 checksum。Redis 不需要为数据正确性恢复；重启节点即可重建租约。

## 安全与运维

- 凭证写入文件，使用 `DATABASE_URL_FILE`、`REDIS_URL_FILE`、`INTERNAL_TOKEN_FILE`。Docker、Kubernetes、AWS 和阿里云参考配置都走这条路径。
- 简单鉴权再设置 `JWT_SHARED_SECRET_FILE`，只有业务后端和 CollabHub 能拿到；React 只向业务后端获取短期 token。已有身份服务时改用 `JWT_JWKS_URL`。
- `NODE_ENV=production` 会关闭所有开发用连接串和 token 回退，并要求内部 token 至少 32 个字符。
- 公网 TLS 在负载均衡终止；数据库和 Redis 也使用 TLS。安全组只允许负载均衡访问 `7000`，CollabHub VM 之间访问 `7100`。
- 阿里云 KISS 栈让 ECS 通过最小权限 RAM Role 从加密私有 OSS 读取精确 secret 对象；cloud-init 不包含永久 AccessKey 和运行时密码。已有 secret manager 的团队可替换这层存储。
- HTTP/WebSocket 默认最大 128 KiB；JSON 深度、节点数和集合宽度都有上限。
- 连接数是单 Gateway 限制；HTTP 和 operation 限流写入 Redis，增加 Gateway 不会把总额度放大；Redis 故障时默认拒绝请求。
- `/healthz` 只检查进程；`/readyz` 检查 PostgreSQL/Redis，优雅停机时返回 `503`；`/metrics` 必须带内部 token，并且只允许私网采集。
- SIGTERM 会先摘除 readiness、拒绝新请求，再排空 Room 队列、保存 snapshot、释放租约，最后关闭依赖。

告警至少覆盖：readiness、进程重启、RSS、Room 队列、鉴权拒绝、限流、retry、schema 迁移失败、清理失败、PostgreSQL 连接/磁盘、Redis 延迟和 outbox 堆积。

## 验证

```bash
pnpm test:unit
pnpm smoke:postgres-hardening
pnpm smoke:todo-cluster
```

PostgreSQL 冒烟覆盖数据库迁移幂等、业务数据事务升级、安全压缩、压缩后恢复，以及两个独立客户端共享 Redis 限流。双节点冒烟覆盖两个 Gateway、两个 Worker、owner 故障切换、重复投递、Presence 隔离、REST 路由和 snapshot recovery。
