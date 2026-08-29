# AWS 单机部署

[English](README.md) · **简体中文**

AWS 默认走 KISS 单机方案：一台 Lightsail VM 通过已经认证的 [`deploy/indie`](../indie) 同时运行 CollabHub Gateway、Worker、PostgreSQL、Redis、Caddy TLS，并每天做本机备份。

**默认价格：$12/月。** `us-east-1` 的默认套餐包含 2 vCPU、2 GB 内存、60 GB SSD、公网 IPv4 和套餐流量。AWS 使用美元计费，税费与超额流量另算。业务模型或快照较大时，把 `bundle_id` 改成 `medium_3_0`，4 GB 套餐为 **$24/月**。价格采用本版本准备时的 AWS Lightsail 官方标价。

## 部署

需要 Terraform 1.7+、AWS 凭证，以及 React 应用的准确 HTTPS Origin。

```bash
cd deploy/aws/terraform
cp terraform.tfvars.example terraform.tfvars
# 填写 allowed_origin；默认就是 $12/月套餐。
terraform init
terraform apply
```

Terraform 会创建 Lightsail、绑定静态 IPv4、只开放 HTTP/HTTPS 与 Lightsail 浏览器 SSH，安装 Docker，并启动持久化单机栈。未填写自有域名时，输出会使用 `<ip>.sslip.io`，Caddy 自动申请 HTTPS 证书。

```bash
terraform output websocket_url
terraform output health_url
curl "$(terraform output -raw health_url)"
```

首次安装系统包和拉取镜像通常需要几分钟。健康检查尚未成功时，通过 `browser_ssh` 输出进入实例，查看 `/var/log/cloud-init-output.log`。

业务后端使用 `/opt/collabhub/source/deploy/indie/secrets/jwt-shared-secret` 签发短期文档 token。它只能由管理员读取，绝不能发送到 React。前端 SDK 使用 `websocket_url` 输出。

## 边界

- 数据持久化，但只有一个节点；VM 故障时服务会中断。
- PostgreSQL 数据可跨容器和进程重启保留；本机备份保留 14 天，长期运行时应复制到站外存储。
- 零配置域名使用 `sslip.io`。自定义域名属于进阶迁移：先把 DNS 指向 `public_ip`，再在计划维护窗口更新 VM 上的 `COLLABHUB_HOST` 与 Caddy。直接修改 Terraform 的 `public_hostname` 会重建已初始化实例，操作前先备份。
- 需要故障切换、无停机升级或数据库 SLA 时，使用云无关的[已有 VM](../vm)或 [Kubernetes](../kubernetes)方案，并接入托管 PostgreSQL/Redis。

AWS Lightsail 官方价格：<https://aws.amazon.com/lightsail/pricing/>。
