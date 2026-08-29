# AWS single-VM deployment

**English** · [简体中文](README.zh-CN.md)

The default AWS path is intentionally small: one Lightsail VM runs CollabHub Gateway, Worker, PostgreSQL, Redis, Caddy TLS, and daily local backups through the already-certified [`deploy/indie`](../indie) profile.

**Default price: $12/month** in `us-east-1` for 2 vCPU, 2 GB RAM, 60 GB SSD, public IPv4, and the plan's included transfer. AWS bills in USD; tax and transfer overage are separate. Set `bundle_id = "medium_3_0"` for the 4 GB plan at **$24/month**. Prices are the AWS list prices documented for Lightsail when this release was prepared.

## Deploy

Prerequisites: Terraform 1.7+, AWS credentials, and the exact HTTPS Origin of the React app.

```bash
cd deploy/aws/terraform
cp terraform.tfvars.example terraform.tfvars
# Set allowed_origin. The defaults use the $12/month plan.
terraform init
terraform apply
```

Terraform creates a Lightsail instance, attaches a static IPv4 address, restricts public ports to HTTPS/HTTP plus Lightsail browser SSH, installs Docker, and starts the persistent single-VM stack. With no custom hostname, the output uses `<ip>.sslip.io` and Caddy obtains HTTPS automatically.

```bash
terraform output websocket_url
terraform output health_url
curl "$(terraform output -raw health_url)"
```

Initial package installation and image pulls normally take several minutes. If the first health request is early, inspect `/var/log/cloud-init-output.log` through the `browser_ssh` output.

The application backend signs short-lived document tokens with the generated secret at `/opt/collabhub/source/deploy/indie/secrets/jwt-shared-secret`. Read it only through an administrator session; never send it to React. Set the SDK URL to the `websocket_url` output.

## Boundaries

- The VM is persistent but single-node. A VM outage interrupts service.
- PostgreSQL survives ordinary container/process restarts; local backups are retained for 14 days, but long-lived deployments should copy them off-host.
- The zero-setup hostname uses `sslip.io`. A custom hostname is an advanced migration: point DNS at `public_ip`, then update `COLLABHUB_HOST` and Caddy on the VM during a planned restart. Changing `public_hostname` in Terraform replaces the bootstrapped instance, so back up first.
- Use the cloud-neutral [existing-VM](../vm) or [Kubernetes](../kubernetes) paths with managed PostgreSQL and Redis when failover, zero-downtime upgrades, or a database SLA are required.

AWS Lightsail pricing: <https://aws.amazon.com/lightsail/pricing/>.
