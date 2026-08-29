data "alicloud_alb_zones" "available" {}

data "alicloud_images" "linux" {
  owners      = "system"
  most_recent = true
  name_regex  = "^aliyun_3_x64_20G_alibase_.*"
}

locals {
  zones                   = slice(data.alicloud_alb_zones.available.zones, 0, 2)
  domain_pack_source      = var.domain_pack_module_source != null ? var.domain_pack_module_source : coalesce(var.domain_pack_config_json, file("${path.module}/../../domain-pack/domain-pack.example.json"))
  domain_pack_file_name   = var.domain_pack_module_source != null ? "domain-pack.mjs" : "domain-pack.json"
  domain_pack_environment = var.domain_pack_module_source != null ? "COLLABHUB_DOMAIN_PACK_MODULE" : "COLLABHUB_DOMAIN_PACK_CONFIG"
  tags                    = { Project = var.name, ManagedBy = "Terraform", Service = "collabhub" }
}

resource "alicloud_vpc" "this" {
  vpc_name   = "${var.name}-vpc"
  cidr_block = "10.52.0.0/16"
  tags       = local.tags
}

resource "alicloud_vswitch" "this" {
  count        = 2
  vpc_id       = alicloud_vpc.this.id
  zone_id      = local.zones[count.index].id
  cidr_block   = cidrsubnet(alicloud_vpc.this.cidr_block, 8, count.index)
  vswitch_name = "${var.name}-${count.index + 1}"
  tags         = local.tags
}

resource "alicloud_security_group" "vm" {
  security_group_name = "${var.name}-vm"
  description         = "CollabHub Gateway and Worker nodes"
  vpc_id              = alicloud_vpc.this.id
  inner_access_policy = "Drop"
  tags                = local.tags
}

resource "alicloud_security_group_rule" "gateway" {
  type              = "ingress"
  ip_protocol       = "tcp"
  port_range        = "7000/7000"
  security_group_id = alicloud_security_group.vm.id
  cidr_ip           = alicloud_vpc.this.cidr_block
  priority          = 1
}

resource "alicloud_security_group_rule" "worker" {
  type              = "ingress"
  ip_protocol       = "tcp"
  port_range        = "7100/7100"
  security_group_id = alicloud_security_group.vm.id
  cidr_ip           = alicloud_vpc.this.cidr_block
  priority          = 1
}

data "alicloud_db_instance_classes" "postgres" {
  zone_id                  = local.zones[0].id
  engine                   = "PostgreSQL"
  engine_version           = "16.0"
  category                 = "HighAvailability"
  db_instance_storage_type = "cloud_essd"
  instance_charge_type     = "PostPaid"
}

resource "random_password" "database" {
  length           = 32
  special          = true
  override_special = "_"
  min_upper        = 2
  min_lower        = 2
  min_numeric      = 2
  min_special      = 2
}

resource "random_password" "redis" {
  length           = 32
  special          = true
  override_special = "_"
  min_upper        = 2
  min_lower        = 2
  min_numeric      = 2
  min_special      = 2
}

resource "random_password" "internal" {
  length  = 48
  special = false
}

resource "alicloud_kms_secret" "database" {
  secret_name                   = "${var.name}-database-password"
  secret_data                   = random_password.database.result
  version_id                    = "v1"
  description                   = "CollabHub PostgreSQL password"
  force_delete_without_recovery = false
  recovery_window_in_days       = 7
  tags                          = local.tags
}

resource "alicloud_kms_secret" "redis" {
  secret_name                   = "${var.name}-redis-password"
  secret_data                   = random_password.redis.result
  version_id                    = "v1"
  description                   = "CollabHub Redis password"
  force_delete_without_recovery = false
  recovery_window_in_days       = 7
  tags                          = local.tags
}

resource "alicloud_kms_secret" "internal" {
  secret_name                   = "${var.name}-internal-token"
  secret_data                   = random_password.internal.result
  version_id                    = "v1"
  description                   = "CollabHub Gateway to Worker token"
  force_delete_without_recovery = false
  recovery_window_in_days       = 7
  tags                          = local.tags
}

resource "alicloud_ram_role" "vm" {
  role_name   = "${var.name}-vm"
  description = "CollabHub ECS runtime identity"
  assume_role_policy_document = jsonencode({
    Version = "1"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = ["ecs.aliyuncs.com"] }
    }]
  })
  force = true
}

resource "alicloud_ram_policy" "runtime_secrets" {
  policy_name = "${var.name}-read-runtime-secrets"
  description = "Read only the three CollabHub runtime secrets"
  policy_document = jsonencode({
    Version = "1"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:GetSecretValue"]
      Resource = [alicloud_kms_secret.database.arn, alicloud_kms_secret.redis.arn, alicloud_kms_secret.internal.arn]
    }]
  })
  force = true
}

resource "alicloud_ram_role_policy_attachment" "runtime_secrets" {
  role_name   = alicloud_ram_role.vm.role_name
  policy_name = alicloud_ram_policy.runtime_secrets.policy_name
  policy_type = alicloud_ram_policy.runtime_secrets.type
}

resource "alicloud_db_instance" "postgres" {
  engine                   = "PostgreSQL"
  engine_version           = "16.0"
  instance_type            = coalesce(var.rds_instance_type, data.alicloud_db_instance_classes.postgres.instance_classes[0].instance_class)
  instance_storage         = 50
  instance_charge_type     = "Postpaid"
  instance_name            = "${var.name}-postgres"
  category                 = "HighAvailability"
  zone_id                  = local.zones[0].id
  zone_id_slave_a          = local.zones[1].id
  vswitch_id               = join(",", alicloud_vswitch.this[*].id)
  db_instance_storage_type = "cloud_essd"
  security_ips             = [alicloud_vpc.this.cidr_block]
  ssl_action               = "Open"
  pg_bouncer_enabled       = true
  monitoring_period        = 60
  deletion_protection      = var.deletion_protection
  tags                     = local.tags
}

resource "alicloud_rds_account" "collabhub" {
  db_instance_id      = alicloud_db_instance.postgres.id
  account_name        = "collabhub"
  account_password    = random_password.database.result
  account_description = "CollabHub runtime"
}

resource "alicloud_db_database" "collabhub" {
  instance_id    = alicloud_db_instance.postgres.id
  data_base_name = "collabhub"
  character_set  = "UTF8"
  description    = "CollabHub canonical state"
}

resource "alicloud_db_account_privilege" "collabhub" {
  instance_id  = alicloud_db_instance.postgres.id
  account_name = alicloud_rds_account.collabhub.account_name
  privilege    = "DBOwner"
  db_names     = [alicloud_db_database.collabhub.data_base_name]
}

resource "alicloud_db_backup_policy" "postgres" {
  instance_id                 = alicloud_db_instance.postgres.id
  preferred_backup_period     = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
  preferred_backup_time       = "18:00Z-19:00Z"
  backup_retention_period     = var.backup_retention_days
  enable_backup_log           = true
  log_backup_retention_period = var.backup_retention_days
}

resource "alicloud_kvstore_instance" "redis" {
  db_instance_name  = "${var.name}-redis"
  instance_class    = "redis.master.stand.default"
  instance_type     = "Redis"
  engine_version    = "7.0"
  payment_type      = "PostPaid"
  zone_id           = local.zones[0].id
  secondary_zone_id = local.zones[1].id
  vswitch_id        = alicloud_vswitch.this[0].id
  security_ips      = [alicloud_vpc.this.cidr_block]
  vpc_auth_mode     = "Open"
  password          = random_password.redis.result
  ssl_enable        = "Enable"
  tags              = local.tags
}

resource "alicloud_instance" "node" {
  count                      = var.instance_count
  instance_name              = "${var.name}-node-${count.index + 1}"
  host_name                  = "${var.name}-${count.index + 1}"
  image_id                   = data.alicloud_images.linux.images[0].id
  instance_type              = var.instance_type
  security_groups            = [alicloud_security_group.vm.id]
  vswitch_id                 = alicloud_vswitch.this[count.index % 2].id
  internet_charge_type       = "PayByTraffic"
  internet_max_bandwidth_out = 10
  system_disk_category       = "cloud_essd"
  system_disk_size           = 40
  system_disk_encrypted      = true
  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    container_image           = var.container_image
    database_host             = alicloud_db_instance.postgres.connection_string
    database_secret_name      = alicloud_kms_secret.database.secret_name
    redis_host                = alicloud_kvstore_instance.redis.connection_domain
    redis_secret_name         = alicloud_kms_secret.redis.secret_name
    internal_secret_name      = alicloud_kms_secret.internal.secret_name
    ram_role_name             = alicloud_ram_role.vm.role_name
    region                    = var.region
    domain_pack_source_base64 = base64encode(local.domain_pack_source)
    domain_pack_file_name     = local.domain_pack_file_name
    domain_pack_environment   = local.domain_pack_environment
    allowed_origin            = var.allowed_origin
    jwt_jwks_url              = var.jwt_jwks_url
    jwt_issuer                = var.jwt_issuer
    jwt_audience              = var.jwt_audience
  })
  tags = local.tags

  depends_on = [
    alicloud_db_account_privilege.collabhub,
    alicloud_kvstore_instance.redis,
    alicloud_ram_role_policy_attachment.runtime_secrets,
  ]
}

resource "alicloud_ecs_ram_role_attachment" "node" {
  count         = var.instance_count
  ram_role_name = alicloud_ram_role.vm.role_name
  instance_id   = alicloud_instance.node[count.index].id
}

resource "alicloud_alb_load_balancer" "this" {
  load_balancer_name          = var.name
  load_balancer_edition       = "Basic"
  address_type                = "Internet"
  address_allocated_mode      = "Fixed"
  vpc_id                      = alicloud_vpc.this.id
  deletion_protection_enabled = var.deletion_protection
  load_balancer_billing_config { pay_type = "PayAsYouGo" }
  modification_protection_config { status = "NonProtection" }
  dynamic "zone_mappings" {
    for_each = alicloud_vswitch.this
    content {
      zone_id    = zone_mappings.value.zone_id
      vswitch_id = zone_mappings.value.id
    }
  }
  tags = local.tags
}

resource "alicloud_alb_server_group" "gateway" {
  server_group_name = "${var.name}-gateway"
  vpc_id            = alicloud_vpc.this.id
  protocol          = "HTTP"
  scheduler         = "Wrr"
  health_check_config {
    health_check_enabled      = true
    health_check_protocol     = "HTTP"
    health_check_method       = "GET"
    health_check_path         = "/readyz"
    health_check_codes        = ["http_2xx"]
    health_check_connect_port = "7000"
    health_check_interval     = 5
    health_check_timeout      = 3
    healthy_threshold         = 2
    unhealthy_threshold       = 3
  }
  sticky_session_config { sticky_session_enabled = false }
  dynamic "servers" {
    for_each = alicloud_instance.node
    content {
      server_type = "Ecs"
      server_id   = servers.value.id
      server_ip   = servers.value.private_ip
      port        = 7000
      weight      = 100
      description = "CollabHub node"
    }
  }
  tags = local.tags
}

resource "alicloud_alb_listener" "https" {
  load_balancer_id     = alicloud_alb_load_balancer.this.id
  listener_protocol    = "HTTPS"
  listener_port        = 443
  listener_description = "CollabHub HTTPS"
  idle_timeout         = 300
  request_timeout      = 60
  certificates { certificate_id = var.certificate_id }
  default_actions {
    type = "ForwardGroup"
    forward_group_config {
      server_group_tuples { server_group_id = alicloud_alb_server_group.gateway.id }
    }
  }
}
