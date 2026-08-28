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

output "runtime_shape" {
  value = "${var.instance_count} x ${var.instance_type}; one Gateway and one Worker per VM"
}
