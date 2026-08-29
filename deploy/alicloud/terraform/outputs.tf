output "websocket_url" {
  description = "Public CollabHub WebSocket URL after public_hostname points at alb_dns_name."
  value       = "wss://${var.public_hostname}/collab"
}

output "alb_dns_name" {
  value = alicloud_alb_load_balancer.this.dns_name
}

output "postgres_endpoint" {
  value = alicloud_db_instance.postgres.connection_string
}

output "redis_endpoint" {
  value = alicloud_kvstore_instance.redis.connection_domain
}

output "jwt_secret_object_uri" {
  description = "Private OSS object your existing backend may read for the simple auth mode. Null when jwt_jwks_url is configured."
  value       = var.jwt_jwks_url == null ? "oss://${alicloud_oss_bucket.runtime_secrets.bucket}/${local.secret_object_keys.jwt}" : null
}

output "runtime_shape" {
  value = "${var.instance_count} x ${var.instance_type}; one Gateway and one Worker per VM"
}
