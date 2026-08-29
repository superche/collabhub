terraform {
  required_version = ">= 1.7.0"

  # Account-specific values live in the ignored backend.hcl file.
  backend "oss" {}

  required_providers {
    alicloud = {
      source  = "aliyun/alicloud"
      version = ">= 1.240, < 2.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.6, < 4.0"
    }
  }
}

provider "alicloud" {
  region  = var.region
  profile = var.credential_profile
}
