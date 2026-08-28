# 阿里云部署

[English](README.md) · **简体中文**

这套 Terraform 会跨两个可用区创建一套生产基线：

- HTTPS 应用型负载均衡 ALB；
- 至少两台 2C4G ECS，每台各运行一个 Gateway 和 Worker；
- 开启 PgBouncer 与 SSL 的高可用 RDS PostgreSQL 16；
- 开启认证与 SSL 的主从 Tair/Redis 7。

前置条件：Terraform 1.7+、阿里云凭证、数字证书管理服务证书和 JWT/JWKS 身份服务。Provider 读取 `ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET` 与 `ALIBABA_CLOUD_REGION`。

```bash
cd deploy/alicloud/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

让 `public_hostname` 指向输出的 `alb_dns_name`，React SDK 使用输出的 `websocket_url`。证书必须覆盖该域名。Terraform state 包含 RDS、Redis 与内部通信凭证，生产环境必须使用加密、带锁的远程 backend。

默认读取 `deploy/domain-pack/domain-pack.example.json`。通过 `domain_pack_config_json` 替换 JSON 配置，或通过 `domain_pack_module_source` 分发经过审查的 ESM 业务模块；模块优先，所有 VM 都会只读加载同一份内容。
