#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
test -f state-bootstrap/terraform.tfvars || { echo "Copy state-bootstrap/terraform.tfvars.example to state-bootstrap/terraform.tfvars and set the confirmed account ID." >&2; exit 1; }
./identity.sh
terraform -chdir=state-bootstrap init
terraform -chdir=state-bootstrap fmt -check
terraform -chdir=state-bootstrap validate
terraform -chdir=state-bootstrap plan -out=tfstate.tfplan

echo "Plan saved to deploy/alicloud/state-bootstrap/tfstate.tfplan. This script never runs terraform apply."
