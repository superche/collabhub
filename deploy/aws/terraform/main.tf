locals {
  hostname = var.public_hostname != null ? var.public_hostname : "${aws_lightsail_static_ip.this.ip_address}.sslip.io"
  domain_pack_source = coalesce(
    var.domain_pack_config_json,
    file("${path.module}/../../domain-pack/domain-pack.example.json"),
  )
}

resource "aws_lightsail_static_ip" "this" {
  name = "${var.name}-ip"
}

resource "aws_lightsail_instance" "this" {
  name              = var.name
  availability_zone = var.availability_zone
  blueprint_id      = var.blueprint_id
  bundle_id         = var.bundle_id
  key_pair_name     = var.key_pair_name

  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    allowed_origin     = var.allowed_origin
    container_image    = var.container_image
    domain_pack_base64 = base64encode(local.domain_pack_source)
    hostname           = local.hostname
    jwt_audience       = var.jwt_audience
    jwt_issuer         = var.jwt_issuer
    release_ref        = var.release_ref
    repository_url     = var.repository_url
  })

  tags = {
    Service = "collabhub"
    Profile = "indie-single-vm"
  }
}

resource "aws_lightsail_static_ip_attachment" "this" {
  static_ip_name = aws_lightsail_static_ip.this.name
  instance_name  = aws_lightsail_instance.this.name
}

resource "aws_lightsail_instance_public_ports" "this" {
  instance_name = aws_lightsail_instance.this.name

  port_info {
    protocol          = "tcp"
    from_port         = 22
    to_port           = 22
    cidr_list_aliases = ["lightsail-connect"]
    cidrs             = var.admin_cidr == null ? [] : [var.admin_cidr]
  }

  port_info {
    protocol   = "tcp"
    from_port  = 80
    to_port    = 80
    cidrs      = ["0.0.0.0/0"]
    ipv6_cidrs = ["::/0"]
  }

  port_info {
    protocol   = "tcp"
    from_port  = 443
    to_port    = 443
    cidrs      = ["0.0.0.0/0"]
    ipv6_cidrs = ["::/0"]
  }
}
