/**
 * Mobile Driving Licence (mDL) Issuance Demo
 * Uses pre-authorized code flow and sends default mDL claims.
 */

import {
  createIssuanceOffer,
  generateVerificationUI,
  waitForSession,
  getElement,
} from '../shared/utils';

const CREDENTIAL_ID = 'mdl-issuance';
const MDL_ATTRIBUTE_PROVIDER_ID = 'claims-provider';
const MDL_AUTHORIZATION_SERVER = 'authorization-server:name';

const startSection = getElement<HTMLElement>('startSection');
const issuanceSection = getElement<HTMLElement>('issuanceSection');
const successSection = getElement<HTMLElement>('successSection');
const qrCodeDiv = getElement<HTMLDivElement>('qrCode');
const sameDeviceLink = getElement<HTMLDivElement>('sameDeviceLink');
const statusText = getElement<HTMLParagraphElement>('statusText');
const issueBtn = getElement<HTMLButtonElement>('issueBtn');
const issueAnotherBtn = document.getElementById('issueAnotherBtn') as HTMLButtonElement | null;

function showSection(section: HTMLElement): void {
  [startSection, issuanceSection, successSection].forEach((s) => {
    if (s === section) {
      s.classList.remove('hidden');
    } else {
      s.classList.add('hidden');
    }
  });
}

function displaySessionId(sessionId: string): void {
  const target = document.getElementById('qrSessionId');
  if (!target) {
    return;
  }

  target.innerHTML = `
    <span class="label">Session ID</span>
    <span class="value">${sessionId}</span>
  `;
}

async function handleIssue(): Promise<void> {
  issueBtn.disabled = true;
  issueBtn.textContent = 'Creating offer...';

  try {
    const result = await createIssuanceOffer(CREDENTIAL_ID, {
      credentialClaims: {
        mdl: {
          type: 'attributeProvider',
          attributeProviderId: MDL_ATTRIBUTE_PROVIDER_ID,
        },
      },
      preferredAuthServer: MDL_AUTHORIZATION_SERVER,
    });

    showSection(issuanceSection);
    displaySessionId(result.sessionId);
    await generateVerificationUI(qrCodeDiv, sameDeviceLink, result.uri);
    statusText.textContent = 'Scan the QR code with your EUDI Wallet';

    await waitForSession(result.sessionId, {
      onUpdate: (session) => {
        if (session.status === 'pending') {
          statusText.textContent = 'Waiting for wallet to accept...';
        } else if (session.status === 'processing') {
          statusText.textContent = 'Issuing mobile driving licence...';
        }
      },
    });

    showSection(successSection);
  } catch (error) {
    console.error('Error while issuing mDL', error);
    const message = error instanceof Error ? error.message : 'Issuance failed';
    statusText.textContent = `Error: ${message}`;
    statusText.style.color = '#dc2626';
    issueBtn.disabled = false;
    issueBtn.textContent = 'Issue mDL Instantly';
    showSection(issuanceSection);
  }
}

function handleIssueAnother(): void {
  issueBtn.disabled = false;
  issueBtn.textContent = 'Issue mDL Instantly';

  statusText.textContent = 'Scan the QR code with your EUDI Wallet';
  statusText.style.color = '';
  qrCodeDiv.innerHTML = '';
  qrCodeDiv.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');

  const target = document.getElementById('qrSessionId');
  if (target) {
    target.innerHTML = '';
  }

  showSection(startSection);
}

function init(): void {
  issueBtn.addEventListener('click', () => {
    void handleIssue();
  });
  issueAnotherBtn?.addEventListener('click', handleIssueAnother);
}

init();
