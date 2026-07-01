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

const startSection = getElement<HTMLElement>('startSection');
const issuanceSection = getElement<HTMLElement>('issuanceSection');
const successSection = getElement<HTMLElement>('successSection');
const qrCodeDiv = getElement<HTMLDivElement>('qrCode');
const sameDeviceLink = getElement<HTMLDivElement>('sameDeviceLink');
const statusText = getElement<HTMLParagraphElement>('statusText');
const issueBtn = getElement<HTMLButtonElement>('issueBtn');
const issueSecureBtn = getElement<HTMLButtonElement>('issueSecureBtn');
const issueAnotherBtn = document.getElementById('issueAnotherBtn') as HTMLButtonElement | null;

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

function getDefaultMdlClaims(): Record<string, unknown> {
  return {
    'org.iso.18013.5.1': {
      given_name: 'ERIKA',
      family_name: 'MUSTERMANN',
      birth_date: '1964-08-12',
      age_over_18: true,
      document_number: 'D-12345678',
      issue_date: '2022-01-15',
      expiry_date: '2032-01-14',
      issuing_country: 'DE',
      issuing_authority: 'City of Berlin',
      resident_postal_code: '10115',
      driving_privileges: [
        {
          vehicle_category_code: 'B',
          issue_date: '2022-01-15',
          expiry_date: '2032-01-14',
          codes: [
            {
              code: '01',
              value: '01',
              sign: '+',
            },
          ],
        },
      ],
    },
  };
}

async function copyTxCode(): Promise<void> {
  const value = txCodeValue.textContent || '';
  try {
    await navigator.clipboard.writeText(value);
    const originalText = copyTxCodeBtn.textContent;
    copyTxCodeBtn.textContent = '✓';
    setTimeout(() => {
      copyTxCodeBtn.textContent = originalText;
    }, 1500);
  } catch (error) {
    console.error('Failed to copy transaction code', error);
  }
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

async function handleIssue(useTxCode: boolean): Promise<void> {
  const activeBtn = useTxCode ? issueSecureBtn : issueBtn;
  const inactiveBtn = useTxCode ? issueBtn : issueSecureBtn;

  activeBtn.disabled = true;
  inactiveBtn.disabled = true;
  activeBtn.textContent = 'Creating offer...';

  try {
    const result = await createIssuanceOffer(CREDENTIAL_ID, {
      claims: getDefaultMdlClaims(),
      useTxCode,
    });

    showSection(issuanceSection);
    displaySessionId(result.sessionId);
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
    issueSecureBtn.disabled = false;
    issueBtn.textContent = 'Issue mDL Instantly';
    issueSecureBtn.textContent = 'Issue Securely (with PIN)';
    showSection(issuanceSection);
  }
}

function handleIssueAnother(): void {
  issueBtn.disabled = false;
  issueSecureBtn.disabled = false;
  issueBtn.textContent = 'Issue mDL Instantly';
  issueSecureBtn.textContent = 'Issue Securely (with PIN)';

  statusText.textContent = 'Scan the QR code with your EUDI Wallet';
  statusText.style.color = '';
  qrCodeDiv.innerHTML = '';
  qrCodeDiv.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  txCodeSection.classList.add('hidden');
  txCodeValue.textContent = '------';

  const target = document.getElementById('qrSessionId');
  if (target) {
    target.innerHTML = '';
  }

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
