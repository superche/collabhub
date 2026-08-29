variable "region" {
  description = "Alibaba Cloud region for the Terraform state backend."
  type        = string
  default     = "cn-hangzhou"
}

variable "credential_profile" {
  description = "Alibaba Cloud CLI profile used by Terraform."
  type        = string
  default     = "collabhub-certification"
}

variable "account_id" {
  description = "Confirmed Alibaba Cloud account ID. Used only to create globally unique names."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{8,32}$", var.account_id))
    error_message = "account_id must be the numeric ID printed by identity.sh."
  }
}

variable "name" {
  description = "Short resource prefix."
  type        = string
  default     = "collabhub"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.name))
    error_message = "name must contain 3-21 lowercase letters, digits, or hyphens."
  }
}
