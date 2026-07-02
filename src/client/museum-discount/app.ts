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

const REGULAR_PRICE = 16;

type CredentialDiscountType = 'berlin-resident' | 'honorary-card' | 'community';

type DiscountQualification = 'berlin-residency' | 'presentation-policy';

interface DiscountEligibility {
  qualification: DiscountQualification;
  city?: string;
  credentialType: CredentialDiscountType;
  discountPercent: number;
}

interface PricingDetails {
  regularPrice: number;
  discountPercent: number;
  discountAmount: number;
  finalPrice: number;
  label: string;
  audienceLabel: string;
}

interface VerificationPayload {
  claims: Record<string, unknown>;
  credentialId?: string;
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

function normalizeCredentialId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
}

function getCredentialTypeFromClaims(claims: Record<string, unknown>, credentialId?: string): CredentialDiscountType {
  const normalizedCredentialId = normalizeCredentialId(credentialId);
  const credentialTypeClaim = normalizeCredentialId(claims.credential_type);
  const cardTypeClaim = normalizeCredentialId(claims.card_type);

  if (
    normalizedCredentialId?.includes('honorary') ||
    credentialTypeClaim?.includes('honorary') ||
    credentialTypeClaim?.includes('ehrenamtskarte') ||
    cardTypeClaim?.includes('honorary') ||
    cardTypeClaim?.includes('ehrenamtskarte')
  ) {
    return 'honorary-card';
  }

  if (isBerlinResidentFromClaims(claims)) {
    return 'berlin-resident';
  }

  return 'community';
}

function getPricingDetails(credentialType: CredentialDiscountType): PricingDetails {
  switch (credentialType) {
    case 'honorary-card': {
      const discountPercent = 80;
      const discountAmount = (REGULAR_PRICE * discountPercent) / 100;
      return {
        regularPrice: REGULAR_PRICE,
        discountPercent,
        discountAmount,
        finalPrice: REGULAR_PRICE - discountAmount,
        label: 'Honorary Card Discount',
        audienceLabel: 'Honorary Card Holder',
      };
    }
    case 'berlin-resident': {
      const discountPercent = 50;
      const discountAmount = (REGULAR_PRICE * discountPercent) / 100;
      return {
        regularPrice: REGULAR_PRICE,
        discountPercent,
        discountAmount,
        finalPrice: REGULAR_PRICE - discountAmount,
        label: 'Community Discount',
        audienceLabel: 'Berlin Resident',
      };
    }
    default: {
      const discountPercent = 50;
      const discountAmount = (REGULAR_PRICE * discountPercent) / 100;
      return {
        regularPrice: REGULAR_PRICE,
        discountPercent,
        discountAmount,
        finalPrice: REGULAR_PRICE - discountAmount,
        label: 'Community Discount',
        audienceLabel: 'Community Visitor',
      };
    }
  }
}

function isBerlinResidentFromClaims(claims: Record<string, unknown>): boolean {
  const city = getCityFromClaims(claims);
  if (!city) {
    return false;
  }

  const cityLower = city.toLowerCase();
  return cityLower === 'berlin' || cityLower.includes('berlin');
}

function evaluateDiscountEligibilityFromClaims(
  claims: Record<string, unknown>,
  credentialId?: string
): DiscountEligibility {
  const credentialType = getCredentialTypeFromClaims(claims, credentialId);
  const pricing = getPricingDetails(credentialType);

  if (isBerlinResidentFromClaims(claims)) {
    return {
      qualification: 'berlin-residency',
      city: getCityFromClaims(claims),
      credentialType,
      discountPercent: pricing.discountPercent,
    };
  }

  return {
    qualification: 'presentation-policy',
    city: getCityFromClaims(claims),
    credentialType,
    discountPercent: pricing.discountPercent,
  };
}

// Handle verification result
function handleVerificationResult(session: Session): void {
  const payload = extractVerificationPayload(session);
  const eligibility = evaluateDiscountEligibilityFromClaims(payload.claims, payload.credentialId);
  const pricing = getPricingDetails(eligibility.credentialType);
  showSuccess(session, payload.claims, eligibility, pricing);
}

// Handle verification result from DC API
function handleVerificationResultFromDcApi(result: DcApiResult): void {
  const payload = extractVerificationPayloadFromPresentation(result.presentation);
  const eligibility = evaluateDiscountEligibilityFromClaims(payload.claims, payload.credentialId);
  const pricing = getPricingDetails(eligibility.credentialType);
  showSuccessFromDcApi(result, payload.claims, eligibility, pricing);
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
  eligibility: DiscountEligibility,
  pricing: PricingDetails
): void {
  showSection(successSection);
  displaySuccessContent(claims, eligibility, pricing, false, session.sessionId);
}

// Show success state from DC API
function showSuccessFromDcApi(
  result: DcApiResult,
  claims: Record<string, unknown>,
  eligibility: DiscountEligibility,
  pricing: PricingDetails
): void {
  showSection(successSection);
  displaySuccessContent(claims, eligibility, pricing, true, result.sessionId);
}

// Display success content
function displaySuccessContent(
  claims: Record<string, unknown>,
  eligibility: DiscountEligibility,
  pricing: PricingDetails,
  isDcApi: boolean,
  sessionId?: string
): void {
  // Set ticket ID
  const ticketIdEl = document.getElementById('ticketId');
  if (ticketIdEl) {
    ticketIdEl.textContent = generateTicketId();
  }

  const audienceLabelEl = document.querySelector('.discount-visual span');
  if (audienceLabelEl) {
    audienceLabelEl.textContent = pricing.audienceLabel;
  }

  const regularPriceEls = Array.from(document.querySelectorAll<HTMLElement>('.price-row .strikethrough'));
  regularPriceEls.forEach((element) => {
    element.textContent = `€${pricing.regularPrice.toFixed(2)}`;
  });

  const discountLabelEl = document.querySelector('.discount-row span');
  if (discountLabelEl) {
    discountLabelEl.textContent = `${pricing.label} (${pricing.discountPercent}%)`;
  }

  const discountAmountEl = document.querySelector('.discount-amount');
  if (discountAmountEl) {
    discountAmountEl.textContent = `-€${pricing.discountAmount.toFixed(2)}`;
  }

  const finalPriceEl = document.querySelector('.final-price');
  if (finalPriceEl) {
    finalPriceEl.textContent = `€${pricing.finalPrice.toFixed(2)}`;
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

    const credentialTypeItem = document.createElement('div');
    credentialTypeItem.className = 'verified-item';
    credentialTypeItem.innerHTML = `
      <span class="label">Credential Type</span>
      <span class="value">✓ ${pricing.audienceLabel}</span>
    `;
    verifiedDataEl.appendChild(credentialTypeItem);

    // Add eligibility status
    const eligibilityItem = document.createElement('div');
    eligibilityItem.className = 'verified-item';
    eligibilityItem.innerHTML = `
      <span class="label">Discount Eligibility</span>
      <span class="value" style="color: #16a34a;">✓ Qualified</span>
    `;
    verifiedDataEl.appendChild(eligibilityItem);

    const discountItem = document.createElement('div');
    discountItem.className = 'verified-item';
    discountItem.innerHTML = `
      <span class="label">Discount Applied</span>
      <span class="value" style="color: #16a34a;">✓ ${pricing.discountPercent}% off</span>
    `;
    verifiedDataEl.appendChild(discountItem);

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

function extractVerificationPayloadFromCredential(credential: PresentationCredential): VerificationPayload {
  return {
    claims: extractClaimsFromCredential(credential),
    credentialId: normalizeCredentialId(credential.id),
  };
}

// Extract claims from session credentials
function extractVerificationPayload(session: Session): VerificationPayload {
  // Session has credentials array: [{ id: "pid-sd-jwt", values: [{ address: { locality: "BERLIN" }, ... }] }]
  if (Array.isArray(session.credentials) && session.credentials.length > 0) {
    const credential = session.credentials[0] as unknown as PresentationCredential;
    return extractVerificationPayloadFromCredential(credential);
  }
  
  // Fallback to presentation for backwards compatibility
  const presentation = session.presentation || {};
  return extractVerificationPayloadFromPresentation(presentation);
}

// Extract claims from presentation object (for DC API results)
function extractVerificationPayloadFromPresentation(
  presentation: Record<string, unknown> | undefined
): VerificationPayload {
  const safePresentation = presentation || {};

  // Direct claims
  if (
    safePresentation.resident_city ||
    safePresentation.locality ||
    safePresentation.city ||
    safePresentation.address
  ) {
    return {
      claims: safePresentation,
      credentialId: normalizeCredentialId(safePresentation.id),
    };
  }
  
  // Nested in credentials array
  if (Array.isArray(safePresentation.credentials) && safePresentation.credentials.length > 0) {
    return extractVerificationPayloadFromCredential(safePresentation.credentials[0] as PresentationCredential);
  }
  
  // Nested in credential object
  if (safePresentation.credential && typeof safePresentation.credential === 'object') {
    return {
      claims: safePresentation.credential as Record<string, unknown>,
      credentialId: normalizeCredentialId(safePresentation.id),
    };
  }
  
  return {
    claims: safePresentation,
    credentialId: normalizeCredentialId(safePresentation.id),
  };
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
  const audienceLabel = document.querySelector('.discount-visual span')?.textContent || 'Visitor';
  const finalPrice = document.querySelector('.final-price')?.textContent || '€8.00';
  alert(
    `🎫 Thank you for your purchase!\n\nYour ${audienceLabel.toLowerCase()} ticket (${finalPrice}) has been confirmed.\n\nEnjoy your visit to the Berlin History Museum!`
  );
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
