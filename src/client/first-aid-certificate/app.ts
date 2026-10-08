/**
 * First Aid Certificate Issuance Demo
 * A training provider issues a first aid certificate (EAA) via pre-authorized code flow.
 * The certificate can then be presented at the crisis helper registration demo.
 */

import {
  createIssuanceOffer,
  generateVerificationUI,
  waitForSession,
  getElement,
} from '../shared/utils';

const CREDENTIAL_ID = 'first-aid-certificate';
const TRAINING_PROVIDER = 'DRH Bildungswerk Musterstadt';
const COURSE_TYPE = 'Erste-Hilfe-Ausbildung (9 UE)';
// First aid certificates for company first aiders have to be refreshed every two years
const VALIDITY_YEARS = 2;

const startSection = getElement<HTMLElement>('startSection');
const issuanceSection = getElement<HTMLElement>('issuanceSection');
const successSection = getElement<HTMLElement>('successSection');
const qrCodeDiv = getElement<HTMLDivElement>('qrCode');
const sameDeviceLink = getElement<HTMLDivElement>('sameDeviceLink');
const statusText = getElement<HTMLParagraphElement>('statusText');
const issueBtn = getElement<HTMLButtonElement>('issueBtn');
const issueSecureBtn = getElement<HTMLButtonElement>('issueSecureBtn');
const issueAnotherBtn = getElement<HTMLButtonElement>('issueAnotherBtn');

const givenNameInput = getElement<HTMLInputElement>('givenName');
const familyNameInput = getElement<HTMLInputElement>('familyName');
const courseDateInput = getElement<HTMLInputElement>('courseDate');
const validUntilPreview = getElement<HTMLElement>('validUntilPreview');

const previewName = getElement<HTMLElement>('previewName');
const previewCourseDate = getElement<HTMLElement>('previewCourseDate');
const previewValidUntil = getElement<HTMLElement>('previewValidUntil');
const previewCertificateId = getElement<HTMLElement>('previewCertificateId');

const txCodeSection = getElement<HTMLElement>('txCodeSection');
const txCodeValue = getElement<HTMLElement>('txCodeValue');
const copyTxCodeBtn = getElement<HTMLButtonElement>('copyTxCodeBtn');

function showSection(section: HTMLElement): void {
  [startSection, issuanceSection, successSection].forEach((s) => {
    s.classList.toggle('hidden', s !== section);
  });
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addYears(isoDate: string, years: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return toIsoDate(date);
}

function formatDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? isoDate
    : date.toLocaleDateString('de-DE', { timeZone: 'UTC' });
}

function generateCertificateId(): string {
  const year = new Date().getFullYear();
  const randomPart = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
  return `EH-${year}-${randomPart}`;
}

function updateValidUntilPreview(): void {
  const courseDate = courseDateInput.value;
  validUntilPreview.textContent = courseDate ? formatDate(addYears(courseDate, VALIDITY_YEARS)) : '-';
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

function resetButtons(): void {
  issueBtn.disabled = false;
  issueBtn.textContent = 'Issue Certificate';
  issueSecureBtn.disabled = false;
  issueSecureBtn.textContent = 'Issue Securely (with PIN)';
}

async function handleIssue(useTxCode: boolean): Promise<void> {
  const givenName = givenNameInput.value.trim();
  const familyName = familyNameInput.value.trim();
  const courseDate = courseDateInput.value;

  if (!givenName || !familyName || !courseDate) {
    startSection.querySelector('form')?.reportValidity();
    return;
  }

  const active = useTxCode ? issueSecureBtn : issueBtn;
  issueBtn.disabled = true;
  issueSecureBtn.disabled = true;
  active.textContent = 'Creating offer...';
  statusText.style.color = '';

  const claims = {
    given_name: givenName.toUpperCase(),
    family_name: familyName.toUpperCase(),
    course_type: COURSE_TYPE,
    course_date: courseDate,
    valid_until: addYears(courseDate, VALIDITY_YEARS),
    training_provider: TRAINING_PROVIDER,
    certificate_id: generateCertificateId(),
  };

  try {
    const result = await createIssuanceOffer(CREDENTIAL_ID, { claims, useTxCode });

    previewName.textContent = `${claims.given_name} ${claims.family_name}`;
    previewCourseDate.textContent = formatDate(claims.course_date);
    previewValidUntil.textContent = formatDate(claims.valid_until);
    previewCertificateId.textContent = claims.certificate_id;

    showSection(issuanceSection);
    await generateVerificationUI(qrCodeDiv, sameDeviceLink, result.uri);

    if (useTxCode && result.txCode) {
      txCodeValue.textContent = result.txCode;
      txCodeSection.classList.remove('hidden');
      statusText.textContent = 'Scan the QR code and enter the PIN in your wallet';
    } else {
      txCodeSection.classList.add('hidden');
      statusText.textContent = 'Scan the QR code with your EUDI Wallet';
    }

    await waitForSession(result.sessionId, {
      flow: 'issuance',
      onUpdate: (session) => {
        if (session.status === 'pending') {
          statusText.textContent = 'Waiting for wallet to accept...';
        } else if (session.status === 'processing') {
          statusText.textContent = 'Issuing first aid certificate...';
        }
      },
    });

    showSection(successSection);
  } catch (error) {
    console.error('Error while issuing first aid certificate', error);
    const message = error instanceof Error ? error.message : 'Issuance failed';
    statusText.textContent = `Error: ${message}`;
    statusText.style.color = 'var(--error)';
    showSection(issuanceSection);
  } finally {
    resetButtons();
  }
}

function handleIssueAnother(): void {
  qrCodeDiv.innerHTML = '';
  qrCodeDiv.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  txCodeSection.classList.add('hidden');
  txCodeValue.textContent = '------';
  statusText.textContent = 'Scan the QR code with your EUDI Wallet';
  statusText.style.color = '';
  showSection(startSection);
}

function init(): void {
  courseDateInput.value = toIsoDate(new Date());
  courseDateInput.max = toIsoDate(new Date());
  updateValidUntilPreview();

  courseDateInput.addEventListener('input', updateValidUntilPreview);
  issueBtn.addEventListener('click', () => {
    void handleIssue(false);
  });
  issueSecureBtn.addEventListener('click', () => {
    void handleIssue(true);
  });
  issueAnotherBtn.addEventListener('click', handleIssueAnother);
  copyTxCodeBtn.addEventListener('click', () => {
    void copyTxCode();
  });
}

init();
