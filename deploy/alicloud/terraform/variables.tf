variable "region" {
  description = "Alibaba Cloud region with at least two ALB zones."
  type        = string
  default     = "cn-hangzhou"
}

variable "credential_profile" {
  description = "Alibaba Cloud CLI profile used by Terraform when no higher-priority environment credentials are present."
  type        = string
  default     = "collabhub-certification"
}

variable "name" {
  description = "Prefix for CollabHub resources."
  type        = string
  default     = "collabhub"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,24}$", var.name))
    error_message = "name must contain 3-25 lowercase letters, digits, or hyphens."
  }
}

variable "allowed_origin" {
  description = "Exact HTTPS Origin allowed to open CollabHub WebSockets."
  type        = string
  validation {
    condition     = startswith(var.allowed_origin, "https://")
    error_message = "allowed_origin must use HTTPS."
  }
}

variable "public_hostname" {
  description = "DNS hostname covered by certificate_id and pointed at the ALB."
  type        = string
  validation {
    condition     = can(regex("^[A-Za-z0-9.-]+$", var.public_hostname)) && !startswith(var.public_hostname, "http")
    error_message = "public_hostname must be a DNS hostname without a URL scheme."
  }
}

variable "certificate_id" {
  description = "Alibaba Cloud Certificate Management Service certificate ID for ALB."
  type        = string
}

variable "jwt_jwks_url" {
  description = "Optional HTTPS JWKS endpoint. Null uses the generated backend-only HS256 secret."
  type        = string
  default     = null
  nullable    = true
  validation {
    condition     = var.jwt_jwks_url == null ? true : startswith(var.jwt_jwks_url, "https://")
    error_message = "jwt_jwks_url must use HTTPS."
  }
}

variable "jwt_issuer" {
  description = "Expected JWT issuer."
  type        = string
  default     = "my-app"
}

variable "jwt_audience" {
  description = "Expected JWT audience."
  type        = string
  default     = "collabhub"
}

variable "instance_type" {
  description = "2C4G ECS instance baseline."
  type        = string
  default     = "ecs.c7.large"
}

variable "instance_count" {
  description = "VM count. Each VM runs one Gateway and one Worker."
  type        = number
  default     = 2
  validation {
    condition     = var.instance_count >= 2
    error_message = "At least two instances are required for writer failover."
  }
}

variable "container_image" {
  description = "Published or application-owned distributed CollabHub image."
  type        = string
  default     = "ghcr.io/superche/collabhub:0.2.0"
}

variable "domain_pack_config_json" {
  description = "Declarative JSON Domain Pack. Null uses the repository example."
  type        = string
  default     = null
  nullable    = true
}

variable "domain_pack_module_source" {
  description = "Trusted ESM Domain Pack source. When set, it replaces domain_pack_config_json."
  type        = string
  default     = null
  nullable    = true
}

variable "rds_instance_type" {
  description = "Optional RDS PostgreSQL class. Null selects the first compatible HA class returned by the region."
  type        = string
  default     = null
  nullable    = true
}

variable "redis_instance_class" {
  description = "Tair/Redis class for ephemeral coordination data. The default is the smallest practical 1 GB master-replica class."
  type        = string
  default     = "redis.master.small.default"
}

variable "deletion_protection" {
  description = "Protect ALB and RDS resources from accidental deletion."
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "RDS full and log backup retention. Restore drills should use the same value."
  type        = number
  default     = 7
  validation {
    condition     = var.backup_retention_days >= 7 && var.backup_retention_days <= 730
    error_message = "backup_retention_days must be between 7 and 730."
  }
}
