variable "region" {
  description = "AWS region for the Lightsail instance. The documented USD price uses us-east-1."
  type        = string
  default     = "us-east-1"
}

variable "availability_zone" {
  description = "Lightsail Availability Zone in the selected region."
  type        = string
  default     = "us-east-1a"
}

variable "name" {
  description = "Name of the CollabHub Lightsail instance and static IP."
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
  description = "Optional custom hostname already pointed at the static IP. Null uses <ip>.sslip.io with automatic HTTPS."
  type        = string
  default     = null
  nullable    = true
  validation {
    condition     = var.public_hostname == null ? true : can(regex("^[A-Za-z0-9.-]+$", var.public_hostname))
    error_message = "public_hostname must be a DNS hostname without a URL scheme."
  }
}

variable "admin_cidr" {
  description = "Optional administrator CIDR for direct SSH. Browser SSH remains available through Lightsail."
  type        = string
  default     = null
  nullable    = true
  validation {
    condition     = var.admin_cidr == null ? true : can(cidrnetmask(var.admin_cidr))
    error_message = "admin_cidr must be a valid IPv4 CIDR."
  }
}

variable "key_pair_name" {
  description = "Optional existing Lightsail key pair for direct SSH."
  type        = string
  default     = null
  nullable    = true
}

variable "blueprint_id" {
  description = "Lightsail OS blueprint."
  type        = string
  default     = "ubuntu_24_04"
}

variable "bundle_id" {
  description = "Lightsail bundle. small_3_0 is 2 vCPU / 2 GB at $12/month in us-east-1; medium_3_0 is 4 GB at $24/month."
  type        = string
  default     = "small_3_0"
}

variable "container_image" {
  description = "Immutable CollabHub distributed runtime image."
  type        = string
  default     = "ghcr.io/superche/collabhub:1.0.0"
}

variable "release_ref" {
  description = "Git tag used to install the matching single-VM Compose profile."
  type        = string
  default     = "v1.0.0"
}

variable "repository_url" {
  description = "Repository containing deploy/indie."
  type        = string
  default     = "https://github.com/superche/collabhub.git"
}

variable "domain_pack_config_json" {
  description = "Optional declarative JSON Domain Pack. Null uses the repository example."
  type        = string
  default     = null
  nullable    = true
}

variable "jwt_issuer" {
  description = "Expected issuer for document-scoped JWTs created by the application backend."
  type        = string
  default     = "my-app"
}

variable "jwt_audience" {
  description = "Expected audience for document-scoped JWTs."
  type        = string
  default     = "collabhub"
}
