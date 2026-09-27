#!/usr/bin/env bash
set -Eeuo pipefail
test -s /etc/ssh/authorized_keys/vector-admin
test -s /etc/ssh/authorized_keys/vector-deploy
cat > /etc/ssh/sshd_config.d/00-vector-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
AuthorizedKeysFile /etc/ssh/authorized_keys/%u
AllowUsers vector-admin vector-deploy
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
PermitTunnel no
AllowTcpForwarding local
ClientAliveInterval 300
ClientAliveCountMax 2
Match User vector-deploy
    AllowTcpForwarding no
    PermitTTY no
Match all
EOF
sshd -t
systemctl reload ssh
passwd -l root
printf 'SSH root/password login disabled.\n'
