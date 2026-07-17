/**
 * EUDIPLO Playground Server (Standalone)
 *
 * Express.js server that handles API requests for all demo use cases.
 * Uses @eudiplo/sdk-core for all EUDIPLO interactions.
 * Serves static files from the public directory.
 */

import express, { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EudiploClient,
  credentialOfferControllerGetOffer,
} from '@eudiplo/sdk-core';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration from environment variables
const config = {
  port: Number.parseInt(process.env.PORT || '8080', 10),
  eudiploUrl: process.env.EUDIPLO_URL || 'http://localhost:3000',
  clientId: process.env.CLIENT_ID || 'root',
  clientSecret: process.env.CLIENT_SECRET || 'root',
  mdlPreferredAuthServer: process.env.MDL_PREFERRED_AUTH_SERVER || 'name',
  mdlAttributeProviderId: process.env.MDL_ATTRIBUTE_PROVIDER_ID || 'claims-provider',
  chainedAuthServer: process.env.CHAINED_AUTH_SERVER || 'chained-auth',
};

// Use case configurations - map use case ID to presentation config
const USE_CASES: Record<string, { presentationConfigId: string; name: string }> = {
  'alcohol-shop': {
    presentationConfigId: 'age-over-16',
    name: 'Alcohol Shop - Age Verification',
  },
  'bank-onboarding': {
    presentationConfigId: 'playground-pid',
    name: 'Bank Onboarding - Identity Verification',
  },
  'sim-activation': {
    presentationConfigId: 'playground-pid',
    name: 'SIM Activation - Identity Verification (TKG §172)',
  },
  'museum-discount': {
    presentationConfigId: 'resident-city',
    name: 'Museum Discount - Berlin Residency Verification',
  },
  'parcel-pickup': {
    presentationConfigId: 'name-only',
    name: 'Parcel Pickup - Recipient Verification',
  },
  'job-portal': {
    presentationConfigId: 'diploma',
    name: 'Job Portal - Diploma Verification',
  },
  'job-portal-full': {
    presentationConfigId: 'diploma-pid',
    name: 'Job Portal - Diploma and Identity Verification',
  },
  'masters-application': {
    presentationConfigId: 'diploma-pid',
    name: 'Masters Application - Diploma and Identity Verification',
  },
  'sports-shop': {
    presentationConfigId: 'loyalty-card',
    name: 'Sports Shop - Member Discount',
  },
  'drive-orange': {
    presentationConfigId: 'driving-license',
    name: 'DriveOrange - Mobile Driving License Verification',
  },
  'supplier-onboarding': {
    presentationConfigId: 'datev-pid',
    name: 'Supplier Onboarding - DATEV Company + PID',
  },
  'event-access': {
    presentationConfigId: 'playground-pid',
    name: 'Event Access - PID Verification for Event Attestation',
  },
};

// Issuance use case configurations
type FlowType = 'authorization_code' | 'pre_authorized_code';
type CredentialClaimDefinition =
  | { type: 'inline'; claims: Record<string, unknown> }
  | { type: 'attributeProvider'; attributeProviderId: string };

const ISSUANCE_USE_CASES: Record<string, {
  credentialConfigId: string;
  name: string;
  flow: FlowType;
  preferredAuthServer?: string;
  defaultCredentialClaims?: Record<string, CredentialClaimDefinition>;
}> = {
  pid: {
    credentialConfigId: 'pid',
    name: 'Personal ID (PID)',
    flow: 'pre_authorized_code',
    preferredAuthServer: config.mdlPreferredAuthServer,
  },
  'university-diploma': {
    credentialConfigId: 'university-diploma',
    name: 'University Diploma',
    flow: 'authorization_code',
    preferredAuthServer: config.chainedAuthServer,
  },
  'loyalty-card': {
    credentialConfigId: 'loyalty-card',
    name: 'Loyalty/Membership Card',
    flow: 'pre_authorized_code',
  },
  'event-access-attestation': {
    credentialConfigId: 'event-access-attestation',
    name: 'Event Access Attestation',
    flow: 'pre_authorized_code',
  },
  'honorary-engagement-card': {
    credentialConfigId: 'honorary',
    name: 'Honorary Engagement Card',
    flow: 'pre_authorized_code',
  },
  'mdl-issuance': {
    credentialConfigId: 'mdl',
    name: 'Mobile Driving Licence (mDL)',
    flow: 'authorization_code',
    preferredAuthServer: config.mdlPreferredAuthServer,
    defaultCredentialClaims: {
      mdl: {
        type: 'attributeProvider',
        attributeProviderId: config.mdlAttributeProviderId,
      },
    },
  },
};

// Create Express app
const app = express();
app.disable('x-powered-by');

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 120, // 120 requests per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// Middleware
app.use(express.json());

// CORS middleware
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Handle CORS preflight
app.options('/{*any}', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Singleton EUDIPLO client - reuses access token across requests
let eudiploClient: EudiploClient | null = null;

function getClient(): EudiploClient {
  eudiploClient ??= new EudiploClient({
      baseUrl: config.eudiploUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
  return eudiploClient;
}

// Detect stale keep-alive socket errors from undici
function isSocketError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    error.message === 'fetch failed' &&
    (error as any).cause?.code === 'UND_ERR_SOCKET'
  );
}

// Retry once on socket errors by resetting the client singleton so a fresh
// connection is established. This handles the common case where undici tries
// to reuse a keep-alive connection that the backend has already closed.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isSocketError(error)) {
      eudiploClient = null; // force new connection on next getClient() call
      return fn();
    }
    throw error;
  }
}

async function createIssuanceOffer(options: {
  credentialConfigurationIds: string[];
  claims?: Record<string, Record<string, unknown>>;
  credentialClaims?: Record<string, CredentialClaimDefinition>;
  flow: FlowType;
  txCode?: string;
  authorizationServer?: string;
}): Promise<{ uri: string; sessionId: string }> {
  await getClient().authenticate();

  const credentialClaims = options.credentialClaims ?? (options.claims
    ? Object.fromEntries(
        Object.entries(options.claims).map(([configId, claims]) => [
          configId,
          {
            type: 'inline',
            claims,
          },
        ])
      )
    : undefined);

  const response = await credentialOfferControllerGetOffer({
    body: {
      response_type: 'uri',
      credentialConfigurationIds: options.credentialConfigurationIds,
      credentialClaims,
      flow: options.flow,
      tx_code: options.flow === 'pre_authorized_code' ? options.txCode : undefined,
      authorization_server: options.authorizationServer,
    },
  });

  if (!response.data) {
    throw new Error('Failed to create issuance offer');
  }

  return {
    uri: response.data.uri,
    sessionId: response.data.session,
  };
}

function toOrigin(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function decodeJwtPayload<T = Record<string, unknown>>(jwt: string): T {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const payload = parts[1];
  const base64 = payload.replaceAll('-', '+').replaceAll('_', '/');
  const jsonPayload = atob(base64);
  return JSON.parse(jsonPayload) as T;
}

function extractResponseUriFromRequestObject(requestObject: string): string {
  const requestPayload = decodeJwtPayload<{ response_uri?: string }>(requestObject);

  if (!requestPayload.response_uri) {
    throw new Error('No response_uri found in request object');
  }

  return requestPayload.response_uri;
}

// Resolve the browser origin for server-side DC API audience binding.
function resolveRequestOrigin(req: Request, bodyOrigin?: string): string | undefined {
  const headerOrigin = req.get('origin');
  const refererOrigin = toOrigin(req.get('referer'));
  const forwardedProto = req.get('x-forwarded-proto');
  const forwardedHost = req.get('x-forwarded-host');
  const forwardedOrigin = forwardedProto && forwardedHost
    ? toOrigin(`${forwardedProto}://${forwardedHost}`)
    : undefined;
  const hostOrigin = req.get('host') ? `${req.protocol}://${req.get('host')}` : undefined;

  return (
    toOrigin(bodyOrigin) ??
    toOrigin(headerOrigin) ??
    refererOrigin ??
    forwardedOrigin ??
    toOrigin(hostOrigin)
  );
}

// API Routes

// GET /api/use-cases - List available use cases
app.get('/api/use-cases', (_req: Request, res: Response) => {
  res.json(
    Object.entries(USE_CASES).map(([id, cfg]) => ({
      id,
      name: cfg.name,
    }))
  );
});

// POST /api/verify - Create a presentation request
app.post('/api/verify', async (req: Request, res: Response) => {
  try {
    const { useCase, redirectUri, origin: bodyOrigin } = req.body as {
      useCase: string;
      redirectUri?: string;
      origin?: string;
    };
    const useCaseConfig = USE_CASES[useCase];

    if (!useCaseConfig) {
      res.status(400).json({ error: `Unknown use case: ${useCase}` });
      return;
    }

    // Create the presentation request
    const { uri, crossDeviceUri, sessionId } = await withRetry(() =>
      getClient().createPresentationRequest({
        configId: useCaseConfig.presentationConfigId,
        redirectUri,
        origin: resolveRequestOrigin(req, bodyOrigin),
      })
    );

    // Return both URIs:
    // - uri: for same-device flow (deep link button) with redirect after completion
    // - crossDeviceUri: for cross-device flow (QR code) without redirect
    res.json({ uri, crossDeviceUri, sessionId });
  } catch (error: any) {
    console.error('API Error (verify):', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// Generate a random transaction code (numeric, 4-6 digits)
function generateTxCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateHonoraryCardId(): string {
  const now = Date.now().toString();
  const randomPart = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
  return `${now}${randomPart}`;
}

// POST /api/issue - Create a credential issuance offer
app.post('/api/issue', async (req: Request, res: Response) => {
  try {
    const { credentialId, claims, credentialClaims, useTxCode, preferredAuthServer } = req.body as {
      credentialId: string;
      claims?: Record<string, unknown>;
      credentialClaims?: Record<string, CredentialClaimDefinition>;
      useTxCode?: boolean;
      preferredAuthServer?: string;
    };
    const issuanceUseCase = ISSUANCE_USE_CASES[credentialId];

    if (!issuanceUseCase) {
      res.status(400).json({ error: `Unknown credential: ${credentialId}` });
      return;
    }

    // Generate transaction code if requested
    const txCode = useTxCode ? generateTxCode() : undefined;
    const selectedAuthServer = preferredAuthServer || issuanceUseCase.preferredAuthServer;

    const claimPayload: Record<string, unknown> = claims ? { ...claims } : {};
    if (credentialId === 'honorary-engagement-card') {
      const providedCardId = claimPayload.card_id;
      claimPayload.card_id =
        typeof providedCardId === 'string' && providedCardId.trim().length > 0
          ? providedCardId.trim()
          : generateHonoraryCardId();
    }

    const effectiveCredentialClaims = credentialClaims
      ?? issuanceUseCase.defaultCredentialClaims
      ?? (Object.keys(claimPayload).length > 0
        ? {
            [issuanceUseCase.credentialConfigId]: {
              type: 'inline' as const,
              claims: claimPayload,
            },
          }
        : undefined);

    // Create the issuance offer
    const { uri, sessionId } = await withRetry(() =>
      createIssuanceOffer({
        credentialConfigurationIds: [issuanceUseCase.credentialConfigId],
        credentialClaims: effectiveCredentialClaims,
        flow: issuanceUseCase.flow,
        txCode,
        authorizationServer: selectedAuthServer,
      })
    );

    res.json({
      uri,
      sessionId,
      txCode,
      cardId: credentialId === 'honorary-engagement-card' ? String(claimPayload.card_id) : undefined,
    });
  } catch (error: any) {
    console.error('API Error (issue):', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// GET /api/session/:id - Get session status
app.get('/api/session/:id', async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id);

    const session = await withRetry(() => getClient().getSession(sessionId));

    // Only return safe data (no raw credentials)
    res.json({
      sessionId,
      status: session.status,
      credentials: session.credentials,
    });
  } catch (error: any) {
    console.error('API Error (session):', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// DC API Routes (Digital Credentials API - browser-native verification)

// POST /api/dc-api/start - Create a DC API presentation request
app.post('/api/dc-api/start', async (req: Request, res: Response) => {
  try {
    const { useCase, origin: bodyOrigin } = req.body as { useCase: string; origin?: string };
    const useCaseConfig = USE_CASES[useCase];

    if (!useCaseConfig) {
      res.status(400).json({ error: `Unknown use case: ${useCase}` });
      return;
    }

    // Create DC API request using the class API (credentials stay on server)
    const session = await getClient().createDcApiPresentationRequest({
      configId: useCaseConfig.presentationConfigId,
      origin: resolveRequestOrigin(req, bodyOrigin),
    });

    if (!session.requestObject) {
      throw new Error('Session does not contain a requestObject');
    }

    // Return safe data to browser (no credentials exposed)
    res.json({
      requestObject: session.requestObject,
      sessionId: session.id,
      responseUri: extractResponseUriFromRequestObject(session.requestObject),
    });
  } catch (error: any) {
    console.error('API Error (dc-api/start):', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// POST /api/dc-api/complete - Complete DC API verification with wallet response
app.post('/api/dc-api/complete', async (req: Request, res: Response) => {
  try {
    const { responseUri, walletResponse } = req.body as {
      responseUri: string;
      walletResponse: { response?: string; error?: string; error_description?: string } | string;
    };

    if (!responseUri || !walletResponse) {
      res.status(400).json({ error: 'Missing responseUri or walletResponse' });
      return;
    }

    const submitResponse = await fetch(responseUri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...(typeof walletResponse === 'string' ? { response: walletResponse } : walletResponse),
        sendResponse: true,
      }),
    });    

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      throw new Error(`Failed to submit presentation: ${submitResponse.status} ${errorText}`);
    }

    const result = await submitResponse.json();

    res.json(result);
  } catch (error: any) {
    console.error('API Error (dc-api/complete):', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// Serve static files from public directory
const publicDir = path.resolve(__dirname, '..', 'public');

app.use(express.static(publicDir));

// Fallback to index.html for SPA-like behavior (serve index.html for directories)
app.get('/{*any}', (req: Request, res: Response) => {
  const requestPath = req.path;

  // Files with extensions are handled by express.static, return 404 for missing files
  if (requestPath.includes('.')) {
    res.status(404).send('Not Found');
    return;
  }

  // Sanitize path to prevent path traversal attacks
  // path.normalize removes redundant separators and resolves . and .. segments
  const normalizedPath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
  const indexPath = path.resolve(publicDir, normalizedPath.slice(1), 'index.html');

  // Ensure the resolved path is still within publicDir (prevent path traversal)
  if (!indexPath.startsWith(publicDir)) {
    res.status(403).send('Forbidden');
    return;
  }

  res.sendFile(indexPath, (err) => {
    if (err) {
      // Fallback to main index.html
      res.sendFile(path.join(publicDir, 'index.html'));
    }
  });
});

// Start server
app.listen(config.port, () => {
  console.log(`🎮 EUDIPLO Playground running at http://localhost:${config.port}`);
  console.log(`📡 EUDIPLO Backend: ${config.eudiploUrl}`);
});
