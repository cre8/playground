/**
 * Master's Application Demo
 * Uses EUDIPLO to verify university diploma and personal identity for Master's program applications
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

const USE_CASE = 'masters-application';

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
const verifyBtn = getElement<HTMLButtonElement>('verifyBtn');

// State
let _currentSessionId: string | null = null;

// Initialize
function init(): void {
  verifyBtn.addEventListener('click', handleVerify);

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
async function handleVerify(): Promise<void> {
  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Starting verification...';

  try {
    if (isDcApiEnabled()) {
      await handleDcApiVerification();
    } else {
      await handleQrCodeVerification();
    }
  } catch (error) {
    handleError(error);
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Verify Diploma & Identity';
  }
}

// Handle verification via QR code flow
async function handleQrCodeVerification(): Promise<void> {
  const redirectUrl = buildRedirectUrl('{sessionId}');
  const result = await createVerificationRequest(USE_CASE, redirectUrl);
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
async function handleDcApiVerification(): Promise<void> {
  verifySection.classList.add('hidden');
  verificationSection.classList.remove('hidden');
  infoSection.classList.add('hidden');

  qrPlaceholder.innerHTML = '<div class="processing-icon">🔐</div>';
  qrPlaceholder.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  updateStatus('processing', 'Opening wallet...');

  // Clear session ID display for DC API (will be shown after completion)
  const qrSessionIdEl = document.getElementById('qrSessionId');
  if (qrSessionIdEl) {
    qrSessionIdEl.innerHTML = '';
  }

  const result = await verifyWithDcApi(USE_CASE, (status) => {
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

// Show success state
function showSuccess(session: Session): void {
  updateStatus('success', 'Verification complete!');

  resultPanel.classList.remove('hidden');

  // Extract data from credentials array
  const data = extractCredentialData(session.credentials);
  if (Object.keys(data).length > 0) {
    displayVerificationData(data, false, session.sessionId);
    populateSuccessSummary(data, session.sessionId);
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

  // Extract data from credentials array
  const data = extractCredentialData(result.credentials);
  if (Object.keys(data).length > 0) {
    displayVerificationData(data, true, result.sessionId);
    populateSuccessSummary(data, result.sessionId);
  }

  setTimeout(() => {
    verificationSection.classList.add('hidden');
    successSection.classList.remove('hidden');
  }, 1500);
}

// Populate the success summary with verified data
function populateSuccessSummary(data: Record<string, unknown>, sessionId?: string): void {
  // Set applicant name
  const applicantNameEl = document.getElementById('applicantName');
  if (applicantNameEl) {
    const givenName = data.given_name ?? '';
    const familyName = data.family_name ?? '';
    applicantNameEl.textContent = `${givenName} ${familyName}`.trim() || 'Applicant';
  }

  // Set degree
  const summaryDegreeEl = document.getElementById('summaryDegree');
  if (summaryDegreeEl) {
    summaryDegreeEl.textContent = (data.degree_type as string) ?? 'Bachelor\'s Degree';
  }

  // Set field of study
  const summaryFieldEl = document.getElementById('summaryField');
  if (summaryFieldEl) {
    summaryFieldEl.textContent = (data.degree_name as string) ?? 'N/A';
  }

  // Set university
  const summaryUniversityEl = document.getElementById('summaryUniversity');
  if (summaryUniversityEl) {
    summaryUniversityEl.textContent = (data.issuing_authority as string) ?? 'N/A';
  }

  // Set graduation date
  const summaryGraduationEl = document.getElementById('summaryGraduation');
  if (summaryGraduationEl) {
    const gradDate = data.graduation_date;
    if (gradDate && typeof gradDate === 'string') {
      try {
        summaryGraduationEl.textContent = new Date(gradDate).toLocaleDateString('en-EU', {
          year: 'numeric',
          month: 'long',
        });
      } catch {
        summaryGraduationEl.textContent = gradDate;
      }
    } else {
      summaryGraduationEl.textContent = 'N/A';
    }
  }

  // Set honors
  const summaryHonorsEl = document.getElementById('summaryHonors');
  if (summaryHonorsEl) {
    summaryHonorsEl.textContent = (data.honors as string) ?? 'N/A';
  }

  // Set student ID
  const summaryStudentIdEl = document.getElementById('summaryStudentId');
  if (summaryStudentIdEl) {
    summaryStudentIdEl.textContent = (data.student_id as string) ?? 'N/A';
  }

  // Set session ID for debugging
  const sessionIdDisplayEl = document.getElementById('sessionIdDisplay');
  if (sessionIdDisplayEl && sessionId) {
    sessionIdDisplayEl.innerHTML = `
      <span class="label">Session ID</span>
      <span class="value">${sessionId}</span>
    `;
  }
}

// Display verification data (Diploma) in the credential display
function displayVerificationData(data: Record<string, unknown>, isDcApi = false, sessionId?: string): void {
  // Diploma fields
  const degreeType = data.degree_type ?? 'N/A';
  const degreeName = data.degree_name ?? 'N/A';
  const honors = data.honors ?? 'N/A';
  const university = data.issuing_authority ?? 'N/A';
  const issuingCountry = data.issuing_country ?? 'N/A';
  const graduationDate = data.graduation_date ?? 'N/A';
  const studentId = data.student_id ?? 'N/A';
  const givenName = data.given_name ?? 'N/A';
  const familyName = data.family_name ?? 'N/A';

  let html = `
    <div class="credential-section">
      <h4>🎓 Diploma Details</h4>
      <div class="credential-item">
        <span class="label">Degree Type</span>
        <span class="value">${degreeType}</span>
      </div>
      <div class="credential-item">
        <span class="label">Field of Study</span>
        <span class="value">${degreeName}</span>
      </div>
      <div class="credential-item">
        <span class="label">Honors</span>
        <span class="value">${honors}</span>
      </div>
    </div>
    <div class="credential-section">
      <h4>🏛️ Institution</h4>
      <div class="credential-item">
        <span class="label">University</span>
        <span class="value">${university}</span>
      </div>
      <div class="credential-item">
        <span class="label">Country</span>
        <span class="value">${issuingCountry}</span>
      </div>
    </div>
    <div class="credential-section">
      <h4>📅 Graduation</h4>
      <div class="credential-item">
        <span class="label">Graduation Date</span>
        <span class="value">${graduationDate}</span>
      </div>
      <div class="credential-item">
        <span class="label">Student ID</span>
        <span class="value">${studentId}</span>
      </div>
    </div>
    <div class="credential-section">
      <h4>🪪 Identity</h4>
      <div class="credential-item">
        <span class="label">Given Name</span>
        <span class="value">${givenName}</span>
      </div>
      <div class="credential-item">
        <span class="label">Family Name</span>
        <span class="value">${familyName}</span>
      </div>
    </div>
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
