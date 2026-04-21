# EUDIPLO Playground

A Docker-deployable Node.js/Express playground for testing EUDI Wallet integrations.

## Overview

This playground application provides demo use cases for testing your EUDI Wallet with real-world verification scenarios. It can be deployed anywhere using Docker.

## Features

- 🐳 Docker-ready deployment
- 🔌 Express.js backend with REST API
- 🎨 Same demo use cases as the original playground
- 🔐 Connects to any EUDIPLO backend instance
- 📱 Responsive UI for desktop and mobile

## Quick Start

### Option 1: Local Development

```bash
# Install dependencies
pnpm install

# Start in development mode (with hot reload)
pnpm run dev

# The playground will be available at http://localhost:8080
```

### Option 2: Docker

```bash
# Build and run with Docker Compose
docker compose up -d

# Or build the image manually
docker build -t eudiplo-playground .
docker run -p 8080:8080 \
  -e EUDIPLO_URL=http://your-eudiplo-backend:3000 \
  -e CLIENT_ID=your-client-id \
  -e CLIENT_SECRET=your-client-secret \
  eudiplo-playground
```

### Option 3: Use Pre-built Image

```bash
# Pull from GitHub Container Registry
docker pull ghcr.io/YOUR_ORG/playground:latest

docker run -p 8080:8080 \
  -e EUDIPLO_URL=http://your-eudiplo-backend:3000 \
  -e CLIENT_ID=your-client-id \
  -e CLIENT_SECRET=your-client-secret \
  ghcr.io/YOUR_ORG/playground:latest
```

## Configuration

Configure the playground using environment variables:

| Variable        | Default                 | Description                                  |
| --------------- | ----------------------- | -------------------------------------------- |
| `PORT`          | `8080`                  | Port for the playground server               |
| `EUDIPLO_URL`   | `http://localhost:3000` | URL of the EUDIPLO backend                   |
| `CLIENT_ID`     | `root`                  | Client ID for EUDIPLO API authentication     |
| `CLIENT_SECRET` | `root`                  | Client secret for EUDIPLO API authentication |

For local development, create a `.env` file:

```bash
cp .env.example .env
# Edit .env with your configuration
```

## API Endpoints

The playground exposes the following API endpoints:

| Method | Path               | Description                           |
| ------ | ------------------ | ------------------------------------- |
| `GET`  | `/api/use-cases`   | List available verification use cases |
| `POST` | `/api/verify`      | Create a presentation request         |
| `POST` | `/api/issue`       | Create a credential issuance offer    |
| `GET`  | `/api/session/:id` | Get session status                    |

## Available Demo Use Cases

### Verification Use Cases

- **Vineyard Select** - Age verification (16+)
- **Nordic Digital Bank** - Full KYC/identity verification
- **TechMarkt SIM Activation** - Identity verification per TKG §172
- **Berlin History Museum** - Residency verification for discounts
- **Alpine Grand Hotel** - Guest registration check-in
- **SwiftBox Parcel Locker** - Minimal name-only verification

### Issuance Use Cases (EAA)

- **Get Demo PID** - Issue a test Personal ID credential
- **European Technical University** - Digital diploma issuance (Authorization Code Flow)
- **FitLife Health Club** - Loyalty card issuance (Pre-authorized Code Flow)

## Project Structure

```
playground/
├── src/
│   ├── server.ts        # Express.js server
│   └── client/          # Client-side TypeScript
│       ├── shared/      # Shared utilities
│       ├── alcohol-shop/
│       ├── bank-onboarding/
│       ├── university-diploma/  # EAA - Auth Code Flow
│       ├── loyalty-card/        # EAA - Pre-auth Code Flow
│       └── ...
├── public/              # Static files (HTML, CSS)
│   ├── index.html
│   ├── shared/
│   └── [use-case]/
├── Dockerfile           # Docker build
├── docker-compose.yml   # Docker Compose for deployment
├── package.json         # Package config
└── README.md
```

## Building for Production

```bash
# Build the application
pnpm run build

# Start in production mode
pnpm run start
```

## License

Apache-2.0
