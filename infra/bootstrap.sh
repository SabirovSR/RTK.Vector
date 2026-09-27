#!/usr/bin/env bash
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
test "$(id -u)" = 0
test -s /root/vector-admin.pub
test -s /root/vector-ci.pub

apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades apt-listchanges restic jq unzip auditd chrony
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/caddy.gpg
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sed 's#/usr/share/keyrings/caddy-stable-archive-keyring.gpg#/etc/apt/keyrings/caddy.gpg#g' > /etc/apt/sources.list.d/caddy.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin caddy

id vector-admin &>/dev/null || useradd --create-home --shell /bin/bash vector-admin
id vector-deploy &>/dev/null || useradd --create-home --shell /bin/bash vector-deploy
install -d -m 0755 /etc/ssh/authorized_keys
install -m 0644 -o root -g root /root/vector-admin.pub /etc/ssh/authorized_keys/vector-admin
# Deployment access remains disabled until the restricted dispatcher is installed.
install -d -m 0700 /home/vector-admin/.ssh
install -m 0600 /root/vector-admin.pub /home/vector-admin/.ssh/authorized_keys
chown -R vector-admin:vector-admin /home/vector-admin/.ssh
printf 'vector-admin ALL=(ALL) NOPASSWD: ALL\n' > /etc/sudoers.d/vector-admin
chmod 0440 /etc/sudoers.d/vector-admin
visudo -cf /etc/sudoers.d/vector-admin

install -d -m 0700 /etc/vector /var/backups/vector /var/lib/vector-backup
install -d -m 0755 /opt/vector /var/log/vector
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "local",
  "log-opts": {"max-size": "10m", "max-file": "3"},
  "live-restore": true,
  "no-new-privileges": true
}
EOF
systemctl enable --now docker chrony auditd
systemctl restart docker

cat > /etc/fail2ban/jail.d/vector.local <<'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
banaction = ufw
[sshd]
enabled = true
backend = systemd
EOF
systemctl enable --now fail2ban
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/52vector-unattended <<'EOF'
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
install -d /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/vector.conf <<'EOF'
[Journal]
SystemMaxUse=300M
MaxRetentionSec=14day
EOF
systemctl restart systemd-journald

if ! swapon --show | grep -q /swapfile; then
  if [ ! -e /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 0600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi
cat > /etc/sysctl.d/60-vector.conf <<'EOF'
vm.swappiness=10
kernel.kptr_restrict=2
kernel.dmesg_restrict=1
fs.protected_hardlinks=1
fs.protected_symlinks=1
net.ipv4.conf.all.accept_redirects=0
net.ipv4.conf.default.accept_redirects=0
net.ipv4.conf.all.send_redirects=0
net.ipv4.conf.default.send_redirects=0
net.ipv4.conf.all.accept_source_route=0
net.ipv6.conf.all.accept_redirects=0
net.ipv6.conf.default.accept_redirects=0
EOF
sysctl --system >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH key authentication'
ufw allow 80/tcp comment 'ACME and HTTPS redirect'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
ufw status
docker version --format '{{.Server.Version}}'
caddy version
printf 'Bootstrap completed; verify vector-admin SSH before lockdown.\n'
