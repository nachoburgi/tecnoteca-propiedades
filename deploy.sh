#!/usr/bin/env bash
# Deploy al Cloud Server de DonWeb en un comando:  ./deploy.sh root@IP
# Sube el código (sin node_modules ni .env), instala Node si falta y deja la app como servicio en el puerto 80.
set -euo pipefail
DEST="${1:?Uso: ./deploy.sh usuario@IP}"
KEY="${SSH_KEY:-$HOME/.ssh/donweb_hackaton}"
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new"

tar --exclude=node_modules --exclude=.env --exclude=.git -czf /tmp/lola.tgz .
scp -i "$KEY" -o StrictHostKeyChecking=accept-new /tmp/lola.tgz "$DEST:/tmp/lola.tgz"
[ -f .env.server ] && scp -i "$KEY" .env.server "$DEST:/tmp/lola.env"

$SSH "$DEST" 'bash -s' <<'REMOTO'
set -e
APP=/opt/lola
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  if command -v apt-get >/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs
  else
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - && (dnf install -y nodejs || yum install -y nodejs)
  fi
fi
mkdir -p $APP && tar -xzf /tmp/lola.tgz -C $APP
[ -f /tmp/lola.env ] && mv /tmp/lola.env $APP/.env && chmod 600 $APP/.env
cd $APP && npm ci --omit=dev --silent
cat > /etc/systemd/system/lola.service <<UNIT
[Unit]
Description=Litoral Propiedades - Lola
After=network.target
[Service]
WorkingDirectory=$APP
Environment=PORT=80
ExecStart=$(command -v node) server.js
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload && systemctl enable --now lola && systemctl restart lola
(command -v ufw >/dev/null && ufw allow 80/tcp) || true
(command -v firewall-cmd >/dev/null && firewall-cmd --permanent --add-service=http && firewall-cmd --reload) || true
sleep 2 && curl -s localhost/api/salud && echo && echo "DEPLOY OK"
REMOTO
