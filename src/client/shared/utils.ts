/**
 * Shared utilities for playground demos
 */

// qrcode-generator library loaded from CDN
// https://github.com/kazuhikoarase/qrcode-generator
declare function qrcode(typeNumber: number, errorCorrectionLevel: string): {
  addData(data: string): void;
  make(): void;
  createImgTag(cellSize?: number, margin?: number): string;
  createSvgTag(cellSize?: number, margin?: number): string;
  createDataURL(cellSize?: number, margin?: number): string;
};

// DC API type declarations
declare global {
  interface CredentialRequestOptions {
    digital?: DigitalCredentialRequestOptions;
  }

  interface DigitalCredentialRequestOptions {
    requests: Array<{
      protocol: string;
      data: { request: string };
    }>;
  }

  // Extend Credential to include digital credential response data
  interface DigitalCredentialResponse extends Credential {
    data: string;
  }
}

export interface VerificationResult {
  sessionId: string;
  /** URI for same-device flow (deep link button) - has redirect after completion */
  uri: string;
  /** URI for cross-device flow (QR code) - no redirect, use polling */
  crossDeviceUri?: string;
}

export interface IssuanceResult {
  sessionId: string;
  uri: string;
}

export interface Session {
  sessionId: string;
  status: 'pending' | 'processing' | 'completed' | 'fetched' | 'failed' | 'expired';
  presentation?: Record<string, unknown>;
  credentials?: Array<Record<string, unknown>>;
}

export interface WaitOptions {
  onUpdate?: (session: Session) => void;
  timeout?: number;
  interval?: number;
}

// DC API types
export interface DcApiRequestData {
  requestObject: string;
  responseUri: string;
  sessionId: string;
}

export interface DcApiResult {
  credentials?: Array<Record<string, unknown>>;
  presentation?: Record<string, unknown>;
}

/**
 * Extract error message from various error formats
 */
function extractErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    if (typeof err.error === 'string') {
      return err.error;
    }
    if (typeof err.message === 'string') {
      return err.message;
    }
    // Try to stringify for debugging
    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * Create a credential issuance offer
 */
export async function createIssuanceOffer(
  credentialId: string,
  claims?: Record<string, unknown>
): Promise<IssuanceResult> {
  const response = await fetch('/api/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credentialId, claims }),
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      throw new Error(`Request failed with status ${response.status}`);
    }
    throw new Error(extractErrorMessage(errorBody, 'Failed to create issuance offer'));
  }

  return response.json();
}

/**
 * Create a presentation request and get the QR code URI
 */
export async function createVerificationRequest(
  useCase: string,
  redirectUri?: string
): Promise<VerificationResult> {
  const response = await fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ useCase, redirectUri }),
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      throw new Error(`Request failed with status ${response.status}`);
    }
    throw new Error(extractErrorMessage(errorBody, 'Failed to create request'));
  }

  return response.json();
}

/**
 * Get session status
 */
export async function getSessionStatus(sessionId: string): Promise<Session> {
  const response = await fetch(`/api/session/${sessionId}`);

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      throw new Error(`Request failed with status ${response.status}`);
    }
    throw new Error(extractErrorMessage(errorBody, 'Failed to get session'));
  }

  return response.json();
}

/**
 * Generate QR code in an element
 */
export async function generateQRCode(element: HTMLElement, uri: string): Promise<void> {
  // Clear previous content
  element.innerHTML = '';
  element.classList.add('has-qr');

  // Create QR code using qrcode-generator
  // Type 0 = auto-detect size, 'M' = medium error correction
  const qr = qrcode(0, 'M');
  qr.addData(uri);
  qr.make();

  // Create image element from QR code
  const img = document.createElement('img');
  img.src = qr.createDataURL(4, 2); // cellSize=4, margin=2
  img.alt = 'QR Code';
  img.style.width = '180px';
  img.style.height = '180px';
  element.appendChild(img);
}

/**
 * Generate both QR code and same-device link button
 * @param qrElement - Element to render the QR code into
 * @param linkElement - Element to render the deep link button into
 * @param qrUri - URI for the QR code (cross-device flow, no redirect)
 * @param deepLinkUri - URI for the deep link button (same-device flow, has redirect). If not provided, uses qrUri.
 */
export async function generateVerificationUI(
  qrElement: HTMLElement,
  linkElement: HTMLElement,
  qrUri: string,
  deepLinkUri?: string
): Promise<void> {
  // Generate QR code with cross-device URI
  await generateQRCode(qrElement, qrUri);

  // Create same-device link button with deep link URI (falls back to qrUri for backward compatibility)
  const buttonUri = deepLinkUri ?? qrUri;
  linkElement.innerHTML = '';
  const link = document.createElement('a');
  link.href = buttonUri;
  link.className = 'btn btn-primary same-device-btn';
  link.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
      <line x1="12" y1="18" x2="12.01" y2="18"></line>
    </svg>
    Open in Wallet
  `;
  linkElement.appendChild(link);
  linkElement.classList.remove('hidden');
}

/**
 * Poll for session completion
 */
export async function waitForSession(
  sessionId: string,
  options: WaitOptions = {}
): Promise<Session> {
  const { onUpdate, timeout = 300000, interval = 1500 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const session = await getSessionStatus(sessionId);

    if (onUpdate) {
      onUpdate(session);
    }

    // 'completed' for verification, 'fetched' for issuance
    if (session.status === 'completed' || session.status === 'fetched') {
      return session;
    }

    if (session.status === 'failed' || session.status === 'expired') {
      throw new Error(`Session ${session.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Session timed out');
}

/**
 * Helper to get an element by ID with type safety
 */
export function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element #${id} not found`);
  }
  return element as T;
}

/**
 * Get session ID from URL query parameter
 */
export function getSessionFromUrl(): string | null {
  const params = new URLSearchParams(globalThis.location.search);
  return params.get('session');
}

/**
 * Build redirect URL with session parameter
 */
export function buildRedirectUrl(sessionId: string): string {
  const url = new URL(globalThis.location.href);
  url.search = ''; // Clear existing params
  url.searchParams.set('session', sessionId);
  return url.toString();
}

/**
 * Clear session from URL (replace state without reload)
 */
export function clearSessionFromUrl(): void {
  const url = new URL(globalThis.location.href);
  url.search = '';
  globalThis.history.replaceState({}, '', url.toString());
}

// =============================================================================
// DC API (Digital Credentials API) Functions
// =============================================================================

/**
 * Check if the browser supports the Digital Credentials API
 */
export function isDcApiAvailable(): boolean {
  try {
    // Check if navigator.credentials exists and supports digital credentials
    // We need to check if the 'digital' option is supported
    if (!('credentials' in navigator)) {
      return false;
    }
    // Check for the digital property support by testing typeof
    // Note: This is a basic check; full support detection requires feature detection
    return typeof (navigator as any).credentials?.get === 'function';
  } catch {
    return false;
  }
}

/**
 * Start a DC API verification request
 * Returns the request data needed to call the browser's DC API
 */
export async function startDcApiVerification(useCase: string): Promise<DcApiRequestData> {
  const response = await fetch('/api/dc-api/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ useCase }),
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      throw new Error(`Request failed with status ${response.status}`);
    }
    throw new Error(extractErrorMessage(errorBody, 'Failed to start DC API verification'));
  }

  return response.json();
}

/**
 * Call the browser's Digital Credentials API
 * Returns the wallet's response (encrypted VP token)
 */
export async function callDcApi(requestObject: string): Promise<string> {
  if (!isDcApiAvailable()) {
    throw new Error('Digital Credentials API is not available in this browser');
  }

  const credential = await navigator.credentials.get({
    digital: {
      requests: [
        {
          protocol: 'openid4vp-v1-signed',
          data: { request: requestObject },
        },
      ],
    },
  } as CredentialRequestOptions);

  if (!credential || !('data' in credential)) {
    throw new Error('No credential returned from wallet');
  }

  return (credential as DigitalCredentialResponse).data;
}

/**
 * Complete the DC API verification by sending the wallet response to the server
 */
export async function completeDcApiVerification(
  responseUri: string,
  walletResponse: string
): Promise<DcApiResult> {
  const response = await fetch('/api/dc-api/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responseUri, walletResponse }),
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      throw new Error(`Request failed with status ${response.status}`);
    }
    throw new Error(extractErrorMessage(errorBody, 'Failed to complete DC API verification'));
  }

  return response.json();
}

/**
 * Full DC API verification flow (convenience function)
 * Handles the entire flow: start -> call browser API -> complete
 */
export async function verifyWithDcApi(
  useCase: string,
  onStatus?: (status: string) => void
): Promise<DcApiResult> {
  onStatus?.('Starting verification...');

  // 1. Get the request from the server
  const requestData = await startDcApiVerification(useCase);
  onStatus?.('Opening wallet...');

  // 2. Call the browser's DC API (will prompt user to select wallet/credential)
  const walletResponse = await callDcApi(requestData.requestObject);
  onStatus?.('Processing verification...');

  // 3. Send the wallet response back to server for verification
  const result = await completeDcApiVerification(requestData.responseUri, walletResponse);

  return result;
}
