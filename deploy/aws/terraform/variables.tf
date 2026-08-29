variable "region" {
  description = "AWS region with at least two available Availability Zones."
  type        = string
  default     = "us-east-1"
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
  description = "DNS hostname covered by certificate_arn and pointed at the ALB."
  type        = string
  validation {
    condition     = can(regex("^[A-Za-z0-9.-]+$", var.public_hostname)) && !startswith(var.public_hostname, "http")
    error_message = "public_hostname must be a DNS hostname without a URL scheme."
  }
}

variable "certificate_arn" {
  description = "ACM certificate ARN for the public ALB HTTPS listener."
  type        = string
  validation {
    condition     = startswith(var.certificate_arn, "arn:aws:acm:")
    error_message = "certificate_arn must be an ACM certificate ARN."
  }
}

variable "jwt_jwks_url" {
  description = "HTTPS JWKS endpoint used to authenticate clients."
  type        = string
  validation {
    condition     = startswith(var.jwt_jwks_url, "https://")
    error_message = "jwt_jwks_url must use HTTPS."
  }
}

variable "jwt_issuer" {
  description = "Expected JWT issuer."
  type        = string
}

variable "jwt_audience" {
  description = "Expected JWT audience."
  type        = string
  default     = "collabhub"
}

variable "instance_type" {
  description = "2C4G VM baseline. t3.medium is burstable; choose a fixed-performance family for measured production SLOs."
  type        = string
  default     = "t3.medium"
}

variable "min_instances" {
  description = "Minimum VM count. Each VM runs one Gateway and one Worker."
  type        = number
  default     = 2
  validation {
    condition     = var.min_instances >= 2
    error_message = "At least two instances are required for writer failover."
  }
}

variable "max_instances" {
  description = "Maximum VM count for the Auto Scaling Group."
  type        = number
  default     = 6
}

variable "container_image" {
  description = "Published or application-owned distributed CollabHub image."
  type        = string
  default     = "ghcr.io/superche/collabhub:1.0.0"
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

variable "ingress_cidrs" {
  description = "CIDRs allowed to reach the HTTPS load balancer."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "deletion_protection" {
  description = "Protect the ALB and RDS instance from accidental deletion."
  type        = bool
  default     = true
}
