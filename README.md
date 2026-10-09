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

| Variable                    | Default                 | Description                                            |
| --------------------------- | ----------------------- | ------------------------------------------------------ |
| `PORT`                      | `8080`                  | Port for the playground server                         |
| `EUDIPLO_URL`               | `http://localhost:3000` | URL of the EUDIPLO backend                             |
| `CLIENT_ID`                 | `root`                  | Client ID for EUDIPLO API authentication               |
| `CLIENT_SECRET`             | `root`                  | Client secret for EUDIPLO API authentication           |
| `MDL_PREFERRED_AUTH_SERVER` | `name`                  | Preferred authorization server for mDL issuance offers |
| `MDL_ATTRIBUTE_PROVIDER_ID` | `claims-provider`       | Attribute provider ID used for mDL credential claims   |

For local development, create a `.env` file:

```bash
cp .env.example .env
# Edit .env with your configuration
```

## EUDIPLO Tenant Configuration

The EUDIPLO configuration for the playground (clients, keys, credential and
presentation configs, ...) lives in [`eudiplo-config/playground/`](eudiplo-config/playground).
The folder name `playground` is the tenant ID.

Secrets are not stored in the repository. The config files reference them as
`${VAR}` placeholders, which EUDIPLO resolves from its environment during config
import. All required variables are listed in
[`eudiplo-config/.env.example`](eudiplo-config/.env.example).

`registrar.json` is the exception: EUDIPLO does not resolve placeholders in it yet
([EUDIPLO/eudiplo#1087](https://github.com/EUDIPLO/eudiplo/issues/1087)),
so it is gitignored. Create it from
[`registrar.example.json`](eudiplo-config/playground/registrar.example.json) on the server.

### Deploying the config

1. Check out this repository on the EUDIPLO host.
2. Provide the variables from `eudiplo-config/.env.example` to the EUDIPLO backend.
3. Create `eudiplo-config/playground/registrar.json`.
4. Point EUDIPLO at the config, either by setting `CONFIG_FOLDER` to the
   `eudiplo-config` folder or by symlinking it:

   ```bash
   ln -s /path/to/playground/eudiplo-config /path/to/eudiplo/config
   ```

   Symlink the whole config folder, not the tenant folder: EUDIPLO skips
   symlinked tenant folders when scanning `CONFIG_FOLDER`. When EUDIPLO runs in
   Docker, bind-mount `eudiplo-config` instead, since a symlink target outside
   the container is not visible inside it. The `eudiplo` service in
   [`docker-compose.yml`](docker-compose.yml) does this and reads the secrets
   from `eudiplo-config/.env`.

To validate the config locally with the EUDIPLO CLI (the variables must be set):

```bash
eudiplo config validate tenant eudiplo-config/playground
```

The credential card images in `eudiplo-config/playground/images/` are generated
by [`scripts/generate-card-images.py`](scripts/generate-card-images.py)
(requires `rsvg-convert`). Add new cards there so all cards share one style.

The EUDIMON cards (`eudimon-<starter>.png` and `-logo.png`) use a pixel style
instead and are generated together with the EUDIMON sprites
(`src/client/shared/eudimon-sprites.ts`) by
[`scripts/generate-eudimon-sprites.py`](scripts/generate-eudimon-sprites.py).

When adding a verification use case, add its presentation config to
`eudiplo-config/playground/presentation/` and reference its `id` in `USE_CASES` in
`src/server.ts`.

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
- **Club Nocturne** - Over-asking demo: needs only age 18+, but also requests name and address
- **Nordic Digital Bank** - Full KYC/identity verification
- **TechMarkt SIM Activation** - Identity verification per TKG §172
- **Berlin History Museum** - Residency verification for discounts
- **SwiftBox Parcel Locker** - Minimal name-only verification
- **DRH Helfernetz** - Crisis helper registration: PID (name, age 18+, postal code, city) plus a first aid certificate or Ehrenamtskarte, with self-reported contact details

### Issuance Use Cases (EAA)

- **Get Demo PID** - Issue a test Personal ID credential
- **European Technical University** - Digital diploma issuance (Authorization Code Flow)
- **FitLife Health Club** - Loyalty card issuance (Pre-authorized Code Flow)
- **DRH Bildungswerk** - First aid certificate issuance, valid for two years (Pre-authorized Code Flow)

### EUDIMON

A Gen 1 style game built on two use cases. It is an easter egg: the start page has no card for it, only the small pixel ball in the footer links to `/eudimon/`.

- **Professor Oak's Lab** (`/eudimon/`) - Pick Bulbasaur, Charmander or Squirtle and receive it as a credential (Pre-authorized Code Flow, optional PIN). Each starter has its own credential config (`eudimon-<starter>`) and card; the four moves are separate claims `move_1` to `move_4`
- **EUDIMON Arena** (`/eudimon/arena/`) - Turn-based battle against Gary. Wallets answer a DCQL query with the first matching option, so the choices happen on the page: `eudimon-battle` sends out the EUDIMON (species, nickname, level; one credential query per species in a `credential_sets` entry), and the first use of a move requests exactly that move with `eudimon-move-1` to `eudimon-move-4`. Known moves need no new request. An "Under the hood" panel logs every request and what was disclosed; the battle state survives the same-device redirect (localStorage)

Both pages play original 8-bit tunes in the Gen 1 style, synthesized with the Web Audio API
(`src/client/shared/chiptune.ts`, songs in `src/client/shared/eudimon-music.ts`). Music starts
with the first click or key press and can be switched off in the header.

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
│       ├── eudimon-lab/         # EUDIMON issuance (Professor Oak)
│       ├── eudimon-arena/       # EUDIMON verification (one request per move)
│       └── ...
├── public/              # Static files (HTML, CSS)
│   ├── index.html
│   ├── shared/
│   └── [use-case]/
├── eudiplo-config/      # EUDIPLO tenant config (secrets via env variables)
│   ├── .env.example
│   └── playground/      # Tenant "playground"
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
