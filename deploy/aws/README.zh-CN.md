# AWS 部署

[English](README.md) · **简体中文**

这套 Terraform 会在两个可用区创建一套生产基线：

- HTTPS Application Load Balancer；
- 至少两台 2C4G VM，每台各运行一个 Gateway 和 Worker，并按 CPU 自动扩缩容；
- Multi-AZ RDS PostgreSQL 16；
- 启用 TLS、认证和 Multi-AZ 的 ElastiCache Redis 7；
- Secrets Manager、IMDSv2 与 SSM 运维入口。

前置条件：Terraform 1.7+、AWS 凭证、ACM 证书和 JWT/JWKS 身份服务。

```bash
cd deploy/aws/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

让 `public_hostname` 指向输出的 `alb_dns_name`，React SDK 使用输出的 `websocket_url`。证书必须覆盖该域名。Terraform state 包含基础设施凭证，生产环境必须使用加密、带锁的远程 backend。

默认读取 `deploy/domain-pack/domain-pack.example.json`。通过 `domain_pack_config_json` 替换 JSON 配置，或通过 `domain_pack_module_source` 分发经过审查的 ESM 业务模块；模块优先，所有 VM 都会只读加载同一份内容。
