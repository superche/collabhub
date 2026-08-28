data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ssm_parameter" "amazon_linux" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

locals {
  availability_zones      = slice(data.aws_availability_zones.available.names, 0, 2)
  domain_pack_source      = var.domain_pack_module_source != null ? var.domain_pack_module_source : coalesce(var.domain_pack_config_json, file("${path.module}/../../domain-pack/domain-pack.example.json"))
  domain_pack_file_name   = var.domain_pack_module_source != null ? "domain-pack.mjs" : "domain-pack.json"
  domain_pack_environment = var.domain_pack_module_source != null ? "COLLABHUB_DOMAIN_PACK_MODULE" : "COLLABHUB_DOMAIN_PACK_CONFIG"
  common_tags             = { Service = "collabhub" }
}

resource "aws_vpc" "this" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = merge(local.common_tags, { Name = "${var.name}-vpc" })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(local.common_tags, { Name = "${var.name}-igw" })
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.this.id
  availability_zone       = local.availability_zones[count.index]
  cidr_block              = cidrsubnet(aws_vpc.this.cidr_block, 8, count.index)
  map_public_ip_on_launch = true
  tags                    = merge(local.common_tags, { Name = "${var.name}-public-${count.index + 1}" })
}

resource "aws_subnet" "data" {
  count             = 2
  vpc_id            = aws_vpc.this.id
  availability_zone = local.availability_zones[count.index]
  cidr_block        = cidrsubnet(aws_vpc.this.cidr_block, 8, 16 + count.index)
  tags              = merge(local.common_tags, { Name = "${var.name}-data-${count.index + 1}" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = merge(local.common_tags, { Name = "${var.name}-public" })
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "Public HTTPS entry"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.ingress_cidrs
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "vm" {
  name        = "${var.name}-vm"
  description = "CollabHub Gateway and Worker nodes"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "Gateway from ALB"
    from_port       = 7000
    to_port         = 7000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  ingress {
    description = "Worker routing between CollabHub nodes"
    from_port   = 7100
    to_port     = 7100
    protocol    = "tcp"
    self        = true
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "postgres" {
  name        = "${var.name}-postgres"
  description = "PostgreSQL from CollabHub nodes"
  vpc_id      = aws_vpc.this.id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.vm.id]
  }
}

resource "aws_security_group" "redis" {
  name        = "${var.name}-redis"
  description = "Redis TLS from CollabHub nodes"
  vpc_id      = aws_vpc.this.id
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.vm.id]
  }
}

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = aws_subnet.data[*].id
}

resource "aws_db_instance" "postgres" {
  identifier                   = "${var.name}-postgres"
  engine                       = "postgres"
  engine_version               = "16"
  instance_class               = "db.t4g.medium"
  allocated_storage            = 40
  max_allocated_storage        = 200
  storage_type                 = "gp3"
  storage_encrypted            = true
  db_name                      = "collabhub"
  username                     = "collabhub"
  manage_master_user_password  = true
  multi_az                     = true
  publicly_accessible          = false
  db_subnet_group_name         = aws_db_subnet_group.this.name
  vpc_security_group_ids       = [aws_security_group.postgres.id]
  backup_retention_period      = 7
  auto_minor_version_upgrade   = true
  deletion_protection          = var.deletion_protection
  skip_final_snapshot          = !var.deletion_protection
  final_snapshot_identifier    = var.deletion_protection ? "${var.name}-final" : null
  performance_insights_enabled = true
  monitoring_interval          = 0
  apply_immediately            = false
}

resource "random_password" "redis" {
  length           = 40
  special          = true
  override_special = "!&#$^<>-"
}

resource "random_password" "internal" {
  length  = 48
  special = false
}

resource "aws_elasticache_subnet_group" "this" {
  name       = var.name
  subnet_ids = aws_subnet.data[*].id
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${var.name}-redis"
  description                = "CollabHub ephemeral routing and presence"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = "cache.t4g.small"
  port                       = 6379
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis.result
  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [aws_security_group.redis.id]
  snapshot_retention_limit   = 1
  apply_immediately          = false
}

resource "aws_secretsmanager_secret" "redis" {
  name                    = "${var.name}/redis-auth-token"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "redis" {
  secret_id     = aws_secretsmanager_secret.redis.id
  secret_string = random_password.redis.result
}

resource "aws_secretsmanager_secret" "internal" {
  name                    = "${var.name}/internal-token"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "internal" {
  secret_id     = aws_secretsmanager_secret.internal.id
  secret_string = random_password.internal.result
}

resource "aws_iam_role" "vm" {
  name = "${var.name}-vm"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "secrets" {
  name = "read-runtime-secrets"
  role = aws_iam_role.vm.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["secretsmanager:GetSecretValue"]
      Resource = [
        aws_db_instance.postgres.master_user_secret[0].secret_arn,
        aws_secretsmanager_secret.redis.arn,
        aws_secretsmanager_secret.internal.arn,
      ]
    }]
  })
}

resource "aws_iam_instance_profile" "vm" {
  name = "${var.name}-vm"
  role = aws_iam_role.vm.name
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.vm.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_lb" "this" {
  name                       = var.name
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = aws_subnet.public[*].id
  enable_deletion_protection = var.deletion_protection
  idle_timeout               = 300
}

resource "aws_lb_target_group" "gateway" {
  name                 = "${var.name}-gateway"
  port                 = 7000
  protocol             = "HTTP"
  target_type          = "instance"
  vpc_id               = aws_vpc.this.id
  deregistration_delay = 30
  health_check {
    enabled             = true
    path                = "/readyz"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.gateway.arn
  }
}

resource "aws_launch_template" "this" {
  name_prefix            = "${var.name}-"
  image_id               = data.aws_ssm_parameter.amazon_linux.value
  instance_type          = var.instance_type
  update_default_version = true
  vpc_security_group_ids = [aws_security_group.vm.id]
  iam_instance_profile { name = aws_iam_instance_profile.vm.name }
  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }
  monitoring { enabled = true }
  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 30
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }
  user_data = base64encode(templatefile("${path.module}/user-data.sh.tftpl", {
    region                    = var.region
    container_image           = var.container_image
    database_host             = aws_db_instance.postgres.address
    database_secret_arn       = aws_db_instance.postgres.master_user_secret[0].secret_arn
    redis_host                = aws_elasticache_replication_group.redis.primary_endpoint_address
    redis_secret_arn          = aws_secretsmanager_secret.redis.arn
    internal_secret_arn       = aws_secretsmanager_secret.internal.arn
    domain_pack_source_base64 = base64encode(local.domain_pack_source)
    domain_pack_file_name     = local.domain_pack_file_name
    domain_pack_environment   = local.domain_pack_environment
    allowed_origin            = var.allowed_origin
    jwt_jwks_url              = var.jwt_jwks_url
    jwt_issuer                = var.jwt_issuer
    jwt_audience              = var.jwt_audience
  }))
  tag_specifications {
    resource_type = "instance"
    tags          = merge(local.common_tags, { Name = "${var.name}-node" })
  }
}

resource "aws_autoscaling_group" "this" {
  name                      = var.name
  min_size                  = var.min_instances
  desired_capacity          = var.min_instances
  max_size                  = var.max_instances
  health_check_type         = "ELB"
  health_check_grace_period = 300
  vpc_zone_identifier       = aws_subnet.public[*].id
  target_group_arns         = [aws_lb_target_group.gateway.arn]
  min_elb_capacity          = var.min_instances

  launch_template {
    id      = aws_launch_template.this.id
    version = "$Latest"
  }

  instance_refresh {
    strategy = "Rolling"
    preferences { min_healthy_percentage = 50 }
  }
}


resource "aws_autoscaling_policy" "cpu" {
  name                   = "${var.name}-cpu-target"
  autoscaling_group_name = aws_autoscaling_group.this.name
  policy_type            = "TargetTrackingScaling"
  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 60
  }
}
