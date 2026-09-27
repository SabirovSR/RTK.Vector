#!/usr/bin/env bash
set -Eeuo pipefail
cd /root/vector-infra
install -m 0755 vector-deploy-dispatch /usr/local/bin/
for script in vector-deploy vector-backup vector-monitor vector-configure-mail; do
    install -m 0755 "$script" /usr/local/sbin/
done
install -m 0644 compose.production.yaml /opt/vector/
install -m 0755 postgres-init.sh /opt/vector/
install -m 0644 vector-*.service vector-*.timer /etc/systemd/system/
printf 'restrict,command="/usr/local/bin/vector-deploy-dispatch" %s\n' "$(cat /root/vector-ci.pub)" > /etc/ssh/authorized_keys/vector-deploy
chown root:root /etc/ssh/authorized_keys/vector-admin /etc/ssh/authorized_keys/vector-deploy
chmod 0644 /etc/ssh/authorized_keys/vector-admin /etc/ssh/authorized_keys/vector-deploy
printf 'vector-deploy ALL=(root) NOPASSWD: /usr/local/sbin/vector-deploy\n' > /etc/sudoers.d/vector-deploy
chmod 0440 /etc/sudoers.d/vector-deploy
visudo -cf /etc/sudoers.d/vector-deploy
install -m 0644 Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
systemctl daemon-reload
