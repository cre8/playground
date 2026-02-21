/**
 * University Diploma Issuance Demo
 * Uses EUDIPLO to issue a digital diploma credential
 * Demonstrates the Authorization Code flow (wallet redirects to Keycloak for auth)
 */

import {
  createIssuanceOffer,
  generateVerificationUI,
  waitForSession,
  getElement,
} from '../shared/utils';

const CREDENTIAL_ID = 'university-diploma';

// DOM Elements
const startSection = getElement<HTMLElement>('startSection');
const issuanceSection = getElement<HTMLElement>('issuanceSection');
const successSection = getElement<HTMLElement>('successSection');
const qrCodeDiv = getElement<HTMLDivElement>('qrCode');
const sameDeviceLink = getElement<HTMLDivElement>('sameDeviceLink');
const statusText = getElement<HTMLParagraphElement>('statusText');
const getCredentialBtn = getElement<HTMLButtonElement>('getCredentialBtn');
const getAnotherBtn = document.getElementById('getAnotherBtn') as HTMLButtonElement | null;

// Show one section, hide others
function showSection(section: HTMLElement): void {
  [startSection, issuanceSection, successSection].forEach((s) => {
    if (s === section) {
      s.classList.remove('hidden');
    } else {
      s.classList.add('hidden');
    }
  });
}

// Initialize
function init(): void {
  getCredentialBtn.addEventListener('click', handleGetCredential);
  getAnotherBtn?.addEventListener('click', handleGetAnother);
}

// Handle get credential button click
async function handleGetCredential(): Promise<void> {
  getCredentialBtn.disabled = true;
  getCredentialBtn.textContent = 'Creating offer...';

  try {
    // Create issuance offer (no claims - auth code flow will determine the user)
    // The wallet will redirect to Keycloak for authentication
    const result = await createIssuanceOffer(CREDENTIAL_ID);

    // Show issuance section with QR code
    showSection(issuanceSection);
    await generateVerificationUI(qrCodeDiv, sameDeviceLink, result.uri);
    statusText.textContent = 'Scan the QR code with your EUDI Wallet';

    // Wait for issuance to complete
    await waitForSession(result.sessionId, {
      onUpdate: (s) => {
        if (s.status === 'pending') {
          statusText.textContent = 'Waiting for wallet to authenticate...';
        } else if (s.status === 'processing') {
          statusText.textContent = 'Issuing credential...';
        }
      },
    });

    showSuccess();
  } catch (error) {
    handleError(error);
  }
}

// Handle get another button
function handleGetAnother(): void {
  // Reset state
  getCredentialBtn.disabled = false;
  getCredentialBtn.textContent = '🎓 Get Digital Diploma';
  qrCodeDiv.innerHTML = '';
  qrCodeDiv.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  statusText.textContent = 'Waiting for wallet to accept...';
  statusText.style.color = '';

  // Show start section
  showSection(startSection);
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

  // Reset button
  getCredentialBtn.disabled = false;
  getCredentialBtn.textContent = '🎓 Get Digital Diploma';
}

// Start the app
init();
