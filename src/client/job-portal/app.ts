/**
 * Job Portal Diploma Verification Demo
 * Uses EUDIPLO to verify university diploma for job applications
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

const USE_CASE_DIPLOMA = 'job-portal';
const USE_CASE_FULL = 'job-portal-full';

// DOM Elements
const verifySection = getElement<HTMLDivElement>('verifySection');
const verificationSection = getElement<HTMLDivElement>('verificationSection');
const successSection = getElement<HTMLDivElement>('successSection');
const infoSection = getElement<HTMLDivElement>('infoSection');
const qrPlaceholder = getElement<HTMLDivElement>('qrPlaceholder');
const sameDeviceLink = getElement<HTMLDivElement>('sameDeviceLink');
const statusText = getElement<HTMLSpanElement>('statusText');
const statusBadge = getElement<HTMLDivElement>('statusBadge');
const credentialDisplay = getElement<HTMLDivElement>('credentialDisplay');
const resultPanel = getElement<HTMLDivElement>('resultPanel');
const verifyDiplomaBtn = getElement<HTMLButtonElement>('verifyDiplomaBtn');
const verifyFullBtn = getElement<HTMLButtonElement>('verifyFullBtn');

// State
let _currentSessionId: string | null = null;
let _currentUseCase: string = USE_CASE_DIPLOMA;

// Initialize
function init(): void {
  verifyDiplomaBtn.addEventListener('click', () => handleVerify(USE_CASE_DIPLOMA));
  verifyFullBtn.addEventListener('click', () => handleVerify(USE_CASE_FULL));

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
  _currentSessionId = sessionId;

  // Show verification section in processing state
  verifySection.classList.add('hidden');
  verificationSection.classList.remove('hidden');
  infoSection.classList.add('hidden');

  // Hide QR code and same-device link (we're returning from wallet)
  qrPlaceholder.innerHTML = '<div class="processing-icon">🔄</div>';
  qrPlaceholder.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  updateStatus('processing', 'Completing verification...');

  try {
    const session = await waitForSession(sessionId, {
      onUpdate: (s) => {
        if (s.status === 'pending') {
          updateStatus('waiting', 'Waiting for wallet response...');
        } else if (s.status === 'processing') {
          updateStatus('processing', 'Processing verification...');
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

// Handle verify button click
async function handleVerify(useCase: string): Promise<void> {
  _currentUseCase = useCase;
  const activeBtn = useCase === USE_CASE_DIPLOMA ? verifyDiplomaBtn : verifyFullBtn;
  const otherBtn = useCase === USE_CASE_DIPLOMA ? verifyFullBtn : verifyDiplomaBtn;
  
  activeBtn.disabled = true;
  otherBtn.disabled = true;
  activeBtn.textContent = 'Starting verification...';

  try {
    if (isDcApiEnabled()) {
      await handleDcApiVerification(useCase);
    } else {
      await handleQrCodeVerification(useCase);
    }
  } catch (error) {
    handleError(error);
  } finally {
    activeBtn.disabled = false;
    otherBtn.disabled = false;
    verifyDiplomaBtn.textContent = 'Verify Diploma Only';
    verifyFullBtn.textContent = 'Verify Diploma + Identity';
  }
}

// Handle verification via QR code flow
async function handleQrCodeVerification(useCase: string): Promise<void> {
  const redirectUrl = buildRedirectUrl('{sessionId}');
  const result = await createVerificationRequest(useCase, redirectUrl);
  _currentSessionId = result.sessionId;

  // Show verification section
  verifySection.classList.add('hidden');
  verificationSection.classList.remove('hidden');
  infoSection.classList.add('hidden');

  // Display session ID immediately
  displaySessionIdInQrSection(result.sessionId);

  // Generate QR code and same-device link
  await generateVerificationUI(
    qrPlaceholder,
    sameDeviceLink,
    result.crossDeviceUri ?? result.uri,
    result.uri
  );
  updateStatus('waiting', 'Waiting for you to scan...');

  // Wait for verification to complete
  const session = await waitForSession(result.sessionId, {
    onUpdate: (s) => {
      if (s.status === 'pending') {
        updateStatus('waiting', 'Waiting for wallet response...');
      } else if (s.status === 'processing') {
        updateStatus('processing', 'Processing verification...');
      }
    },
  });

  showSuccess(session);
}

// Handle verification via DC API (browser-native)
async function handleDcApiVerification(useCase: string): Promise<void> {
  verifySection.classList.add('hidden');
  verificationSection.classList.remove('hidden');
  infoSection.classList.add('hidden');

  qrPlaceholder.innerHTML = '<div class="processing-icon">🔐</div>';
  qrPlaceholder.classList.remove('has-qr');
  // Clear session ID display for DC API (will be shown after completion)
  const qrSessionIdEl = document.getElementById('qrSessionId');
  if (qrSessionIdEl) {
    qrSessionIdEl.innerHTML = '';
  }

  const result = await verifyWithDcApi(useCase, (status) => {
    updateStatus('processing', status);
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

  verifySection.classList.add('hidden');
  verificationSection.classList.remove('hidden');
  infoSection.classList.add('hidden');

  qrPlaceholder.innerHTML = '<div class="error-icon">⚠️</div>';
  qrPlaceholder.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  updateStatus('error', `Something went wrong: ${message}`);
}

// Update status display
function updateStatus(status: string, message: string): void {
  statusBadge.className = `status ${status}`;
  statusText.textContent = message;
}

// Show success state
function showSuccess(session: Session): void {
  updateStatus('success', 'Verification complete!');

  resultPanel.classList.remove('hidden');

  if (session.presentation) {
    const p = session.presentation as Record<string, unknown>;
    displayVerificationData(p, false, session.sessionId);
  }

  setTimeout(() => {
    verificationSection.classList.add('hidden');
    successSection.classList.remove('hidden');
  }, 1500);
}

// Show success state from DC API result
function showSuccessFromDcApi(result: DcApiResult): void {
  updateStatus('success', 'Verification complete!');

  resultPanel.classList.remove('hidden');

  if (result.presentation) {
    const p = result.presentation as Record<string, unknown>;
    displayVerificationData(p, true, result.sessionId);
  }

  setTimeout(() => {
    verificationSection.classList.add('hidden');
    successSection.classList.remove('hidden');
  }, 1500);
}

// Display verification data (Diploma and optionally PID) in the credential display
function displayVerificationData(data: Record<string, unknown>, isDcApi = false, sessionId?: string): void {
  // Diploma fields
  const degreeType = data.degree_type ?? 'N/A';
  const degreeName = data.degree_name ?? 'N/A';
  const university = data.issuing_authority ?? 'N/A';
  const graduationDate = data.graduation_date ?? 'N/A';

  // PID fields (may be present for full verification)
  const givenName = data.given_name;
  const familyName = data.family_name;
  const birthDate = data.birth_date;

  let html = `
    <div class="credential-section">
      <h4>🎓 Diploma</h4>
      <div class="credential-item">
        <span class="label">Degree</span>
        <span class="value">${degreeType}</span>
      </div>
      <div class="credential-item">
        <span class="label">Field of Study</span>
        <span class="value">${degreeName}</span>
      </div>
      <div class="credential-item">
        <span class="label">University</span>
        <span class="value">${university}</span>
      </div>
      <div class="credential-item">
        <span class="label">Graduation Date</span>
        <span class="value">${graduationDate}</span>
      </div>
    </div>
  `;

  // Add PID section if present
  if (givenName || familyName || birthDate) {
    html += `
    <div class="credential-section">
      <h4>🪪 Personal Identity</h4>
      ${givenName ? `<div class="credential-item">
        <span class="label">Given Name</span>
        <span class="value">${givenName}</span>
      </div>` : ''}
      ${familyName ? `<div class="credential-item">
        <span class="label">Family Name</span>
        <span class="value">${familyName}</span>
      </div>` : ''}
      ${birthDate ? `<div class="credential-item">
        <span class="label">Birth Date</span>
        <span class="value">${birthDate}</span>
      </div>` : ''}
    </div>
    `;
  }

  html += `
    <div class="credential-item">
      <span class="label">Verified At</span>
      <span class="value">${new Date().toLocaleTimeString()}</span>
    </div>
  `;

  if (isDcApi) {
    html += `
      <div class="credential-item">
        <span class="label">Method</span>
        <span class="value">DC API (Browser Native)</span>
      </div>
    `;
  }

  if (sessionId) {
    html += `
      <div class="credential-item">
        <span class="label">Session ID</span>
        <span class="value" style="font-family: monospace; font-size: 0.75rem;">${sessionId}</span>
      </div>
    `;
  }

  credentialDisplay.innerHTML = html;
}

// Start the app
init();
