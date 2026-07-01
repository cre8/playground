/**
 * Honorary Engagement Card Issuance Demo
 * Uses pre-authorized code flow with the "honorary" credential configuration.
 */

import {
  createIssuanceOffer,
  generateVerificationUI,
  waitForSession,
  getElement,
} from '../shared/utils';

const CREDENTIAL_ID = 'honorary-engagement-card';

const startSection = getElement<HTMLElement>('startSection');
const issuanceSection = getElement<HTMLElement>('issuanceSection');
const successSection = getElement<HTMLElement>('successSection');
const qrCodeDiv = getElement<HTMLDivElement>('qrCode');
const sameDeviceLink = getElement<HTMLDivElement>('sameDeviceLink');
const statusText = getElement<HTMLParagraphElement>('statusText');
const issueBtn = getElement<HTMLButtonElement>('issueBtn');
const issueSecureBtn = getElement<HTMLButtonElement>('issueSecureBtn');
const issueAnotherBtn = document.getElementById('issueAnotherBtn') as HTMLButtonElement | null;

const generatedCardIdEl = getElement<HTMLElement>('generatedCardId');
const issuedCardIdEl = getElement<HTMLElement>('issuedCardId');
const successCardIdEl = getElement<HTMLElement>('successCardId');

const txCodeSection = getElement<HTMLElement>('txCodeSection');
const txCodeValue = getElement<HTMLElement>('txCodeValue');
const copyTxCodeBtn = getElement<HTMLButtonElement>('copyTxCodeBtn');

function showSection(section: HTMLElement): void {
  [startSection, issuanceSection, successSection].forEach((s) => {
    if (s === section) {
      s.classList.remove('hidden');
    } else {
      s.classList.add('hidden');
    }
  });
}

async function copyTxCode(): Promise<void> {
  const value = txCodeValue.textContent || '';
  try {
    await navigator.clipboard.writeText(value);
    const previous = copyTxCodeBtn.textContent;
    copyTxCodeBtn.textContent = '✓';
    setTimeout(() => {
      copyTxCodeBtn.textContent = previous;
    }, 1500);
  } catch (error) {
    console.error('Failed to copy transaction code', error);
  }
}

async function handleIssue(useTxCode: boolean): Promise<void> {
  const active = useTxCode ? issueSecureBtn : issueBtn;
  const inactive = useTxCode ? issueBtn : issueSecureBtn;

  statusText.style.color = '';
  active.disabled = true;
  inactive.disabled = true;
  active.textContent = 'Creating offer...';

  try {
    generatedCardIdEl.textContent = 'Generating on server...';

    const result = await createIssuanceOffer(CREDENTIAL_ID, {
      useTxCode,
    });

    const cardId = result.cardId || '-';
    generatedCardIdEl.textContent = cardId;
    issuedCardIdEl.textContent = cardId;
    successCardIdEl.textContent = cardId;

    showSection(issuanceSection);
    await generateVerificationUI(qrCodeDiv, sameDeviceLink, result.uri);

    if (useTxCode && result.txCode) {
      txCodeValue.textContent = result.txCode;
      txCodeSection.classList.remove('hidden');
      statusText.textContent = 'Scan QR code and enter the PIN in your wallet';
    } else {
      txCodeSection.classList.add('hidden');
      statusText.textContent = 'Scan the QR code with your EUDI Wallet';
    }

    await waitForSession(result.sessionId, {
      onUpdate: (session) => {
        if (session.status === 'pending') {
          statusText.textContent = 'Waiting for wallet to accept...';
        } else if (session.status === 'processing') {
          statusText.textContent = 'Issuing honorary engagement card...';
        }
      },
    });

    showSection(successSection);
  } catch (error) {
    console.error('Error while issuing honorary card', error);
    const message = error instanceof Error ? error.message : 'Issuance failed';
    statusText.textContent = `Error: ${message}`;
    statusText.style.color = '#dc2626';
    issueBtn.disabled = false;
    issueBtn.textContent = 'Issue Card Instantly';
    issueSecureBtn.disabled = false;
    issueSecureBtn.textContent = 'Issue Securely (with PIN)';
    showSection(issuanceSection);
  }
}

function handleIssueAnother(): void {
  issueBtn.disabled = false;
  issueBtn.textContent = 'Issue Card Instantly';
  issueSecureBtn.disabled = false;
  issueSecureBtn.textContent = 'Issue Securely (with PIN)';

  statusText.textContent = 'Scan the QR code with your EUDI Wallet';
  statusText.style.color = '';
  qrCodeDiv.innerHTML = '';
  qrCodeDiv.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  txCodeSection.classList.add('hidden');
  txCodeValue.textContent = '------';
  generatedCardIdEl.textContent = '-';
  issuedCardIdEl.textContent = '-';
  successCardIdEl.textContent = '-';

  showSection(startSection);
}

function init(): void {
  issueBtn.addEventListener('click', () => {
    void handleIssue(false);
  });
  issueSecureBtn.addEventListener('click', () => {
    void handleIssue(true);
  });
  issueAnotherBtn?.addEventListener('click', handleIssueAnother);
  copyTxCodeBtn.addEventListener('click', () => {
    void copyTxCode();
  });
}

init();
