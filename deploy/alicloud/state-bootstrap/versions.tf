terraform {
  required_version = ">= 1.7.0"

  required_providers {
    alicloud = {
      source  = "aliyun/alicloud"
      version = ">= 1.240, < 2.0"
    }
  }
}

provider "alicloud" {
  region  = var.region
  profile = var.credential_profile
}
