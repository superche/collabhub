# Alibaba Cloud deployment

**English** · [简体中文](README.zh-CN.md)

This Terraform stack creates a production baseline across two zones:

- an HTTPS Application Load Balancer;
- at least two 2C4G ECS nodes;
- one Gateway and one Worker container on every VM;
- high-availability ApsaraDB RDS PostgreSQL 16 with PgBouncer and SSL;
- master-replica Tair/Redis 7 with authentication and SSL.
- KMS runtime secrets read through a least-privilege ECS RAM role;
- seven-day daily RDS snapshots and log backups by default.

Prerequisites: Terraform 1.7+, Alibaba Cloud CLI 3.3+, and a Certificate Management Service certificate. The default KISS path generates a backend-only JWT signing secret; set `jwt_jwks_url` only when the app already has a managed identity provider. For an interactive local deployment, prefer an OAuth CLI profile instead of creating a permanent AccessKey:

```bash
aliyun configure --mode OAuth --profile collabhub-certification
export ALIBABA_CLOUD_PROFILE=collabhub-certification
export ALIBABA_CLOUD_REGION=cn-hangzhou

cd deploy/alicloud
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
cp terraform/backend.hcl.example terraform/backend.hcl
# Edit certificate, hostname and Origin. Point backend.hcl at a private,
# versioned OSS bucket and a Tablestore table whose String primary key is LockID.
./identity.sh
./plan.sh
```

`identity.sh` prints the account ID, alias when visible, principal/role, region, and the exact email visibility returned by STS/RAM. Confirm those fields before deployment. `plan.sh` initializes and validates Terraform and saves a plan; it never applies. Run `terraform -chdir=terraform apply collabhub.tfplan` only after an explicit approval of that identity, region, resource list, and expected cost.

Point `public_hostname` at `alb_dns_name`, then use the `websocket_url` output in the React SDK. The certificate must cover that hostname. `plan.sh` refuses to run without encrypted OSS state and a Tablestore lock because state contains generated RDS, Redis, internal, and JWT credentials. Keep the bucket private with public access blocked and versioning enabled; the lock table must have a String primary key named `LockID`. Runtime secrets are not embedded in cloud-init: ECS uses its attached RAM role to fetch exactly four KMS secrets into root-only files. Grant the existing application backend read access only to the output `jwt_secret_name`, then mint short-lived tokens there; never ship the secret to React.

The default JSON Domain Pack is read from `deploy/domain-pack/domain-pack.example.json`. Set `domain_pack_config_json` for a different declarative pack, or set `domain_pack_module_source` to mount a reviewed ESM business module on every VM. The two modes are mutually exclusive by convention; the module takes precedence.

This is the first persistent multi-node certification target, not the only supported cloud. The runtime contract is documented in [production hardening](../../docs/production-hardening.md), and the same containers can run on [existing VMs](../vm/README.md).
