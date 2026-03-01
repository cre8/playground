/**
 * Loyalty Card Issuance Demo
 * Uses EUDIPLO to issue a digital membership card
 * Demonstrates the Pre-authorized Code flow (no additional authentication needed)
 */

import {
  createIssuanceOffer,
  generateVerificationUI,
  waitForSession,
  getElement,
} from '../shared/utils';

const CREDENTIAL_ID = 'loyalty-card';

// Membership tier definitions
interface MembershipTier {
  name: string;
  icon: string;
  benefits: string[];
}

const TIERS: Record<string, MembershipTier> = {
  bronze: {
    name: 'Bronze',
    icon: '🥉',
    benefits: ['Gym access (off-peak)', 'Basic equipment'],
  },
  silver: {
    name: 'Silver',
    icon: '🥈',
    benefits: ['Full gym access', '2 classes/week', 'Locker included'],
  },
  gold: {
    name: 'Gold',
    icon: '🥇',
    benefits: ['All access', 'Unlimited classes', 'Spa access', 'Personal trainer session'],
  },
};

// DOM Elements
const registrationSection = getElement<HTMLElement>('registrationSection');
const issuanceSection = getElement<HTMLElement>('issuanceSection');
const successSection = getElement<HTMLElement>('successSection');
const qrCodeDiv = getElement<HTMLDivElement>('qrCode');
const sameDeviceLink = getElement<HTMLDivElement>('sameDeviceLink');
const statusText = getElement<HTMLParagraphElement>('statusText');
const registerBtn = getElement<HTMLButtonElement>('registerBtn');
const registerSecureBtn = getElement<HTMLButtonElement>('registerSecureBtn');
const registerAnotherBtn = document.getElementById('registerAnotherBtn') as HTMLButtonElement | null;

// Transaction code elements
const txCodeSection = getElement<HTMLElement>('txCodeSection');
const txCodeValue = getElement<HTMLElement>('txCodeValue');
const copyTxCodeBtn = getElement<HTMLButtonElement>('copyTxCodeBtn');

// Card preview elements
const memberIdSpan = getElement<HTMLElement>('memberId');
const cardTierSpan = getElement<HTMLElement>('cardTier');
const cardJoinDateSpan = getElement<HTMLElement>('cardJoinDate');
const cardValidUntilSpan = getElement<HTMLElement>('cardValidUntil');

// Show one section, hide others
function showSection(section: HTMLElement): void {
  [registrationSection, issuanceSection, successSection].forEach((s) => {
    if (s === section) {
      s.classList.remove('hidden');
    } else {
      s.classList.add('hidden');
    }
  });
}

// Get selected tier
function getSelectedTier(): string {
  const selected = document.querySelector('input[name="tier"]:checked') as HTMLInputElement;
  return selected?.value || 'silver';
}

// Generate a random member ID
function generateMemberId(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 999999).toString().padStart(6, '0');
  return `FL-${year}-${random}`;
}

// Format date for display
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// Format date as ISO string (YYYY-MM-DD)
function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Initialize
function init(): void {
  registerBtn.addEventListener('click', () => handleRegister(false));
  registerSecureBtn.addEventListener('click', () => handleRegister(true));
  registerAnotherBtn?.addEventListener('click', handleRegisterAnother);
  copyTxCodeBtn.addEventListener('click', handleCopyTxCode);
}

// Copy transaction code to clipboard
async function handleCopyTxCode(): Promise<void> {
  const code = txCodeValue.textContent || '';
  try {
    await navigator.clipboard.writeText(code);
    const originalText = copyTxCodeBtn.textContent;
    copyTxCodeBtn.textContent = '✓';
    setTimeout(() => {
      copyTxCodeBtn.textContent = originalText;
    }, 1500);
  } catch (error) {
    console.error('Failed to copy:', error);
  }
}

// Handle register button click
async function handleRegister(useSecure: boolean): Promise<void> {
  const activeBtn = useSecure ? registerSecureBtn : registerBtn;
  const otherBtn = useSecure ? registerBtn : registerSecureBtn;

  activeBtn.disabled = true;
  otherBtn.disabled = true;
  activeBtn.textContent = 'Processing registration...';

  try {
    // Generate membership data
    const memberId = generateMemberId();
    const tier = getSelectedTier();
    const tierInfo = TIERS[tier];
    const joinDate = new Date();
    const validUntil = new Date(joinDate);
    validUntil.setFullYear(validUntil.getFullYear() + 1);

    // Update card preview
    memberIdSpan.textContent = memberId;
    cardTierSpan.textContent = `${tierInfo.icon} ${tierInfo.name}`;
    cardJoinDateSpan.textContent = formatDate(joinDate);
    cardValidUntilSpan.textContent = formatDate(validUntil);

    // Build claims for the credential
    const claims = {
      member_id: memberId,
      membership_tier: tierInfo.name,
      join_date: formatDateISO(joinDate),
      valid_until: formatDateISO(validUntil),
      organization_name: 'FitLife Health Club',
      issuing_country: 'DE',
    };

    // Create issuance offer (pre-authorized code flow - no additional auth needed)
    const result = await createIssuanceOffer(CREDENTIAL_ID, {
      claims,
      useTxCode: useSecure,
    });

    // Show issuance section with QR code
    showSection(issuanceSection);
    await generateVerificationUI(qrCodeDiv, sameDeviceLink, result.uri);

    // Show transaction code if using secure flow
    if (useSecure && result.txCode) {
      txCodeValue.textContent = result.txCode;
      txCodeSection.classList.remove('hidden');
      statusText.textContent = 'Scan QR code and enter the PIN in your wallet';
    } else {
      txCodeSection.classList.add('hidden');
      statusText.textContent = 'Scan the QR code with your EUDI Wallet';
    }

    // Wait for issuance to complete
    await waitForSession(result.sessionId, {
      onUpdate: (s) => {
        if (s.status === 'pending') {
          statusText.textContent = 'Waiting for wallet to accept...';
        } else if (s.status === 'processing') {
          statusText.textContent = 'Issuing membership card...';
        }
      },
    });

    showSuccess();
  } catch (error) {
    handleError(error);
  }
}

// Handle register another button
function handleRegisterAnother(): void {
  // Reset state
  registerBtn.disabled = false;
  registerBtn.textContent = '💳 Complete Registration & Get Card';
  registerSecureBtn.disabled = false;
  registerSecureBtn.textContent = '🔒 Secure Registration (with PIN)';
  qrCodeDiv.innerHTML = '';
  qrCodeDiv.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  txCodeSection.classList.add('hidden');
  txCodeValue.textContent = '------';
  statusText.textContent = 'Waiting for wallet to accept...';
  statusText.style.color = '';

  // Show registration section
  showSection(registrationSection);
}

// Show success section
function showSuccess(): void {
  showSection(successSection);
}

// Handle errors
function handleError(error: unknown): void {
  console.error('Error:', error);
  const message = error instanceof Error ? error.message : 'An error occurred';

  statusText.textContent = `Error: ${message}`;
  statusText.style.color = '#dc2626';

  // Reset buttons
  registerBtn.disabled = false;
  registerBtn.textContent = '💳 Complete Registration & Get Card';
  registerSecureBtn.disabled = false;
  registerSecureBtn.textContent = '🔒 Secure Registration (with PIN)';
}

// Start the app
init();
