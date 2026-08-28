output "websocket_url" {
  description = "Public CollabHub WebSocket URL after public_hostname points at alb_dns_name."
  value       = "wss://${var.public_hostname}/collab"
}

output "alb_dns_name" {
  value = aws_lb.this.dns_name
}

output "postgres_endpoint" {
  value = aws_db_instance.postgres.endpoint
}

output "redis_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "runtime_shape" {
  value = "${var.min_instances} x ${var.instance_type}; one Gateway and one Worker per VM"
}
