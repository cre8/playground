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
  createDcApiRequestForBrowser,
  submitDcApiWalletResponse,
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
};

// Use case configurations - map use case ID to presentation config
const USE_CASES: Record<string, { presentationConfigId: string; name: string }> = {
  'alcohol-shop': {
    presentationConfigId: 'age-over-18',
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
    presentationConfigId: 'diploma-and-pid',
    name: 'Job Portal - Diploma & Identity Verification',
  },
  'sports-shop': {
    presentationConfigId: 'loyalty-card',
    name: 'Sports Shop - Member Discount',
  },
};

// Credential configurations for issuance
type FlowType = 'authorization_code' | 'pre_authorized_code';
const CREDENTIALS: Record<string, { credentialConfigId: string; name: string; flow: FlowType }> = {
  pid: {
    credentialConfigId: 'pid',
    name: 'Personal ID (PID)',
    flow: 'pre_authorized_code',
  },
  'university-diploma': {
    credentialConfigId: 'university-diploma',
    name: 'University Diploma',
    flow: 'authorization_code',
  },
  'loyalty-card': {
    credentialConfigId: 'loyalty-card',
    name: 'Loyalty/Membership Card',
    flow: 'pre_authorized_code',
  },
};

// Create Express app
const app = express();

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
    const { useCase, redirectUri } = req.body as { useCase: string; redirectUri?: string };
    const useCaseConfig = USE_CASES[useCase];

    if (!useCaseConfig) {
      res.status(400).json({ error: `Unknown use case: ${useCase}` });
      return;
    }

    const client = getClient();

    // Create the presentation request
    const { uri, crossDeviceUri, sessionId } = await client.createPresentationRequest({
      configId: useCaseConfig.presentationConfigId,
      redirectUri,
    });

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

// POST /api/issue - Create a credential issuance offer
app.post('/api/issue', async (req: Request, res: Response) => {
  try {
    const { credentialId, claims, useTxCode } = req.body as {
      credentialId: string;
      claims?: Record<string, unknown>;
      useTxCode?: boolean;
    };
    const credential = CREDENTIALS[credentialId];

    if (!credential) {
      res.status(400).json({ error: `Unknown credential: ${credentialId}` });
      return;
    }

    const client = getClient();

    // Generate transaction code if requested
    const txCode = useTxCode ? generateTxCode() : undefined;

    // Create the issuance offer
    const { uri, sessionId } = await client.createIssuanceOffer({
      credentialConfigurationIds: [credential.credentialConfigId],
      claims: claims ? { [credential.credentialConfigId]: claims } : undefined,
      flow: credential.flow,
      txCode,
    });

    res.json({ uri, sessionId, txCode });
  } catch (error: any) {
    console.error('API Error (issue):', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// GET /api/session/:id - Get session status
app.get('/api/session/:id', async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id);

    const client = getClient();
    const session = await client.getSession(sessionId);

    // Only return safe data (no raw credentials)
    res.json({
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
    const { useCase } = req.body as { useCase: string };
    const useCaseConfig = USE_CASES[useCase];

    if (!useCaseConfig) {
      res.status(400).json({ error: `Unknown use case: ${useCase}` });
      return;
    }

    // Create DC API request using SDK helper (credentials stay on server)
    const requestData = await createDcApiRequestForBrowser({
      baseUrl: config.eudiploUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      configId: useCaseConfig.presentationConfigId,
    });

    // Return safe data to browser (no credentials exposed)
    res.json(requestData);
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
      walletResponse: string;
    };

    if (!responseUri || !walletResponse) {
      res.status(400).json({ error: 'Missing responseUri or walletResponse' });
      return;
    }

    // Submit wallet response to EUDIPLO and get verified claims
    // The walletResponse from the browser DC API is the response property
    const result = await submitDcApiWalletResponse({
      responseUri,
      walletResponse: { response: walletResponse },
      sendResponse: true, // Get verified claims back
    });

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
