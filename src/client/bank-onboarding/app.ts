/**
 * Bank Onboarding KYC Verification Demo
 * Uses EUDIPLO to verify full PID for KYC/AML compliance
 */

import {
  createVerificationRequest,
  generateVerificationUI,
  waitForSession,
  getElement,
  getSessionFromUrl,
  getResponseCodeFromUrl,
  buildRedirectUrl,
  clearSessionFromUrl,
  isDcApiAvailable,
  verifyWithDcApi,
  type Session,
  type DcApiResult,
} from '../shared/utils';

type FlowType = 'same-device' | 'cross-device' | 'dc-api';

const USE_CASE = 'bank-onboarding';

// DOM Elements
const welcomeSection = getElement<HTMLElement>('welcomeSection');
const verificationSection = getElement<HTMLElement>('verificationSection');
const successSection = getElement<HTMLElement>('successSection');
const qrCodeDiv = getElement<HTMLDivElement>('qrCode');
const sameDeviceLink = getElement<HTMLDivElement>('sameDeviceLink');
const statusText = getElement<HTMLParagraphElement>('statusText');
const startBtn = getElement<HTMLButtonElement>('startBtn');
const continueBtn = document.getElementById('continueBtn') as HTMLButtonElement | null;

// Show one section, hide others
function showSection(section: HTMLElement): void {
  [welcomeSection, verificationSection, successSection].forEach((s) => {
    s.style.display = s === section ? 'block' : 'none';
  });
}

// Initialize
function init(): void {
  startBtn.addEventListener('click', handleStart);
  continueBtn?.addEventListener('click', handleContinue);

  // Setup DC API toggle if available
  setupDcApiToggle();
  
  // Check if returning from wallet with session (same-device redirect)
  const sessionId = getSessionFromUrl();
  if (sessionId) {
    // Per OID4VP Section 13.3, response_code confirms the redirect was legitimate
    const responseCode = getResponseCodeFromUrl();
    resumeSession(sessionId, responseCode);
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

// Extract all claims from credentials array into a flat object
function extractCredentialData(credentials?: Array<Record<string, unknown>>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (!credentials) return data;
  
  for (const credential of credentials) {
    const values = credential.values as Array<Record<string, unknown>> | undefined;
    if (values && values.length > 0) {
      // Merge all values from all credentials into one object
      for (const valueSet of values) {
        Object.assign(data, valueSet);
      }
    }
  }
  return data;
}

// Resume an existing session (from same-device redirect)
async function resumeSession(sessionId: string, responseCode: string | null = null): Promise<void> {
  // Show verification section in processing state
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
          statusText.textContent = 'Verifying your identity...';
        }
      },
    });
    
    clearSessionFromUrl();
    showSuccess(session, responseCode ? 'same-device' : 'cross-device', responseCode);
  } catch (error) {
    clearSessionFromUrl();
    handleError(error);
  }
}

// Handle start button click
async function handleStart(): Promise<void> {
  startBtn.disabled = true;
  startBtn.textContent = 'Preparing verification...';

  try {
    if (isDcApiEnabled()) {
      await handleDcApiVerification();
    } else {
      await handleQrCodeVerification();
    }
  } catch (error) {
    handleError(error);
  } finally {
    startBtn.disabled = false;
    startBtn.textContent = 'Open an Account';
  }
}

// Handle verification via QR code flow
async function handleQrCodeVerification(): Promise<void> {
  // Build redirect URL with {sessionId} placeholder - backend will replace it
  const redirectUrl = buildRedirectUrl('{sessionId}');
  
  // Create request with redirect URI containing placeholder
  const result = await createVerificationRequest(USE_CASE, redirectUrl);

  // Show verification section with QR code
  showSection(verificationSection);

  // Display session ID immediately
  displaySessionIdInQrSection(result.sessionId);

  // QR code uses crossDeviceUri (no redirect), button uses uri (with redirect)
  await generateVerificationUI(
    qrCodeDiv,
    sameDeviceLink,
    result.crossDeviceUri ?? result.uri,
    result.uri
  );
  statusText.textContent = 'Use your EUDI Wallet to verify';

  // Wait for verification to complete
  const session = await waitForSession(result.sessionId, {
    onUpdate: (s) => {
      if (s.status === 'pending') {
        statusText.textContent = 'Waiting for wallet response...';
      } else if (s.status === 'processing') {
        statusText.textContent = 'Verifying your identity...';
      }
    },
  });

  // Handle success — cross-device flow (no redirect, no response_code)
  showSuccess(session, 'cross-device');
}

// Handle verification via DC API (browser-native)
async function handleDcApiVerification(): Promise<void> {
  showSection(verificationSection);
  qrCodeDiv.innerHTML = '<div class="processing-icon">🔐</div>';
  qrCodeDiv.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  statusText.textContent = 'Opening wallet...';

  // Clear session ID display for DC API (will be shown after completion)
  const qrSessionIdEl = document.getElementById('qrSessionId');
  if (qrSessionIdEl) {
    qrSessionIdEl.innerHTML = '';
  }

  const result = await verifyWithDcApi(USE_CASE, (status) => {
    statusText.textContent = status;
  });

  // Display session ID when we get the result
  displaySessionIdInQrSection(result.sessionId);

  showSuccessFromDcApi(result);
}

// Display session ID in QR section
function displaySessionIdInQrSection(sessionId: string): void {
  const qrSessionIdEl = document.getElementById('qrSessionId');
  if (qrSessionIdEl) {
    qrSessionIdEl.innerHTML = `
      <span class="label">Session ID</span>
      <span class="value">${sessionId}</span>
    `;
  }
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
  
  // Show verification section with error state
  showSection(verificationSection);
  qrCodeDiv.innerHTML = '<div class="error-icon">⚠️</div>';
  qrCodeDiv.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  statusText.textContent = `Something went wrong: ${message}`;
  statusText.classList.add('error');
}

// Show success state
function showSuccess(session: Session, flowType: FlowType = 'cross-device', responseCode: string | null = null): void {
  showSection(successSection);

  // Display verified data
  const resultsDiv = document.getElementById('verificationResults');
  if (resultsDiv) {
    const data = extractCredentialData(session.credentials);
    if (Object.keys(data).length > 0) {
      displayVerificationResults(resultsDiv, data, flowType, session.sessionId, responseCode);
    }
  }
}

// Show success state from DC API result
function showSuccessFromDcApi(result: DcApiResult): void {
  showSection(successSection);

  const resultsDiv = document.getElementById('verificationResults');
  if (resultsDiv) {
    const data = extractCredentialData(result.credentials);
    if (Object.keys(data).length > 0) {
      displayVerificationResults(resultsDiv, data, 'dc-api', result.sessionId);
    }
  }
}

// Display verification results in the results div
function displayVerificationResults(resultsDiv: HTMLElement, p: Record<string, unknown>, flowType: FlowType = 'cross-device', sessionId?: string, responseCode?: string | null): void {
  // Handle nationality which can be an array (mDOC) or string (SD-JWT VC)
  const nationality = Array.isArray(p.nationality) ? p.nationality.join(', ') : p.nationality;
  
  const fields = [
    {
      label: 'Full Name',
      value: [p.given_name, p.family_name].filter(Boolean).join(' '),
    },
    { label: 'Date of Birth', value: formatDate(p.birth_date || p.birthdate) },
    { label: 'Nationality', value: nationality || p.issuing_country },
    { label: 'Address', value: formatAddress(p) },
    {
      label: 'Document Number',
      value: p.personal_identifier || p.document_number || '***',
    },
  ].filter((f) => f.value && f.value !== '***');

  // Show verification method based on flow type
  switch (flowType) {
    case 'same-device':
      fields.push({ label: 'Method', value: 'Same-Device (Redirect)' });
      if (responseCode) {
        fields.push({ label: 'Response Code', value: `<span style="font-family: monospace; font-size: 0.75rem;">\u2713 ${responseCode.slice(0, 8)}\u2026</span>` });
      }
      break;
    case 'dc-api':
      fields.push({ label: 'Method', value: 'DC API (Browser Native)' });
      break;
    case 'cross-device':
      fields.push({ label: 'Method', value: 'Cross-Device (QR Code)' });
      break;
  }

  if (sessionId) {
    fields.push({ label: 'Session ID', value: `<span style="font-family: monospace; font-size: 0.75rem;">${sessionId}</span>` });
  }

  resultsDiv.innerHTML = fields
    .map(
      (f) => `
    <div class="result-item">
      <span class="result-label">${f.label}</span>
      <span class="result-value">${f.value}</span>
    </div>
  `
    )
    .join('');
}

// Format date helper
function formatDate(date: unknown): string | null {
  if (!date || typeof date !== 'string') return null;
  try {
    return new Date(date).toLocaleDateString('en-EU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return date;
  }
}

// Format address helper
// Supports both SD-JWT VC fields (street_address, locality, postal_code, country)
// and mDOC fields (resident_street, resident_city, resident_postal_code, resident_country)
function formatAddress(p: Record<string, unknown>): string | null {
  const address = p.address as Record<string, unknown> | undefined;
  const parts = [
    // mDOC fields
    p.resident_street,
    p.resident_city,
    p.resident_postal_code,
    p.resident_country,
    // SD-JWT VC fields (fallback)
    !p.resident_street && (p.street_address || address?.street_address),
    !p.resident_city && (p.locality || address?.locality),
    !p.resident_postal_code && (p.postal_code || address?.postal_code),
    !p.resident_country && (p.country || address?.country),
  ].filter(Boolean) as string[];

  return parts.length > 0 ? parts.join(', ') : null;
}

// Handle continue (demo only)
function handleContinue(): void {
  alert(
    '🎉 Demo complete!\n\nIn a real application, you would continue to account setup, choose your account type, set up security, and start banking.'
  );
}

// Start the app
init();
