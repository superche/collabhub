# Alibaba Cloud deployment

**English** · [简体中文](README.zh-CN.md)

This Terraform stack creates a production baseline across two zones:

- an HTTPS Application Load Balancer;
- at least two 2C4G ECS nodes;
- one Gateway and one Worker container on every VM;
- high-availability ApsaraDB RDS PostgreSQL 16 with PgBouncer and SSL;
- master-replica Tair/Redis 7 with authentication and SSL.

Prerequisites: Terraform 1.7+, Alibaba Cloud credentials, a Certificate Management Service certificate, and a JWT/JWKS identity provider. The provider reads `ALIBABA_CLOUD_ACCESS_KEY_ID`, `ALIBABA_CLOUD_ACCESS_KEY_SECRET`, and `ALIBABA_CLOUD_REGION`.

```bash
cd deploy/alicloud/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

Point `public_hostname` at `alb_dns_name`, then use the `websocket_url` output in the React SDK. The certificate must cover that hostname. Terraform state contains generated RDS, Redis, and internal credentials; use an encrypted, locked remote backend before production.

The default JSON Domain Pack is read from `deploy/domain-pack/domain-pack.example.json`. Set `domain_pack_config_json` for a different declarative pack, or set `domain_pack_module_source` to mount a reviewed ESM business module on every VM. The two modes are mutually exclusive by convention; the module takes precedence.
