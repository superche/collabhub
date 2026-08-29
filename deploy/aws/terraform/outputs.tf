output "public_ip" {
  description = "Static public IPv4 address attached to the Lightsail instance."
  value       = aws_lightsail_static_ip.this.ip_address
}

output "public_hostname" {
  description = "Hostname used by Caddy for automatic HTTPS."
  value       = local.hostname
}

output "websocket_url" {
  description = "CollabHub URL for VITE_COLLABHUB_URL."
  value       = "wss://${local.hostname}/collab"
}

output "health_url" {
  value = "https://${local.hostname}/readyz"
}

output "lightsail_plan" {
  description = "The default small_3_0 plan is advertised at $12/month in us-east-1 before tax or transfer overage."
  value       = var.bundle_id
}

output "browser_ssh" {
  description = "Open the Lightsail instances page and choose Connect using SSH."
  value       = "https://lightsail.aws.amazon.com/ls/webapp/home/instances"
}
