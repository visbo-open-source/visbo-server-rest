# VISBO ReST Server – System Overview

The VISBO ReST Server is the central backend component of the VISBO platform. It exposes a REST API for:

* Managing VISBO Centers (VC)
* Managing VISBO Projects (VP)
* Managing VISBO Project Versions (VPV) and VISBO Portfolios (VPF)
* User management and permissions
* Logging, configuration, and system-wide audit data

## Components

* **VISBO ReST Server**

  * Node.js + Express
  * Runs as a stateless HTTP API service

* **Data Layer**

  * MongoDB (Atlas or self-hosted)
  * Redis for caching configuration and system values

* **Clients**

  * VISBO Web UI
  * Integrations and external tools (e.g. OpenProject bridge)

* **Deployment Environments**

  * SaaS / public cloud (AWS)
  * On-Premise
  * Private Cloud
  * Kubernetes clusters



The VISBO ReST Server is designed to be horizontally scalable and stateless, making it suitable for both traditional VM deployments and modern container-orchestrated environments.

