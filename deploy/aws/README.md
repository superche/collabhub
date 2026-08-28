# AWS deployment

**English** · [简体中文](README.zh-CN.md)

This Terraform stack creates a production baseline in two Availability Zones:

- an HTTPS Application Load Balancer;
- a CPU target-tracking Auto Scaling Group with at least two 2C4G VM nodes;
- one Gateway and one Worker container on every VM;
- Multi-AZ RDS PostgreSQL 16;
- Multi-AZ ElastiCache Redis 7 with TLS and authentication;
- Secrets Manager integration and IMDSv2-only instances.

Prerequisites: Terraform 1.7+, AWS credentials, an ACM certificate, and a JWT/JWKS identity provider.

```bash
cd deploy/aws/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

Point `public_hostname` at `alb_dns_name`, then use the `websocket_url` output in the React SDK. The certificate must cover that hostname. Terraform state contains generated infrastructure credentials; use an encrypted, locked remote backend before production.

The default JSON Domain Pack is read from `deploy/domain-pack/domain-pack.example.json`. Set `domain_pack_config_json` for a different declarative pack, or set `domain_pack_module_source` to mount a reviewed ESM business module on every VM. The two modes are mutually exclusive by convention; the module takes precedence.
