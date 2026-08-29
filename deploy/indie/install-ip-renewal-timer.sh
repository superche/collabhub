#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
[[ "$(id -u)" == "0" ]] || { echo "Run this installer as root." >&2; exit 1; }

deployment_dir="$PWD"

install -m 0644 /dev/stdin /etc/systemd/system/collabhub-ip-certificate.service <<EOF
[Unit]
Description=Renew CollabHub short-lived IP certificate
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${deployment_dir}
ExecStart=${deployment_dir}/renew-ip-certificate.sh
EOF

install -m 0644 /dev/stdin /etc/systemd/system/collabhub-ip-certificate.timer <<'EOF'
[Unit]
Description=Check CollabHub IP certificate twice daily

[Timer]
OnBootSec=15m
OnUnitActiveSec=12h
RandomizedDelaySec=10m
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now collabhub-ip-certificate.timer
systemctl list-timers collabhub-ip-certificate.timer --no-pager
