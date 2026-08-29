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

output "jwt_secret_name" {
  description = "KMS secret your existing backend reads for the simple auth mode. Null when jwt_jwks_url is configured."
  value       = var.jwt_jwks_url == null ? alicloud_kms_secret.jwt[0].secret_name : null
}

output "runtime_shape" {
  value = "${var.instance_count} x ${var.instance_type}; one Gateway and one Worker per VM"
}
