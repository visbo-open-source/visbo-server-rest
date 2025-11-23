# VISBO ReST Server – On-Premise Deployment Guide

## Disclaimer: The following deployment guides were generated with the assistance of an AI system (ChatGPT 5.1).
They are provided solely for informational and convenience purposes. VISBO GmbH does not provide any warranty, express or implied, regarding the accuracy, completeness, correctness, or suitability of these deployment examples for any particular use case or environment.

Any use of these guides is strictly at the user’s own risk. Users are responsible for independently validating all deployment steps, configurations and security settings before using the software in production environments.

## Short description: This guide explains how to deploy the VISBO ReST Server in a traditional on-premise data center environment without public cloud services.

## 1. System Requirements

- Linux server (e.g. Ubuntu 20.04/22.04)
- Node.js 18+ LTS
- MongoDB server (single instance or replica set)
- Redis server
- NGINX as reverse proxy (optional but recommended)
- PM2 for process management
- Proper firewall rules and TLS certificates

## 2. Install System Dependencies

```bash
sudo apt update
sudo apt install -y nginx git build-essential
```

Install Node.js:

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

Install PM2:

```bash
sudo npm install -g pm2
```

Install MongoDB and Redis (example):

```bash
sudo apt install -y mongodb redis-server
```

## 3. Clone and Install VISBO ReST Server

```bash
git clone https://github.com/visbo-open-source/visbo-server-rest.git
cd visbo-server-rest
npm install
```

## 4. Configure Environment (.env)

Create `.env` in the project root and configure:

- MongoDB connection (`DB_HOST`, `DB_USER`, `DB_PASS` if needed)
- Redis host/port
- Logging folder and level
- JWT secrets
- Optional OAuth and SMTP settings

## 5. Start VISBO ReST Server with PM2

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

This ensures the service is restarted on reboot.

## 6. Configure NGINX Reverse Proxy

Example:

```nginx
server {
    listen 443 ssl;
    server_name api.visbo.local;

    location / {
        proxy_pass http://127.0.0.1:3484;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Reload NGINX:

```bash
sudo systemctl reload nginx
```

## 7. TLS and Certificates

- Use your corporate CA or a public CA.
- Place certificates on the NGINX host and configure them in the `server` block.

## 8. Monitoring & Maintenance

- Use `pm2 status`, `pm2 logs`, `pm2 restart` for process supervision.
- Configure OS-level monitoring (e.g. via Prometheus node_exporter, Zabbix, etc.).
- Schedule regular MongoDB backups and OS updates.
