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
  buildRedirectUrl,
  clearSessionFromUrl,
  isDcApiAvailable,
  verifyWithDcApi,
  type Session,
  type DcApiResult,
} from '../shared/utils';

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
    showSuccess(session);
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
  
  // Show verification section with error state
  showSection(verificationSection);
  qrCodeDiv.innerHTML = '<div class="error-icon">⚠️</div>';
  qrCodeDiv.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  statusText.textContent = `Something went wrong: ${message}`;
  statusText.classList.add('error');
}

// Show success state
function showSuccess(session: Session): void {
  showSection(successSection);

  // Display verified data
  const resultsDiv = document.getElementById('verificationResults');
  if (resultsDiv && session.presentation) {
    const p = session.presentation as Record<string, unknown>;
    displayVerificationResults(resultsDiv, p);
  }
}

// Show success state from DC API result
function showSuccessFromDcApi(result: DcApiResult): void {
  showSection(successSection);

  const resultsDiv = document.getElementById('verificationResults');
  if (resultsDiv && result.presentation) {
    const p = result.presentation as Record<string, unknown>;
    displayVerificationResults(resultsDiv, p, true);
  }
}

// Display verification results in the results div
function displayVerificationResults(resultsDiv: HTMLElement, p: Record<string, unknown>, isDcApi = false): void {
  const fields = [
    {
      label: 'Full Name',
      value: [p.given_name, p.family_name].filter(Boolean).join(' '),
    },
    { label: 'Date of Birth', value: formatDate(p.birth_date || p.birthdate) },
    { label: 'Nationality', value: p.nationality || p.issuing_country },
    { label: 'Address', value: formatAddress(p) },
    {
      label: 'Document Number',
      value: p.personal_identifier || p.document_number || '***',
    },
  ].filter((f) => f.value && f.value !== '***');

  if (isDcApi) {
    fields.push({ label: 'Method', value: 'DC API (Browser Native)' });
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
function formatAddress(p: Record<string, unknown>): string | null {
  const address = p.address as Record<string, unknown> | undefined;
  const parts = [
    p.street_address || address?.street_address,
    p.locality || address?.locality,
    p.postal_code || address?.postal_code,
    p.country || address?.country,
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
