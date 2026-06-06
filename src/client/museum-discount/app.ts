/**
 * Berlin History Museum Resident Discount Demo
 * Uses EUDIPLO to verify Berlin residency for ticket discount
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

const USE_CASE = 'museum-discount';

type DiscountQualification = 'berlin-residency' | 'presentation-policy';

interface DiscountEligibility {
  qualification: DiscountQualification;
  city?: string;
}

// DOM Elements
const ticketSection = getElement<HTMLElement>('ticketSection');
const verificationSection = getElement<HTMLElement>('verificationSection');
const successSection = getElement<HTMLElement>('successSection');
const notBerlinSection = getElement<HTMLElement>('notBerlinSection');
const qrCodeDiv = getElement<HTMLDivElement>('qrCode');
const sameDeviceLink = getElement<HTMLDivElement>('sameDeviceLink');
const statusText = getElement<HTMLParagraphElement>('statusText');
const verifyBtn = getElement<HTMLButtonElement>('verifyBtn');
const doneBtn = document.getElementById('doneBtn') as HTMLButtonElement | null;
const skipLink = document.getElementById('skipLink') as HTMLAnchorElement | null;
const tryAgainBtn = document.getElementById('tryAgainBtn') as HTMLButtonElement | null;
const purchaseBtn = document.getElementById('purchaseBtn') as HTMLButtonElement | null;
const buyRegularBtn = document.getElementById('buyRegularBtn') as HTMLButtonElement | null;

// Show one section, hide others
function showSection(section: HTMLElement): void {
  [ticketSection, verificationSection, successSection, notBerlinSection].forEach((s) => {
    s.style.display = s === section ? 'block' : 'none';
  });
}

// Initialize
function init(): void {
  verifyBtn.addEventListener('click', handleVerify);
  doneBtn?.addEventListener('click', handleDone);
  skipLink?.addEventListener('click', handleSkip);
  tryAgainBtn?.addEventListener('click', handleTryAgain);
  purchaseBtn?.addEventListener('click', handlePurchase);
  buyRegularBtn?.addEventListener('click', handleBuyRegular);

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
  statusText.textContent = 'Checking eligibility...';
  
  try {
    const session = await waitForSession(sessionId, {
      onUpdate: (s) => {
        if (s.status === 'pending') {
          statusText.textContent = 'Waiting for wallet response...';
        } else if (s.status === 'processing') {
          statusText.textContent = 'Verifying eligibility...';
        }
      },
    });
    
    clearSessionFromUrl();
    handleVerificationResult(session);
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
    verifyBtn.textContent = '🪪 Verify Eligibility & Get Discount';
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

  // Display session ID immediately
  displaySessionIdInQrSection(result.sessionId);

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
        statusText.textContent = 'Verifying eligibility...';
      }
    },
  });

  // Handle result
  handleVerificationResult(session);
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

  // Handle result - convert DC API result to session format for compatibility
  handleVerificationResultFromDcApi(result);
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

function getCityFromClaims(claims: Record<string, unknown>): string | undefined {
  const address = claims.address as Record<string, unknown> | undefined;
  const city =
    address?.locality ||
    claims.resident_city ||
    claims.locality ||
    claims.city ||
    claims.place_of_residence;

  return typeof city === 'string' ? city.trim() : undefined;
}

function isBerlinResidentFromClaims(claims: Record<string, unknown>): boolean {
  const city = getCityFromClaims(claims);
  if (!city) {
    return false;
  }

  const cityLower = city.toLowerCase();
  return cityLower === 'berlin' || cityLower.includes('berlin');
}

function evaluateDiscountEligibilityFromClaims(claims: Record<string, unknown>): DiscountEligibility {
  if (isBerlinResidentFromClaims(claims)) {
    return {
      qualification: 'berlin-residency',
      city: getCityFromClaims(claims),
    };
  }

  return {
    qualification: 'presentation-policy',
    city: getCityFromClaims(claims),
  };
}

// Handle verification result
function handleVerificationResult(session: Session): void {
  const claims = extractClaims(session);
  const eligibility = evaluateDiscountEligibilityFromClaims(claims);
  showSuccess(session, claims, eligibility);
}

// Handle verification result from DC API
function handleVerificationResultFromDcApi(result: DcApiResult): void {
  const claims = result.presentation ? extractClaimsFromPresentation(result.presentation) : {};
  const eligibility = evaluateDiscountEligibilityFromClaims(claims);
  showSuccessFromDcApi(result, claims, eligibility);
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

// Generate ticket ID
function generateTicketId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'BHM-2026-';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Show success state (Berlin resident)
function showSuccess(
  session: Session,
  claims: Record<string, unknown>,
  eligibility: DiscountEligibility
): void {
  showSection(successSection);
  displaySuccessContent(claims, eligibility, false, session.sessionId);
}

// Show success state from DC API
function showSuccessFromDcApi(
  result: DcApiResult,
  claims: Record<string, unknown>,
  eligibility: DiscountEligibility
): void {
  showSection(successSection);
  displaySuccessContent(claims, eligibility, true, result.sessionId);
}

// Display success content
function displaySuccessContent(
  claims: Record<string, unknown>,
  eligibility: DiscountEligibility,
  isDcApi: boolean,
  sessionId?: string
): void {
  // Set ticket ID
  const ticketIdEl = document.getElementById('ticketId');
  if (ticketIdEl) {
    ticketIdEl.textContent = generateTicketId();
  }

  // Display verified data
  const verifiedDataEl = document.getElementById('verifiedData');
  if (verifiedDataEl) {
    verifiedDataEl.innerHTML = '';
    
    if (eligibility.qualification === 'berlin-residency') {
      const cityItem = document.createElement('div');
      cityItem.className = 'verified-item';
      cityItem.innerHTML = `
        <span class="label">City of Residence</span>
        <span class="value">✓ ${eligibility.city || 'Berlin'}</span>
      `;
      verifiedDataEl.appendChild(cityItem);
    }

    const basisItem = document.createElement('div');
    basisItem.className = 'verified-item';
    basisItem.innerHTML = `
      <span class="label">Qualification Basis</span>
      <span class="value">✓ ${
        eligibility.qualification === 'presentation-policy'
          ? 'Presentation Policy'
          : 'Berlin Residency'
      }</span>
    `;
    verifiedDataEl.appendChild(basisItem);

    // Add eligibility status
    const eligibilityItem = document.createElement('div');
    eligibilityItem.className = 'verified-item';
    eligibilityItem.innerHTML = `
      <span class="label">Discount Eligibility</span>
      <span class="value" style="color: #16a34a;">✓ Qualified</span>
    `;
    verifiedDataEl.appendChild(eligibilityItem);

    // Add DC API indicator if applicable
    if (isDcApi) {
      const method = document.createElement('div');
      method.className = 'verified-item';
      method.innerHTML = `
        <span class="label">Method</span>
        <span class="value">DC API (Browser Native)</span>
      `;
      verifiedDataEl.appendChild(method);
    }

    // Add session ID for debugging
    if (sessionId) {
      const sessionItem = document.createElement('div');
      sessionItem.className = 'verified-item';
      sessionItem.innerHTML = `
        <span class="label">Session ID</span>
        <span class="value" style="font-family: monospace; font-size: 0.75rem;">${sessionId}</span>
      `;
      verifiedDataEl.appendChild(sessionItem);
    }
  }
}

// Show not Berlin state
interface PresentationCredential {
  id?: unknown;
  values?: unknown;
  credential?: unknown;
}

function extractClaimsFromCredential(credential: PresentationCredential): Record<string, unknown> {
  if (Array.isArray(credential.values) && credential.values.length > 0) {
    const value = credential.values[0];
    if (value && typeof value === 'object') {
      return value as Record<string, unknown>;
    }
  }

  if (credential.credential && typeof credential.credential === 'object') {
    return credential.credential as Record<string, unknown>;
  }

  return credential as Record<string, unknown>;
}

// Extract claims from session credentials
function extractClaims(session: Session): Record<string, unknown> {
  // Session has credentials array: [{ id: "pid-sd-jwt", values: [{ address: { locality: "BERLIN" }, ... }] }]
  if (Array.isArray(session.credentials) && session.credentials.length > 0) {
    const credential = session.credentials[0] as unknown as PresentationCredential;
    return extractClaimsFromCredential(credential);
  }
  
  // Fallback to presentation for backwards compatibility
  const presentation = session.presentation || {};
  return extractClaimsFromPresentation(presentation);
}

// Extract claims from presentation object (for DC API results)
function extractClaimsFromPresentation(presentation: Record<string, unknown>): Record<string, unknown> {
  // Direct claims
  if (presentation.resident_city || presentation.locality || presentation.city || presentation.address) {
    return presentation;
  }
  
  // Nested in credentials array
  if (Array.isArray(presentation.credentials) && presentation.credentials.length > 0) {
    return extractClaimsFromCredential(presentation.credentials[0] as PresentationCredential);
  }
  
  // Nested in credential object
  if (presentation.credential && typeof presentation.credential === 'object') {
    return presentation.credential as Record<string, unknown>;
  }
  
  return presentation;
}

// Handle skip link (no discount)
function handleSkip(e: Event): void {
  e.preventDefault();
  alert('Proceeding to purchase regular ticket for €16.00');
  // In a real app, this would go to checkout
}

// Handle try again
function handleTryAgain(): void {
  showSection(ticketSection);
}

// Handle purchase (discounted)
function handlePurchase(): void {
  alert('🎫 Thank you for your purchase!\n\nYour community discount ticket (€8.00) has been confirmed.\n\nEnjoy your visit to the Berlin History Museum!');
}

// Handle buy regular ticket
function handleBuyRegular(): void {
  alert('🎫 Thank you for your purchase!\n\nYour regular ticket (€16.00) has been confirmed.\n\nEnjoy your visit to the Berlin History Museum!');
}

// Handle done button
function handleDone(): void {
  window.location.href = '../';
}

// Start the app
init();
