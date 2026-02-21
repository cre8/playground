/**
 * Sports Shop Member Discount Demo
 * Uses EUDIPLO to verify gym membership for discounts
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

const USE_CASE = 'sports-shop';

// Pricing
const ORIGINAL_PRICE = 149.99;
const DISCOUNT_PERCENT = 15;
const DISCOUNTED_PRICE = ORIGINAL_PRICE * (1 - DISCOUNT_PERCENT / 100);

// DOM Elements
const discountSection = getElement<HTMLDivElement>('discountSection');
const verificationSection = getElement<HTMLDivElement>('verificationSection');
const checkoutSection = getElement<HTMLDivElement>('checkoutSection');
const infoSection = getElement<HTMLDivElement>('infoSection');
const qrPlaceholder = getElement<HTMLDivElement>('qrPlaceholder');
const sameDeviceLink = getElement<HTMLDivElement>('sameDeviceLink');
const statusText = getElement<HTMLSpanElement>('statusText');
const statusBadge = getElement<HTMLDivElement>('statusBadge');
const credentialDisplay = getElement<HTMLDivElement>('credentialDisplay');
const resultPanel = getElement<HTMLDivElement>('resultPanel');
const applyDiscountBtn = getElement<HTMLButtonElement>('applyDiscountBtn');

// Price display elements
const originalPriceEl = document.querySelector('.product-price.original') as HTMLElement | null;
const discountedPriceEl = document.querySelector('.product-price.discounted') as HTMLElement | null;
const discountBadgeEl = document.querySelector('.discount-badge') as HTMLElement | null;
const discountRowEl = document.getElementById('discountRow');
const cartTotalEl = document.getElementById('cartTotal');
const membershipTierEl = document.getElementById('membershipTier');

// State
let _currentSessionId: string | null = null;

// Initialize
function init(): void {
  applyDiscountBtn.addEventListener('click', handleApplyDiscount);

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
  discountSection.classList.add('hidden');
  verificationSection.classList.remove('hidden');
  infoSection.classList.add('hidden');

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

// Handle apply discount button click
async function handleApplyDiscount(): Promise<void> {
  applyDiscountBtn.disabled = true;
  applyDiscountBtn.textContent = 'Verifying membership...';

  try {
    if (isDcApiEnabled()) {
      await handleDcApiVerification();
    } else {
      await handleQrCodeVerification();
    }
  } catch (error) {
    handleError(error);
  } finally {
    applyDiscountBtn.disabled = false;
    applyDiscountBtn.textContent = '🎫 Apply Member Discount';
  }
}

// Handle verification via QR code flow
async function handleQrCodeVerification(): Promise<void> {
  const redirectUrl = buildRedirectUrl('{sessionId}');
  const result = await createVerificationRequest(USE_CASE, redirectUrl);
  _currentSessionId = result.sessionId;

  // Show verification section
  discountSection.classList.add('hidden');
  verificationSection.classList.remove('hidden');
  infoSection.classList.add('hidden');

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
  discountSection.classList.add('hidden');
  verificationSection.classList.remove('hidden');
  infoSection.classList.add('hidden');

  qrPlaceholder.innerHTML = '<div class="processing-icon">🔐</div>';
  qrPlaceholder.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  updateStatus('processing', 'Opening wallet...');

  const result = await verifyWithDcApi(USE_CASE, (status) => {
    updateStatus('processing', status);
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

  discountSection.classList.add('hidden');
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

// Apply discount to UI
function applyDiscountToUI(tier: string): void {
  // Update product price display
  if (originalPriceEl) {
    originalPriceEl.classList.add('has-discount');
  }
  if (discountedPriceEl) {
    discountedPriceEl.classList.remove('hidden');
  }
  if (discountBadgeEl) {
    discountBadgeEl.classList.remove('hidden');
  }

  // Update cart
  if (discountRowEl) {
    discountRowEl.classList.remove('hidden');
  }
  if (cartTotalEl) {
    cartTotalEl.textContent = `€${DISCOUNTED_PRICE.toFixed(2)}`;
  }

  // Update membership tier display
  if (membershipTierEl) {
    membershipTierEl.textContent = tier;
  }
}

// Show success state
function showSuccess(session: Session): void {
  updateStatus('success', 'Membership verified!');

  resultPanel.classList.remove('hidden');

  let tier = 'Member';
  if (session.presentation) {
    const p = session.presentation as Record<string, unknown>;
    tier = (p.membership_tier as string) ?? 'Member';
    displayMembershipData(p);
  }

  setTimeout(() => {
    applyDiscountToUI(tier);
    verificationSection.classList.add('hidden');
    checkoutSection.classList.remove('hidden');
  }, 1500);
}

// Show success state from DC API result
function showSuccessFromDcApi(result: DcApiResult): void {
  updateStatus('success', 'Membership verified!');

  resultPanel.classList.remove('hidden');

  let tier = 'Member';
  if (result.presentation) {
    const p = result.presentation as Record<string, unknown>;
    tier = (p.membership_tier as string) ?? 'Member';
    displayMembershipData(p, true);
  }

  setTimeout(() => {
    applyDiscountToUI(tier);
    verificationSection.classList.add('hidden');
    checkoutSection.classList.remove('hidden');
  }, 1500);
}

// Display membership data in the credential display
function displayMembershipData(data: Record<string, unknown>, isDcApi = false): void {
  const tier = data.membership_tier ?? 'N/A';
  const organization = data.organization_name ?? 'N/A';
  const validUntil = data.valid_until ?? 'N/A';

  let html = `
    <div class="credential-item">
      <span class="label">Membership Tier</span>
      <span class="value">${tier}</span>
    </div>
    <div class="credential-item">
      <span class="label">Organization</span>
      <span class="value">${organization}</span>
    </div>
    <div class="credential-item">
      <span class="label">Valid Until</span>
      <span class="value">${validUntil}</span>
    </div>
    <div class="credential-item">
      <span class="label">Discount Applied</span>
      <span class="value success">${DISCOUNT_PERCENT}% off</span>
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

  credentialDisplay.innerHTML = html;
}

// Start the app
init();
