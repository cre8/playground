/**
 * TechMarkt SIM Activation Demo
 * Uses EUDIPLO to verify identity for prepaid SIM card activation
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
  type Session,
  type DcApiResult,
} from '../shared/utils';

const USE_CASE = 'sim-activation';

// DOM Elements
const productSection = getElement<HTMLElement>('productSection');
const verificationSection = getElement<HTMLElement>('verificationSection');
const successSection = getElement<HTMLElement>('successSection');
const qrCodeDiv = getElement<HTMLDivElement>('qrCode');
const sameDeviceLink = getElement<HTMLDivElement>('sameDeviceLink');
const statusText = getElement<HTMLParagraphElement>('statusText');
const activateBtn = getElement<HTMLButtonElement>('activateBtn');
const doneBtn = document.getElementById('doneBtn') as HTMLButtonElement | null;

// Show one section, hide others
function showSection(section: HTMLElement): void {
  [productSection, verificationSection, successSection].forEach((s) => {
    s.style.display = s === section ? 'block' : 'none';
  });
}

// Initialize
function init(): void {
  activateBtn.addEventListener('click', handleActivate);
  doneBtn?.addEventListener('click', handleDone);

  // Setup DC API toggle if available
  setupDcApiToggle();
  
  // Check if returning from wallet with session
  const sessionId = getSessionFromUrl();
  if (sessionId) {
    resumeSession(sessionId);
  }
}

// Setup DC API toggle checkbox
function setupDcApiToggle(): void {
  const dcApiToggle = document.getElementById('dcApiToggle') as HTMLInputElement | null;
  const dcApiOption = document.getElementById('dcApiOption');

  if (dcApiToggle && dcApiOption) {
    if (isDcApiAvailable()) {
      dcApiOption.classList.remove('hidden');
    }
  }
}

// Check if DC API mode is enabled
function isDcApiEnabled(): boolean {
  const dcApiToggle = document.getElementById('dcApiToggle') as HTMLInputElement | null;
  return dcApiToggle?.checked ?? false;
}

// Resume an existing session (from redirect)
async function resumeSession(sessionId: string): Promise<void> {
  showSection(verificationSection);
  qrCodeDiv.innerHTML = '<div class="processing-icon">🔄</div>';
  qrCodeDiv.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  statusText.textContent = 'Completing verification...';
  
  try {
    const session = await waitForSession(sessionId, {
      onUpdate: (s) => {
        if (s.status === 'pending') {
          statusText.textContent = 'Waiting for wallet response...';
        } else if (s.status === 'processing') {
          statusText.textContent = 'Verifying identity...';
        }
      },
    });
    
    clearSessionFromUrl();
    showSuccess(session);
  } catch (error) {
    clearSessionFromUrl();
    handleError(error);
  }
}

// Handle activate button click
async function handleActivate(): Promise<void> {
  activateBtn.disabled = true;
  activateBtn.textContent = 'Wird gestartet...';

  try {
    if (isDcApiEnabled()) {
      await handleDcApiVerification();
    } else {
      await handleQrCodeVerification();
    }
  } catch (error) {
    handleError(error);
  } finally {
    activateBtn.disabled = false;
    activateBtn.textContent = '🪪 Verify Identity Now';
  }
}

// Handle verification via QR code flow
async function handleQrCodeVerification(): Promise<void> {
  // Build redirect URL with {sessionId} placeholder
  const redirectUrl = buildRedirectUrl('{sessionId}');
  
  // Create verification request
  const result = await createVerificationRequest(USE_CASE, redirectUrl);

  // Show verification section with QR code
  showSection(verificationSection);
  // QR code uses crossDeviceUri (no redirect), button uses uri (with redirect)
  await generateVerificationUI(
    qrCodeDiv,
    sameDeviceLink,
    result.crossDeviceUri ?? result.uri,
    result.uri
  );
  statusText.textContent = 'Scan the QR code with your EUDI Wallet';

  // Wait for verification to complete
  const session = await waitForSession(result.sessionId, {
    onUpdate: (s) => {
      if (s.status === 'pending') {
        statusText.textContent = 'Waiting for wallet response...';
      } else if (s.status === 'processing') {
        statusText.textContent = 'Verifying identity...';
      }
    },
  });

  // Handle success
  showSuccess(session);
}

// Handle verification via DC API (browser-native)
async function handleDcApiVerification(): Promise<void> {
  showSection(verificationSection);
  qrCodeDiv.innerHTML = '<div class="processing-icon">🔐</div>';
  qrCodeDiv.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  statusText.textContent = 'Opening wallet...';

  const result = await verifyWithDcApi(USE_CASE, (status) => {
    statusText.textContent = status;
  });

  showSuccessFromDcApi(result);
}

// Handle errors
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
  
  showSection(verificationSection);
  qrCodeDiv.innerHTML = '<div class="error-icon">⚠️</div>';
  qrCodeDiv.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  statusText.textContent = `Error: ${message}`;
  statusText.classList.add('error');
}

// Generate activation ID
function generateActivationId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'TM-2026-';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Show success state
function showSuccess(session: Session): void {
  showSection(successSection);
  displaySuccessContent(session.presentation, false);
}

// Show success state from DC API result
function showSuccessFromDcApi(result: DcApiResult): void {
  showSection(successSection);
  displaySuccessContent(result.presentation, true);
}

// Display success content
function displaySuccessContent(presentation: Record<string, unknown> | undefined, isDcApi: boolean): void {
  // Set activation ID
  const activationIdEl = document.getElementById('activationId');
  if (activationIdEl) {
    activationIdEl.textContent = generateActivationId();
  }

  // Display verified data
  const verifiedDataEl = document.getElementById('verifiedData');
  if (verifiedDataEl && presentation) {
    verifiedDataEl.innerHTML = '';
    
    // Map of claim keys to English labels
    const labelMap: Record<string, string> = {
      'family_name': 'Last Name',
      'given_name': 'First Name',
      'birth_date': 'Date of Birth',
      'birthdate': 'Date of Birth',
      'resident_street': 'Street',
      'resident_city': 'City',
      'resident_postal_code': 'Postal Code',
      'resident_country': 'Country',
      'nationality': 'Nationality',
      'age_over_18': 'Over 18 Years',
    };

    // Try to extract claims from presentation
    const claims = extractClaims(presentation);
    
    for (const [key, value] of Object.entries(claims)) {
      const label = labelMap[key];
      if (label && value !== undefined && value !== null) {
        const item = document.createElement('div');
        item.className = 'verified-item';
        item.innerHTML = `
          <span class="label">${label}</span>
          <span class="value">${formatValue(key, value)}</span>
        `;
        verifiedDataEl.appendChild(item);
      }
    }

    // Add DC API indicator if applicable
    if (isDcApi) {
      const item = document.createElement('div');
      item.className = 'verified-item';
      item.innerHTML = `
        <span class="label">Method</span>
        <span class="value">DC API (Browser Native)</span>
      `;
      verifiedDataEl.appendChild(item);
    }

    // If no claims found, show placeholder
    if (verifiedDataEl.children.length === 0) {
      verifiedDataEl.innerHTML = `
        <div class="verified-item">
          <span class="label">Status</span>
          <span class="value">Successfully verified ✓</span>
        </div>
      `;
    }
  }
}

// Extract claims from various presentation formats
function extractClaims(presentation: Record<string, unknown>): Record<string, unknown> {
  // Direct claims
  if (presentation.given_name || presentation.family_name) {
    return presentation;
  }
  
  // Nested in credentials array
  if (Array.isArray(presentation.credentials) && presentation.credentials.length > 0) {
    return presentation.credentials[0] as Record<string, unknown>;
  }
  
  // Nested in credential object
  if (presentation.credential && typeof presentation.credential === 'object') {
    return presentation.credential as Record<string, unknown>;
  }
  
  return presentation;
}

// Format values for display
function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  
  if (key === 'birth_date' || key === 'birthdate') {
    try {
      const date = new Date(String(value));
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US');
      }
    } catch {
      // Fall through to default
    }
  }
  
  if (key === 'age_over_18') {
    return value ? 'Yes' : 'No';
  }
  
  return String(value);
}

// Handle done button
function handleDone(): void {
  window.location.href = '../';
}

// Start the app
init();
