/**
 * Event Access Attestation Demo
 * Users present their PID, get verified, and receive an attestation for event access
 */

import {
  createVerificationRequest,
  createIssuanceOffer,
  generateVerificationUI,
  waitForSession,
  getElement,
  getSessionFromUrl,
  buildRedirectUrl,
  clearSessionFromUrl,
  isDcApiAvailable,
  verifyWithDcApi,
  type Session,
} from '../shared/utils';

const USE_CASE = 'event-access';

// Event details
interface EventDetails {
  name: string;
  date: string;
  location: string;
  type: string;
  capacity: string;
}

const EVENT: EventDetails = {
  name: 'Tech Conference 2026',
  date: 'June 15-17, 2026',
  location: 'Berlin Convention Center',
  type: 'Technology & Innovation',
  capacity: '5000 attendees',
};

// DOM Elements
const eventSection = getElement<HTMLElement>('eventSection');
const verificationSection = getElement<HTMLElement>('verificationSection');
const successSection = getElement<HTMLElement>('successSection');
const qrCodeDiv = getElement<HTMLDivElement>('qrCode');
const sameDeviceLink = getElement<HTMLDivElement>('sameDeviceLink');
const statusText = getElement<HTMLParagraphElement>('statusText');
const getAttestationBtn = getElement<HTMLButtonElement>('getAttestationBtn');
const doneBtn = document.getElementById('doneBtn') as HTMLButtonElement | null;
const eventNameDisplay = document.getElementById('eventNameDisplay');
const attestationDetails = document.getElementById('attestationDetails');

let verificationSessionId = '';
let issuanceSessionId = '';
let verificationMethod = 'QR Code';

type VerifiedClaims = Record<string, unknown>;

function extractVerifiedClaims(data: { credentials?: Array<Record<string, unknown>>; presentation?: Record<string, unknown> }): VerifiedClaims {
  const credentials = data.credentials;

  if (Array.isArray(credentials) && credentials.length > 0) {
    const firstValues = (credentials[0] as { values?: Array<Record<string, unknown>> })?.values;
    if (Array.isArray(firstValues) && firstValues.length > 0) {
      return firstValues[0] ?? {};
    }
  }

  if (data.presentation && typeof data.presentation === 'object') {
    return data.presentation;
  }

  return {};
}

function displaySessionIdInQrSection(sessionId: string): void {
  const qrSessionId = document.getElementById('qrSessionId');
  if (!qrSessionId) {
    return;
  }

  qrSessionId.innerHTML = `
    <span class="label">Session ID</span>
    <span class="value">${sessionId}</span>
  `;
}

function clearSessionIdInQrSection(): void {
  const qrSessionId = document.getElementById('qrSessionId');
  if (qrSessionId) {
    qrSessionId.innerHTML = '';
  }
}

// Show one section, hide others
function showSection(section: HTMLElement): void {
  [eventSection, verificationSection, successSection].forEach((s) => {
    s.style.display = s === section ? 'block' : 'none';
  });
}

// Initialize
function init(): void {
  getAttestationBtn.addEventListener('click', handleGetAttestation);
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
  verificationSessionId = sessionId;
  verificationMethod = isDcApiEnabled() ? 'DC API' : 'QR Code';

  showSection(verificationSection);
  qrCodeDiv.innerHTML = '<div class="processing-icon">🔄</div>';
  qrCodeDiv.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  displaySessionIdInQrSection(sessionId);
  statusText.textContent = 'Completing PID verification...';

  try {
    const session = await waitForSession(sessionId, {
      onUpdate: (s) => {
        if (s.status === 'pending') {
          statusText.textContent = 'Waiting for wallet response...';
        } else if (s.status === 'processing') {
          statusText.textContent = 'Verifying identity from your PID...';
        }
      },
    });

    clearSessionFromUrl();

    // Extract verified user data from PID
    const verifiedClaims = extractVerifiedClaims(session);

    if (Object.keys(verifiedClaims).length > 0) {
      // Issue attestation credential
      await issueAttestation(session);
    } else {
      handleError('No verified identity data received');
    }
  } catch (error) {
    clearSessionFromUrl();
    handleError(error);
  }
}

// Issue attestation after successful PID verification
async function issueAttestation(pidSession: Session): Promise<void> {
  statusText.textContent = 'Issuing event access attestation...';

  try {
    const verifiedClaims = extractVerifiedClaims(pidSession);
    const attestationClaims = {
      event_name: EVENT.name,
      event_date: EVENT.date,
      event_location: EVENT.location,
      verified_at: new Date().toISOString(),
      access_type: 'full_access',
      valid_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
      ...(verifiedClaims.given_name ? { given_name: verifiedClaims.given_name } : {}),
      ...(verifiedClaims.family_name ? { family_name: verifiedClaims.family_name } : {}),
    };

    const issuanceOffer = await createIssuanceOffer('event-access-attestation', attestationClaims);
    issuanceSessionId = issuanceOffer.sessionId;
    displaySessionIdInQrSection(issuanceOffer.sessionId);

    // Generate QR code for attestation issuance
    const redirectUrl = buildRedirectUrl(issuanceOffer.sessionId);
    await generateVerificationUI(qrCodeDiv, sameDeviceLink, issuanceOffer.uri, redirectUrl);

    statusText.textContent = 'Scan QR code with your wallet to receive event attestation...';

    // Wait for attestation issuance
    await waitForSession(issuanceOffer.sessionId, {
      onUpdate: (s) => {
        if (s.status === 'fetched') {
          statusText.textContent = 'Attestation issued successfully!';
        }
      },
    });

    showSuccess(pidSession);
  } catch (error) {
    handleError(error);
  }
}

// Handle get attestation button click
async function handleGetAttestation(): Promise<void> {
  if (isDcApiEnabled()) {
    await handleGetAttestationWithDcApi();
  } else {
    await handleGetAttestationWithQR();
  }
}

// Get attestation with QR code flow
async function handleGetAttestationWithQR(): Promise<void> {
  verificationMethod = 'QR Code';
  showSection(verificationSection);
  qrCodeDiv.innerHTML = '<div class="processing-icon">⏳</div>';
  sameDeviceLink.classList.add('hidden');
  clearSessionIdInQrSection();
  statusText.textContent = 'Preparing PID verification request...';

  try {
    const verificationRequest = await createVerificationRequest(USE_CASE);
    verificationSessionId = verificationRequest.sessionId;
    displaySessionIdInQrSection(verificationRequest.sessionId);

    const redirectUrl = buildRedirectUrl(verificationRequest.sessionId);
    const qrUri = verificationRequest.crossDeviceUri ?? verificationRequest.uri;
    await generateVerificationUI(qrCodeDiv, sameDeviceLink, qrUri, redirectUrl);

    statusText.textContent = 'Scan QR code with your EUDI Wallet to verify your identity...';

    // Wait for the verification session to change state
    const session = await waitForSession(verificationRequest.sessionId, {
      onUpdate: (s) => {
        if (s.status === 'pending') {
          statusText.textContent = 'Waiting for wallet response...';
        } else if (s.status === 'processing') {
          statusText.textContent = 'Verifying identity from your PID...';
        }
      },
    });

    // Extract verified user data from PID
    const verifiedClaims = extractVerifiedClaims(session);
    if (Object.keys(verifiedClaims).length > 0) {
      await issueAttestation(session);
    } else {
      handleError('No verified identity data received');
    }
  } catch (error) {
    handleError(error);
  }
}

// Get attestation with DC API flow
async function handleGetAttestationWithDcApi(): Promise<void> {
  verificationMethod = 'DC API';
  showSection(verificationSection);
  qrCodeDiv.innerHTML = '<div class="processing-icon">🔄</div>';
  qrCodeDiv.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  clearSessionIdInQrSection();
  statusText.textContent = 'Requesting PID from wallet...';

  try {
    const dcApiResult = await verifyWithDcApi(USE_CASE);
    verificationSessionId = dcApiResult.sessionId;
    displaySessionIdInQrSection(dcApiResult.sessionId);

    const verifiedClaims = extractVerifiedClaims(dcApiResult);

    if (Object.keys(verifiedClaims).length > 0) {
      // Issue attestation credential
      await issueAttestation(dcApiResult as Session);
    } else {
      handleError('PID verification failed');
    }
  } catch (error) {
    handleError(error);
  }
}

// Show success section
function showSuccess(pidSession: Session): void {
  if (eventNameDisplay) {
    eventNameDisplay.textContent = EVENT.name;
  }

  if (attestationDetails) {
    const userInfo = extractVerifiedClaims(pidSession);
    const givenName = typeof userInfo.given_name === 'string' ? userInfo.given_name : '';
    const familyName = typeof userInfo.family_name === 'string' ? userInfo.family_name : '';
    attestationDetails.innerHTML = `
      <div class="detail-row">
        <span class="detail-label">Full Name:</span>
        <span class="detail-value">${givenName} ${familyName}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Event:</span>
        <span class="detail-value">${EVENT.name}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Date:</span>
        <span class="detail-value">${EVENT.date}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Location:</span>
        <span class="detail-value">${EVENT.location}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Access Level:</span>
        <span class="detail-value">Full Access</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Valid Until:</span>
        <span class="detail-value">${new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toLocaleDateString()}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Verification Method:</span>
        <span class="detail-value">${verificationMethod}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Verification Session ID:</span>
        <span class="detail-value">${verificationSessionId}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Issuance Session ID:</span>
        <span class="detail-value">${issuanceSessionId}</span>
      </div>
    `;
  }

  showSection(successSection);
}

// Handle error
function handleError(error: unknown): void {
  let message = 'An unexpected error occurred';
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }

  showSection(eventSection);
  alert(`Error: ${message}`);
}

// Handle done button
function handleDone(): void {
  showSection(eventSection);
  statusText.textContent = '';
  qrCodeDiv.innerHTML = '';
  clearSessionIdInQrSection();
}

// Start the application
init();
