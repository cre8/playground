/**
 * Club Nocturne Over-asking Demo
 * The club only needs to know the guest is 18+, but its request also
 * asks for name and address. Shows what a relying party receives when
 * the user does not notice the over-asking.
 */

import {
  createVerificationRequest,
  generateVerificationUI,
  waitForSession,
  getElement,
  getSessionFromUrl,
  buildRedirectUrl,
  clearSessionFromUrl,
  isDcApiAvailable,
  verifyWithDcApi,
} from '../shared/utils';

const USE_CASE = 'club-overasking';

// DOM Elements
const checkoutSection = getElement<HTMLDivElement>('checkoutSection');
const verificationSection = getElement<HTMLDivElement>('verificationSection');
const successSection = getElement<HTMLDivElement>('successSection');
const infoSection = getElement<HTMLDivElement>('infoSection');
const qrPlaceholder = getElement<HTMLDivElement>('qrPlaceholder');
const sameDeviceLink = getElement<HTMLDivElement>('sameDeviceLink');
const statusText = getElement<HTMLSpanElement>('statusText');
const statusBadge = getElement<HTMLDivElement>('statusBadge');
const credentialDisplay = getElement<HTMLDivElement>('credentialDisplay');
const resultPanel = getElement<HTMLDivElement>('resultPanel');
const checkoutBtn = getElement<HTMLButtonElement>('checkoutBtn');

// State
let _currentSessionId: string | null = null;

// Initialize
function init(): void {
  checkoutBtn.addEventListener('click', handleCheckout);

  // Show DC API toggle only if available
  const dcApiOption = document.getElementById('dcApiOption');
  if (dcApiOption && isDcApiAvailable()) {
    dcApiOption.classList.remove('hidden');
  }

  // Check if returning from wallet with session
  const sessionId = getSessionFromUrl();
  if (sessionId) {
    resumeSession(sessionId);
  }
}

// Check if DC API mode is enabled
function isDcApiEnabled(): boolean {
  const dcApiToggle = document.getElementById('dcApiToggle') as HTMLInputElement | null;
  return dcApiToggle?.checked ?? false;
}

// Extract all claims from credentials array into a flat object
function extractCredentialData(credentials?: Array<Record<string, unknown>>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (!credentials) return data;
  for (const credential of credentials) {
    const values = credential.values as Array<Record<string, unknown>> | undefined;
    if (values) {
      for (const valueSet of values) {
        Object.assign(data, valueSet);
      }
    }
  }
  return data;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function asText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

// Show verification section and hide the club content
function showVerificationSection(): void {
  checkoutSection.classList.add('hidden');
  verificationSection.classList.remove('hidden');
  infoSection.classList.add('hidden');
}

function waitWithStatusUpdates(sessionId: string) {
  return waitForSession(sessionId, {
    onUpdate: (s) => {
      if (s.status === 'pending') {
        updateStatus('waiting', 'Waiting for wallet response...');
      } else if (s.status === 'processing') {
        updateStatus('processing', 'Processing verification...');
      }
    },
  });
}

// Resume an existing session (from redirect)
async function resumeSession(sessionId: string): Promise<void> {
  _currentSessionId = sessionId;
  showVerificationSection();

  // Hide QR code and same-device link (we're returning from wallet)
  qrPlaceholder.innerHTML = '<div class="processing-icon">🔄</div>';
  qrPlaceholder.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  updateStatus('processing', 'Completing verification...');

  try {
    const session = await waitWithStatusUpdates(sessionId);
    clearSessionFromUrl();
    showSuccess(session.credentials, sessionId);
  } catch (error) {
    clearSessionFromUrl();
    handleError(error);
  }
}

// Handle join button click
async function handleCheckout(): Promise<void> {
  checkoutBtn.disabled = true;
  checkoutBtn.textContent = 'Starting verification...';

  try {
    if (isDcApiEnabled()) {
      await handleDcApiVerification();
    } else {
      await handleQrCodeVerification();
    }
  } catch (error) {
    handleError(error);
  } finally {
    checkoutBtn.disabled = false;
    checkoutBtn.textContent = 'Join Guest List';
  }
}

// Handle verification via QR code flow
async function handleQrCodeVerification(): Promise<void> {
  // Build redirect URL with {sessionId} placeholder - backend will replace it
  const redirectUrl = buildRedirectUrl('{sessionId}');
  const result = await createVerificationRequest(USE_CASE, redirectUrl);
  _currentSessionId = result.sessionId;

  showVerificationSection();
  displaySessionIdInQrSection(result.sessionId);

  // QR code uses crossDeviceUri (no redirect), button uses uri (with redirect)
  await generateVerificationUI(
    qrPlaceholder,
    sameDeviceLink,
    result.crossDeviceUri ?? result.uri,
    result.uri
  );
  updateStatus('waiting', 'Waiting for you to scan...');

  const session = await waitWithStatusUpdates(result.sessionId);
  showSuccess(session.credentials, result.sessionId);
}

// Handle verification via DC API (browser-native)
async function handleDcApiVerification(): Promise<void> {
  showVerificationSection();

  // DC API uses native browser UI
  qrPlaceholder.innerHTML = '<div class="processing-icon">🔐</div>';
  qrPlaceholder.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  updateStatus('processing', 'Opening wallet...');

  const qrSessionIdEl = document.getElementById('qrSessionId');
  if (qrSessionIdEl) {
    qrSessionIdEl.innerHTML = '';
  }

  const result = await verifyWithDcApi(USE_CASE, (status) => {
    updateStatus('processing', status);
  });

  displaySessionIdInQrSection(result.sessionId);
  showSuccess(result.credentials, result.sessionId, 'DC API (Browser Native)');
}

// Display session ID in QR section
function displaySessionIdInQrSection(sessionId: string): void {
  const qrSessionIdEl = document.getElementById('qrSessionId');
  if (qrSessionIdEl) {
    qrSessionIdEl.innerHTML = `
      <span class="label">Session ID</span>
      <span class="value">${escapeHtml(sessionId)}</span>
    `;
  }
}

// Handle errors - a declined request is the desired outcome of this demo
function handleError(error: unknown): void {
  console.error('Verification error:', error);
  let message = 'Unknown error';
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else if (error && typeof error === 'object' && 'message' in error) {
    message = String((error as { message: unknown }).message);
  }

  showVerificationSection();
  qrPlaceholder.innerHTML = '<div class="error-icon">🛑</div>';
  qrPlaceholder.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  updateStatus(
    'error',
    `No data was shared (${message}). If you declined because of the extra name and address, well spotted!`
  );
}

// Update status display
function updateStatus(status: string, message: string): void {
  statusBadge.className = `status ${status}`;
  statusText.textContent = message;
}

function credentialItem(label: string, value: string, overasked = false): string {
  return `
      <div class="credential-item${overasked ? ' overasked' : ''}">
        <span class="label">${escapeHtml(label)}</span>
        <span class="value">${escapeHtml(value)}</span>
      </div>`;
}

// Show success state, highlighting the over-asked attributes
function showSuccess(
  credentials: Array<Record<string, unknown>> | undefined,
  sessionId: string,
  method?: string
): void {
  updateStatus('success', 'Age verified, but more data was shared than needed');
  resultPanel.classList.remove('hidden');

  const p = extractCredentialData(credentials);
  // SD-JWT: address object + age_equal_or_over; mdoc: flat resident_* + age_over_18
  const address = (p.address ?? {}) as Record<string, unknown>;
  const ageEqualOrOver = (p.age_equal_or_over ?? {}) as Record<string, unknown>;
  const ageClaim = p.age_over_18 ?? ageEqualOrOver['18'];
  const isOver18 = ageClaim === true || ageClaim === 'true';

  const givenName = asText(p.given_name);
  const familyName = asText(p.family_name);
  const street = asText(address.street_address ?? p.resident_street);
  const postalCode = asText(address.postal_code ?? p.resident_postal_code);
  const city = asText(address.locality ?? p.resident_city);

  const name = [givenName, familyName].filter(Boolean).join(' ');
  const cityLine = [postalCode, city].filter(Boolean).join(' ');

  credentialDisplay.innerHTML = `
      <div class="credential-item">
        <span class="label">Age Over 18</span>
        <span class="value ${isOver18 ? 'success' : 'error'}">${isOver18 ? '✓ Yes' : '✗ No'}</span>
      </div>
      ${name ? credentialItem('Name', name, true) : ''}
      ${street ? credentialItem('Street', street, true) : ''}
      ${cityLine ? credentialItem('Postal Code & City', cityLine, true) : ''}
      ${credentialItem('Verified At', new Date().toLocaleTimeString())}
      ${method ? credentialItem('Method', method) : ''}
      <div class="credential-item">
        <span class="label">Session ID</span>
        <span class="value" style="font-family: monospace; font-size: 0.75rem;">${escapeHtml(_currentSessionId ?? sessionId)}</span>
      </div>
    `;

  setTimeout(() => {
    successSection.classList.remove('hidden');
  }, 1500);
}

// Start the app
init();
