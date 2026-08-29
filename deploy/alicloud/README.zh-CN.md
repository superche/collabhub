# 阿里云部署

[English](README.md) · **简体中文**

这套 Terraform 会跨两个可用区创建一套生产基线：

- HTTPS 应用型负载均衡 ALB；
- 至少两台 2C4G ECS，每台各运行一个 Gateway 和 Worker；
- 开启 PgBouncer 与 SSL 的高可用 RDS PostgreSQL 16；
- 开启认证与 SSL 的 1 GB 主从 Tair/Redis 7 基线；
- ECS 用最小权限 RAM Role 从加密私有 OSS 精确读取运行时 secret；
- 默认每天备份 RDS，完整备份和日志保留 7 天。

前置条件：Terraform 1.7+、阿里云 CLI 3.3+ 和数字证书管理服务证书。默认 KISS 路径会生成一条只给业务后端使用的 JWT 签名密钥；业务已经使用托管身份服务时再填写 `jwt_jwks_url`。本地交互部署优先使用 OAuth，不创建永久 AccessKey：

```bash
aliyun configure --mode OAuth --profile collabhub-certification
export ALIBABA_CLOUD_PROFILE=collabhub-certification
export ALIBABA_CLOUD_REGION=cn-hangzhou

cd deploy/alicloud
cp state-bootstrap/terraform.tfvars.example state-bootstrap/terraform.tfvars
# 将 identity.sh 输出的 Account ID 填入该文件。
./bootstrap-plan.sh
# 核对两个状态后端资源；得到明确授权后才能 apply，
# 然后把 backend_hcl 输出写入 terraform/backend.hcl。

cp terraform/terraform.tfvars.example terraform/terraform.tfvars
cp terraform/backend.hcl.example terraform/backend.hcl
# 填写证书、域名和 Origin；backend.hcl 指向私有且启用版本控制的 OSS Bucket，
# 以及主键为 String 类型 LockID 的 Tablestore 锁表。
./identity.sh
./estimate-cost.sh
./plan.sh
```

`identity.sh` 会输出 Account ID、可见的账号别名、当前用户/角色、Region，以及 STS/RAM 实际能否返回邮箱。部署前必须核对这些信息。`bootstrap-plan.sh` 只规划加密远程状态后端，`plan.sh` 只规划业务栈；两者都不会 apply。只有明确确认账号、Region、资源清单与费用后，才能 apply 对应的已保存 plan。

`estimate-cost.sh` 会实时查询当前账号的 ECS、RDS 和 Redis 价格，并加上官方公布的 Basic ALB 最低费用。它按 730 小时给出固定基线，同时将公网流量、额外 LCU、OSS、Tablestore 与超额备份列为按量项，不伪装成固定成本。

让 `public_hostname` 指向输出的 `alb_dns_name`，React SDK 使用输出的 `websocket_url`。证书必须覆盖该域名。Terraform state 包含 RDS、Redis、内部通信和 JWT 凭证，所以 `plan.sh` 没有 OSS 加密存储与 Tablestore 锁配置时会直接拒绝运行。OSS Bucket 必须私有、禁止公网访问并启用版本控制；锁表必须使用 String 类型的 `LockID` 主键。运行时密码不会写进 cloud-init；Terraform 将它们写入另一个加密私有 OSS Bucket，ECS 通过 RAM Role 只读取精确对象并保存为 root-only 文件。只给业务后端授予 `jwt_secret_object_uri` 的读取权限，在后端生成短期 token；不能把密钥发给 React。这个 KISS 路径不强制购买 KMS 实例；有合规要求时可替换为已有的 secret manager。

默认读取 `deploy/domain-pack/domain-pack.example.json`。通过 `domain_pack_config_json` 替换 JSON 配置，或通过 `domain_pack_module_source` 分发经过审查的 ESM 业务模块；模块优先，所有 VM 都会只读加载同一份内容。

阿里云是第一套持久化、多节点认证环境，不是运行时唯一支持的云。统一契约见[生产硬化](../../docs/production-hardening.zh-CN.md)，同一镜像也可以部署到[已有 VM](../vm/README.md)。
