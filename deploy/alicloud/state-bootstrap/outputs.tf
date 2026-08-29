output "backend_hcl" {
  description = "Copy this value into ../terraform/backend.hcl after applying this bootstrap plan."
  value       = <<-EOT
    bucket              = "${alicloud_oss_bucket.state.bucket}"
    key                 = "collabhub/production.tfstate"
    region              = "${var.region}"
    encrypt             = true
    acl                 = "private"
    tablestore_endpoint = "https://${alicloud_ots_instance.state_lock.name}.${var.region}.ots.aliyuncs.com"
    tablestore_table    = "${alicloud_ots_table.state_lock.table_name}"
    profile             = "${var.credential_profile}"
  EOT
}

output "oss_bucket" {
  value = alicloud_oss_bucket.state.bucket
}

output "tablestore_instance" {
  value = alicloud_ots_instance.state_lock.name
}

output "tablestore_table" {
  value = alicloud_ots_table.state_lock.table_name
}
