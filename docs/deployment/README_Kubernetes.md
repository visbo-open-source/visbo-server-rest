# VISBO ReST Server – Kubernetes Deployment Guide

## Disclaimer: The following deployment guides were generated with the assistance of an AI system (ChatGPT 5.1).
They are provided solely for informational and convenience purposes. VISBO GmbH does not provide any warranty, express or implied, regarding the accuracy, completeness, correctness, or suitability of these deployment examples for any particular use case or environment.

Any use of these guides is strictly at the user’s own risk. Users are responsible for independently validating all deployment steps, configurations and security settings before using the software in production environments.

## Short description: This guide explains how to deploy the **VISBO ReST Server** on a Kubernetes cluster.

The VISBO ReST Server is a stateless Node.js / Express API that exposes its HTTP endpoint on port **3484** and reads configuration from environment variables (similar to the existing `.env` file). Kubernetes is responsible for:

- Running one or more instances (Pods) of the REST server
- Restarting Pods on failure
- Exposing the service internally and externally
- Injecting configuration via ConfigMaps and Secrets
- Handling rolling updates with minimal or no downtime

## 1. Prerequisites

- Kubernetes cluster (on-premise, private cloud, or managed)
- `kubectl` configured
- Built and pushed Docker image for VISBO ReST (e.g. `visbo/visbo-server-rest:latest`)
- Ingress controller if you want external access (e.g. NGINX Ingress)

## 2. Resources

See the `k8s/` folder:

- `namespace.yaml`
- `configmap-visbo-rest.yaml`
- `secret-visbo-rest.yaml`
- `deployment-visbo-rest.yaml`
- `service-visbo-rest.yaml`
- `ingress-visbo-rest.yaml`
- `kustomization.yaml`

Apply all with:

```bash
kubectl apply -k k8s/
```

Adjust hostnames, image name, and secrets before applying.

