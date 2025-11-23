# VISBO ReST Server

## Disclaimer: The following deployment guides were generated with the assistance of an AI system (ChatGPT 5.1).
They are provided solely for informational and convenience purposes. VISBO GmbH does not provide any warranty, express or implied, regarding the accuracy, completeness, correctness, or suitability of these deployment examples for any particular use case or environment.

Any use of these guides is strictly at the user’s own risk. Users are responsible for independently validating all deployment steps, configurations and security settings before using the software in production environments.


## Short description: The **VISBO ReST Server** is the backend API of the VISBO platform.  
It provides a secure, multi-tenant REST API for managing VISBO portfolio data (VC, VP, VPV, VPF, users, permissions, logging, configuration, etc.) and is designed to run in a SaaS environment behind an NGINX reverse proxy.

- Runtime: **Node.js 16+**
- Framework: **Express.js** with **Mongoose (MongoDB)** and **Redis** for caching
- Deployment: **PM2** (ecosystem file) and **Docker** support

## Features

- Secure REST API implemented with **Node.js + Express**  
- MongoDB-based data model (via **Mongoose**)  
- Redis integration for caching configuration and system values  
- Internationalization (i18n), logging (log4js), email support (Nodemailer)  
- PM2 cluster mode support via `ecosystem.config.js`  
- Docker image & helper scripts for local Redis + REST server setup  
- Extensive Postman collections for automated end-to-end testing of the REST API  
- API documentation generated with **apidoc** and served via `/apidoc`  

## Architecture Overview

The VISBO ReST Server is a stateless HTTP API service that typically runs behind NGINX or a cloud load balancer:

- **Client** (VISBO web UI, integrations)
- **NGINX / Load Balancer**
- **VISBO ReST Server (this repository)**  
  - Node.js / Express
  - MongoDB (Atlas or self-hosted)
  - Redis (cache)
- **External services**
  - SMTP server (email)
  - Authentication providers (e.g. Google OAuth via Passport)

For AWS-based deployment and scaling (multi-server, load balancer, VPC, Atlas peering, etc.) please refer to the dedicated installation guide.

## Requirements

- **Node.js**: 16 or newer (tested with Node 16)  
- **npm**: 8+  
- **MongoDB**: e.g. MongoDB Atlas or compatible instance  
- **Redis**: for caching (can be local Docker container or managed service)  

Optional but recommended:

- **PM2**: for production process management  
- **Docker**: for containerized deployments  

## Getting Started (Local Development)

### 1. Clone the repository

```bash
git clone https://github.com/visbo-open-source/visbo-server-rest.git
cd visbo-server-rest
```

### 2. Install dependencies

```bash
npm install
```

This installs all required Node.js dependencies as defined in `package.json`.

### 3. Configure environment (`.env`)

Create a `.env` file in the project root based on `env-empty` (or your internal template).

Typical environment variables include:

```ini
DB_HOST=mongodb://your-mongo-host:27017/visbo
DB_USER=your-mongo-user
DB_PASS=your-mongo-password

REDIS_HOST=localhost
REDIS_PORT=6379

SERVER_PORT=3484
NODE_ENV=development

LOG_FOLDER=./logging
LOG_LEVEL=info

JWT_SECRET=your-jwt-secret
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

### 4. Start Redis (optional via Docker)

```bash
npm run docker:network
npm run docker:redis
```

### 5. Start the server (development mode)

```bash
npm start
```

Or with nodemon:

```bash
nodemon ./bin/www
```

---

## Production Mode (PM2)

```bash
pm2 start ecosystem.config.js --env production
```

Useful PM2 commands:

```bash
pm2 status
pm2 logs VisboReST
pm2 restart VisboReST
pm2 stop VisboReST
pm2 delete VisboReST
```

---

## Docker Usage

### 1. Build the Docker image

```bash
npm run docker:rest-up
```

### 2. Run Redis via Docker

```bash
npm run docker:network
npm run docker:redis
```

### 3. Run the REST server container

```bash
docker run --rm   --name visbo-rest   --network redis_network   -p 3484:3484   --env-file .env   visbo-rest
```

---

## API Documentation

### View API docs

```text
http://localhost:3484/apidoc/
```

### Regenerate docs

```bash
apidoc -i routes -o public/apidoc
```

---

## Testing

### Postman Flows

Flow collections exist for:

- full test including permissions)
- cleanup of test data
- Migration Scenarios, from local MONGODB to Atlas MongoDB
- .. 

Please check out the according ../postman folder

### Test via npm

```bash
npm test
npm run testWin
npm run testWin100
```

---

## Security & Audit

```bash
npm run audit
npm run auditWin
```

---

## Additional Documentation

See:

- *Visbo ReST Server and UI installation on AWS*
- *Visbo ReST Server and UI Testing*

Please check out the according ../docs folder
---

## License & Contribution

Licensed under:

- **AGPLv3** with **Commons Clause**

Contributions require acceptance of:

- **VISBO Contributor License Agreement (CLA)**  
