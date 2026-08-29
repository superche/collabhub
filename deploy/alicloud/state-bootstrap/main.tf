locals {
  account_suffix = substr(var.account_id, 0, 8)
  bucket_name    = "${var.name}-tfstate-${var.account_id}-${var.region}"
  ots_name       = "ch-tf-${local.account_suffix}"
  table_name     = "terraform_state_locks"
  tags           = { Project = var.name, ManagedBy = "Terraform", Service = "terraform-state" }
}

resource "alicloud_oss_bucket" "state" {
  bucket          = local.bucket_name
  force_destroy   = false
  storage_class   = "Standard"
  redundancy_type = "LRS"
  tags            = local.tags

  versioning {
    status = "Enabled"
  }

  server_side_encryption_rule {
    sse_algorithm = "AES256"
  }
}

resource "alicloud_oss_bucket_acl" "state" {
  bucket = alicloud_oss_bucket.state.bucket
  acl    = "private"
}

resource "alicloud_oss_bucket_public_access_block" "state" {
  bucket              = alicloud_oss_bucket.state.bucket
  block_public_access = true
}

resource "alicloud_ots_instance" "state_lock" {
  name          = local.ots_name
  description   = "Terraform state locks for CollabHub"
  instance_type = "Capacity"
  accessed_by   = "Any"
  tags          = local.tags
}

resource "alicloud_ots_table" "state_lock" {
  instance_name = alicloud_ots_instance.state_lock.name
  table_name    = local.table_name
  max_version   = 1
  time_to_live  = -1

  primary_key {
    name = "LockID"
    type = "String"
  }
}
