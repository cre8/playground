/**
 * Crisis Helper Registration Demo
 * Volunteers register for a municipal crisis helper pool with their PID and one
 * qualification (first aid certificate or Ehrenamtskarte). Contact data is
 * entered by the user, since it is not part of the PID.
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
} from '../shared/utils';

const USE_CASE = 'crisis-helper';
const CONTACT_STORAGE_KEY = 'crisis-helper-contact';
const EXPIRY_WARNING_DAYS = 90;

interface Contact {
  phone: string;
  email: string;
}

type Claims = Record<string, unknown>;
type PresentedCredential = { id?: string; values?: Claims[] };

// DOM Elements
const contactSection = getElement<HTMLDivElement>('contactSection');
const successSection = getElement<HTMLDivElement>('successSection');
const rejectedSection = getElement<HTMLDivElement>('rejectedSection');
const rejectedReason = getElement<HTMLParagraphElement>('rejectedReason');
const verificationSection = getElement<HTMLDivElement>('verificationSection');
const infoSection = getElement<HTMLDivElement>('infoSection');
const contactForm = getElement<HTMLFormElement>('contactForm');
const phoneInput = getElement<HTMLInputElement>('phone');
const emailInput = getElement<HTMLInputElement>('email');
const verifyBtn = getElement<HTMLButtonElement>('verifyBtn');
const qrPlaceholder = getElement<HTMLDivElement>('qrPlaceholder');
const sameDeviceLink = getElement<HTMLDivElement>('sameDeviceLink');
const statusText = getElement<HTMLSpanElement>('statusText');
const statusBadge = getElement<HTMLDivElement>('statusBadge');
const qrSessionId = getElement<HTMLDivElement>('qrSessionId');
const helperProfile = getElement<HTMLDivElement>('helperProfile');
const steps = document.querySelectorAll<HTMLElement>('.progress-step');

function init(): void {
  contactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleVerify();
  });

  if (isDcApiAvailable()) {
    document.getElementById('dcApiOption')?.classList.remove('hidden');
  }

  const sessionId = getSessionFromUrl();
  if (sessionId) {
    void resumeSession(sessionId);
  }
}

function isDcApiEnabled(): boolean {
  const toggle = document.getElementById('dcApiToggle') as HTMLInputElement | null;
  return toggle?.checked ?? false;
}

// Contact data survives the same-device wallet redirect via localStorage
function saveContact(contact: Contact): void {
  try {
    localStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify(contact));
  } catch {
    // Storage unavailable (private mode) - contact is only lost on redirect
  }
}

function loadContact(): Contact | null {
  try {
    const raw = localStorage.getItem(CONTACT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Contact) : null;
  } catch {
    return null;
  }
}

function clearContact(): void {
  try {
    localStorage.removeItem(CONTACT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function setStep(step: number): void {
  steps.forEach((el, index) => {
    el.classList.toggle('completed', index + 1 < step);
    el.classList.toggle('active', index + 1 === step);
    const icon = el.querySelector('.step-icon');
    if (icon) {
      icon.textContent = index + 1 < step ? '✓' : String(index + 1);
    }
  });
}

function showVerificationPanel(): void {
  contactSection.classList.add('hidden');
  infoSection.classList.add('hidden');
  verificationSection.classList.remove('hidden');
  setStep(2);
}

function updateStatus(status: string, message: string): void {
  statusBadge.className = `status ${status}`;
  statusText.textContent = message;
}

function displaySessionId(sessionId: string): void {
  qrSessionId.innerHTML = `
    <span class="label">Session ID</span>
    <span class="value">${escapeHtml(sessionId)}</span>
  `;
}

function onSessionUpdate(s: { status: string }): void {
  if (s.status === 'pending') {
    updateStatus('waiting', 'Waiting for wallet response...');
  } else if (s.status === 'processing') {
    updateStatus('processing', 'Processing verification...');
  }
}

async function handleVerify(): Promise<void> {
  if (!contactForm.reportValidity()) {
    return;
  }
  saveContact({ phone: phoneInput.value.trim(), email: emailInput.value.trim() });

  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Starting verification...';

  try {
    if (isDcApiEnabled()) {
      showVerificationPanel();
      qrPlaceholder.innerHTML = '<div class="processing-icon">🔐</div>';
      sameDeviceLink.classList.add('hidden');
      updateStatus('processing', 'Opening wallet...');
      const result = await verifyWithDcApi(USE_CASE, (status) => updateStatus('processing', status));
      displaySessionId(result.sessionId);
      showResult(result.credentials as PresentedCredential[] | undefined, result.sessionId);
    } else {
      const result = await createVerificationRequest(USE_CASE, buildRedirectUrl('{sessionId}'));
      showVerificationPanel();
      displaySessionId(result.sessionId);
      await generateVerificationUI(
        qrPlaceholder,
        sameDeviceLink,
        result.crossDeviceUri ?? result.uri,
        result.uri
      );
      updateStatus('waiting', 'Waiting for you to scan...');
      const session = await waitForSession(result.sessionId, { onUpdate: onSessionUpdate });
      showResult(session.credentials as PresentedCredential[] | undefined, session.sessionId);
    }
  } catch (error) {
    handleError(error);
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Register with EUDI Wallet';
  }
}

async function resumeSession(sessionId: string): Promise<void> {
  showVerificationPanel();
  qrPlaceholder.innerHTML = '<div class="processing-icon">🔄</div>';
  sameDeviceLink.classList.add('hidden');
  displaySessionId(sessionId);
  updateStatus('processing', 'Completing verification...');

  try {
    const session = await waitForSession(sessionId, { onUpdate: onSessionUpdate });
    clearSessionFromUrl();
    showResult(session.credentials as PresentedCredential[] | undefined, session.sessionId);
  } catch (error) {
    clearSessionFromUrl();
    handleError(error);
  }
}

function handleError(error: unknown): void {
  console.error('Verification error:', error);
  const message = error instanceof Error ? error.message : String(error);
  showVerificationPanel();
  qrPlaceholder.innerHTML = '<div class="error-icon">⚠️</div>';
  qrPlaceholder.classList.remove('has-qr');
  sameDeviceLink.classList.add('hidden');
  updateStatus('error', `Something went wrong: ${message}`);
}

// --- Result handling -------------------------------------------------------

function findCredential(credentials: PresentedCredential[], prefix: string): Claims | undefined {
  return credentials.find((c) => c.id?.startsWith(prefix))?.values?.[0];
}

function asText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? isoDate
    : date.toLocaleDateString('de-DE', { timeZone: 'UTC' });
}

function normalizeName(value: unknown): string {
  return asText(value).trim().toLocaleUpperCase('de-DE');
}

// SD-JWT PID: age_equal_or_over.18 / address.*, mdoc PID: age_over_18 / resident_*
function readPid(pid: Claims): { givenName: string; familyName: string; isAdult: unknown; postalCode: string; city: string } {
  const ageEqualOrOver = (pid.age_equal_or_over ?? {}) as Claims;
  const address = (pid.address ?? {}) as Claims;
  return {
    givenName: asText(pid.given_name),
    familyName: asText(pid.family_name),
    isAdult: pid.age_over_18 ?? ageEqualOrOver['18'],
    postalCode: asText(address.postal_code ?? pid.resident_postal_code),
    city: asText(address.locality ?? pid.resident_city),
  };
}

function validityBadge(validUntil: string): string {
  const end = new Date(`${validUntil}T23:59:59Z`).getTime();
  if (Number.isNaN(end)) {
    return '<span class="pill neutral">Validity unknown</span>';
  }
  const daysLeft = Math.ceil((end - Date.now()) / 86_400_000);
  if (daysLeft < 0) {
    return '<span class="pill expired">Expired</span>';
  }
  if (daysLeft <= EXPIRY_WARNING_DAYS) {
    return `<span class="pill warning">Expires in ${daysLeft} days</span>`;
  }
  return '<span class="pill valid">Valid</span>';
}

function row(label: string, value: string, extra = ''): string {
  return `
    <div class="profile-row">
      <span class="profile-label">${escapeHtml(label)}</span>
      <span class="profile-value">${escapeHtml(value || '-')}${extra}</span>
    </div>
  `;
}

function renderQualification(firstAid: Claims | undefined, honorary: Claims | undefined, pidName: string): string {
  if (firstAid) {
    const validUntil = asText(firstAid.valid_until);
    const certName = `${asText(firstAid.given_name)} ${asText(firstAid.family_name)}`.trim();
    const nameMatches =
      pidName.trim() !== '' &&
      `${normalizeName(firstAid.given_name)} ${normalizeName(firstAid.family_name)}` === pidName;
    const nameCheck = nameMatches
      ? '<span class="pill valid">Matches PID</span>'
      : '<span class="pill warning">Differs from PID</span>';

    return `
      <div class="profile-block">
        <h4>🩹 First Aid Certificate</h4>
        ${row('Course', asText(firstAid.course_type))}
        ${row('Completed on', formatDate(asText(firstAid.course_date)))}
        ${row('Valid until', formatDate(validUntil), validUntil ? validityBadge(validUntil) : '')}
        ${row('Training provider', asText(firstAid.training_provider))}
        ${row('Certificate ID', asText(firstAid.certificate_id))}
        ${row('Name on certificate', certName, nameCheck)}
      </div>
    `;
  }

  if (honorary) {
    return `
      <div class="profile-block">
        <h4>🏅 Ehrenamtskarte</h4>
        ${row('Card ID', asText(honorary.card_id))}
        ${row('Qualification', 'Active volunteer (no medical training proven)')}
      </div>
    `;
  }

  return `
    <div class="profile-block">
      <h4>Qualification</h4>
      <p class="muted">No qualification was presented.</p>
    </div>
  `;
}

function generateRegistrationId(): string {
  const randomPart = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
  return `HN-${new Date().getFullYear()}-${randomPart}`;
}

function showResult(credentials: PresentedCredential[] | undefined, sessionId: string): void {
  const presented = credentials ?? [];
  const pidClaims = findCredential(presented, 'pid');
  const firstAid = findCredential(presented, 'first-aid');
  const honorary = findCredential(presented, 'ehrenamtskarte');

  updateStatus('success', 'Verification complete!');

  if (!pidClaims) {
    showRejected('No PID was presented, so your identity could not be confirmed.');
    return;
  }

  const pid = readPid(pidClaims);
  if (pid.isAdult === false) {
    showRejected('Crisis helpers must be at least 18 years old.');
    return;
  }

  const contact = loadContact();
  clearContact();

  const fullName = `${pid.givenName} ${pid.familyName}`.trim();
  const pidName = `${normalizeName(pid.givenName)} ${normalizeName(pid.familyName)}`;
  const region = `${pid.postalCode} ${pid.city}`.trim();

  helperProfile.innerHTML = `
    <div class="profile-header">
      <div>
        <span class="profile-kicker">Registered crisis helper</span>
        <h3>${escapeHtml(fullName || 'Helper')}</h3>
      </div>
      <span class="profile-id">${escapeHtml(generateRegistrationId())}</span>
    </div>

    <div class="profile-block">
      <h4>🪪 Identity <span class="source">from PID</span></h4>
      ${row('Name', fullName)}
      ${row('Age 18+', pid.isAdult === true ? 'Yes' : 'Not disclosed')}
      ${row('Deployment region', region)}
    </div>

    ${renderQualification(firstAid, honorary, pidName)}

    <div class="profile-block">
      <h4>📞 Contact <span class="source self">self-reported</span></h4>
      ${row('Phone', contact?.phone ?? '')}
      ${row('Email', contact?.email ?? '')}
    </div>

    <div class="profile-footer">
      Registered on ${escapeHtml(new Date().toLocaleDateString('de-DE'))} ·
      Session <code>${escapeHtml(sessionId)}</code>
    </div>
  `;

  setTimeout(() => {
    verificationSection.classList.add('hidden');
    infoSection.classList.remove('hidden');
    successSection.classList.remove('hidden');
    setStep(4);
  }, 1200);
}

function showRejected(reason: string): void {
  clearContact();
  rejectedReason.textContent = reason;
  setTimeout(() => {
    verificationSection.classList.add('hidden');
    infoSection.classList.remove('hidden');
    rejectedSection.classList.remove('hidden');
  }, 1200);
}

init();
