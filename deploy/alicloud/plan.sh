#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
test -f terraform/terraform.tfvars || { echo "Copy terraform/terraform.tfvars.example to terraform/terraform.tfvars and fill it in." >&2; exit 1; }
test -f terraform/backend.hcl || { echo "Copy terraform/backend.hcl.example to terraform/backend.hcl and point it at a private, versioned OSS bucket plus a Tablestore lock table." >&2; exit 1; }
./identity.sh
terraform -chdir=terraform init -reconfigure -backend-config=backend.hcl
terraform -chdir=terraform fmt -check
terraform -chdir=terraform validate
terraform -chdir=terraform plan -out=collabhub.tfplan

echo "Plan saved to deploy/alicloud/terraform/collabhub.tfplan. This script never runs terraform apply."
