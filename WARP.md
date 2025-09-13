# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is an n8n VPS deployment project. n8n is an open-source workflow automation tool that allows you to connect different services and automate tasks.

## Repository Structure

Currently minimal - the project is in early stages with just a README.md file. The repository structure will likely evolve to include:

- Infrastructure as Code files (Terraform, Docker configurations)
- n8n configuration files
- Deployment scripts
- Documentation

## Common Commands

### Git Operations
```bash
# Check current status
git status

# View recent commits
git log --oneline -10

# View changes
git diff
```

### Development Workflow
Since this is a VPS deployment project, typical commands might include:

```bash
# Docker operations (when implemented)
docker-compose up -d
docker-compose down
docker-compose logs -f

# Infrastructure deployment (when using Terraform)
terraform init
terraform plan
terraform apply

# n8n specific operations (when deployed)
# Access n8n via web interface at http://your-vps:5678
```

## Architecture Notes

This project is for deploying n8n on a VPS (Virtual Private Server). n8n is typically deployed as:

1. **Docker-based deployment** - Most common approach using docker-compose
2. **Direct installation** - Installing n8n directly on the VPS
3. **Infrastructure as Code** - Using tools like Terraform to provision and configure the VPS

Key components typically include:
- n8n application server
- Database (PostgreSQL/MySQL for production)
- Reverse proxy (nginx/traefik)
- SSL certificate management
- Backup and monitoring solutions

## Development Guidelines

When developing this project:

- Use infrastructure as code principles for reproducible deployments
- Implement proper security configurations for VPS access
- Configure SSL/TLS certificates for secure access
- Set up proper database persistence for n8n workflows
- Implement backup strategies for workflow data
- Consider using environment variables for sensitive configuration

## Environment

This project is being developed on Windows using PowerShell. Commands and scripts should be compatible with both Windows development and Linux VPS deployment environments.
