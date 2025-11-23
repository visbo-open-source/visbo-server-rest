# VISBO ReST Server – Private Cloud Deployment Guide

## Disclaimer: The following deployment guides were generated with the assistance of an AI system (ChatGPT 5.1).
They are provided solely for informational and convenience purposes. VISBO GmbH does not provide any warranty, express or implied, regarding the accuracy, completeness, correctness, or suitability of these deployment examples for any particular use case or environment.

Any use of these guides is strictly at the user’s own risk. Users are responsible for independently validating all deployment steps, configurations and security settings before using the software in production environments.

## Short description: This guide explains how to deploy the VISBO ReST Server in a **private cloud** environment, such as:

- VMware vSphere
- OpenStack
- Proxmox VE
- Private IaaS platforms
- Hosted virtual machines in a corporate network

The deployment approach is similar to public cloud (AWS), but all infrastructure components are under your organizational control.

## 1. Architecture Overview

Typical components:

- VM(s) running the VISBO ReST Server (Node.js + Express)
- MongoDB cluster or replica set (self-hosted)
- Redis instance or cluster
- Load balancer (NGINX, HAProxy, F5, etc.)
- Corporate PKI for TLS certificates
- Optional: Kubernetes clusters running the Docker image of VISBO ReST

## 2. VM-Based Deployment

### 2.1 Provision a VM

- Linux VM (Ubuntu 20.04/22.04 recommended)
- Appropriate CPU/RAM sizing for your expected load
- Network connectivity to MongoDB, Redis, and any authentication providers

### 2.2 Install Dependencies

On the VM:

```bash
sudo apt update
sudo apt install -y nginx git build-essential
```

Install Node.js 18+:

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

Install PM2:

```bash
sudo npm install -g pm2
```

### 2.3 Clone and Install VISBO ReST

```bash
git clone https://github.com/visbo-open-source/visbo-server-rest.git
cd visbo-server-rest
npm install
```

### 2.4 Configure Environment

Create and configure the `.env` file with:

- MongoDB connection
- Redis connection
- Logging
- Secrets

### 2.5 Start with PM2

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

## 3. Container-Based Deployment (Docker)

You can also deploy via Docker containers on your private cloud:

```bash
docker build -t visbo-rest .
docker run -d --name visbo-rest -p 3484:3484 --env-file .env visbo-rest
```

For higher security and flexibility, use a **private registry**:

```bash
docker tag visbo-rest registry.company.com/visbo/visbo-rest
docker push registry.company.com/visbo/visbo-rest
```

Then pull and run the image on your private cloud nodes.

## 4. Load Balancing & TLS

Use a private load balancer or reverse proxy:

- HAProxy, NGINX, F5, or a built-in private cloud LB.

Terminate TLS at the load balancer using your internal CA or corporate PKI.

## 5. Optional: Kubernetes in Private Cloud

If your private cloud hosts a Kubernetes cluster, see the `README_Kubernetes.md` and the `k8s/` manifests for a full K8s-based deployment of VISBO ReST.

## 6. Monitoring & Operations

- Integrate with corporate monitoring (Prometheus, Zabbix, SCOM, etc.).
- Aggregate logs centrally (ELK, Loki, Splunk, etc.).
- Use regular OS patching and security scans.
