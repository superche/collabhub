terraform {
  required_version = ">= 1.7.0"

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
  region = var.region
}
