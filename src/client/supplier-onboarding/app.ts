/**
 * Supplier Onboarding - DATEV Company Credential Verification Demo
 * Uses DATEV organizational credentials to verify company identity,
 * employee authorization, and e-invoice routing configuration.
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

const USE_CASE = 'supplier-onboarding';

// DOM Elements
const welcomeSection = getElement<HTMLElement>('welcomeSection');
const verificationSection = getElement<HTMLElement>('verificationSection');
const successSection = getElement<HTMLElement>('successSection');
const qrCodeDiv = getElement<HTMLDivElement>('qrCode');
const sameDeviceLink = getElement<HTMLDivElement>('sameDeviceLink');
const statusText = getElement<HTMLParagraphElement>('statusText');
const startBtn = getElement<HTMLButtonElement>('startBtn');
const continueBtn = document.getElementById('continueBtn') as HTMLButtonElement | null;

// Show one section, hide others
function showSection(section: HTMLElement): void {
  [welcomeSection, verificationSection, successSection].forEach((s) => {
    s.style.display = s === section ? 'block' : 'none';
  });
}

// Initialize
function init(): void {
  startBtn.addEventListener('click', handleStart);
  continueBtn?.addEventListener('click', handleContinue);

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
  statusText.textContent = 'Completing verification...';
  
  try {
    const session = await waitForSession(sessionId, {
      onUpdate: (s) => {
        if (s.status === 'pending') {
          statusText.textContent = 'Waiting for wallet response...';
        } else if (s.status === 'processing') {
          statusText.textContent = 'Verifying your credentials...';
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

// Handle start button click
async function handleStart(): Promise<void> {
  startBtn.disabled = true;
  startBtn.textContent = 'Preparing verification...';

  try {
    if (isDcApiEnabled()) {
      await handleDcApiVerification();
    } else {
      await handleQrCodeVerification();
    }
  } catch (error) {
    handleError(error);
  } finally {
    startBtn.disabled = false;
    startBtn.textContent = 'Register as Supplier';
  }
}

// Handle verification via QR code flow
async function handleQrCodeVerification(): Promise<void> {
  const redirectUrl = buildRedirectUrl('{sessionId}');
  const result = await createVerificationRequest(USE_CASE, redirectUrl);

  showSection(verificationSection);

  // Display session ID immediately
  displaySessionIdInQrSection(result.sessionId);

  await generateVerificationUI(
    qrCodeDiv,
    sameDeviceLink,
    result.crossDeviceUri ?? result.uri,
    result.uri
  );
  statusText.textContent = 'Present your DATEV credential to verify';

  const session = await waitForSession(result.sessionId, {
    onUpdate: (s) => {
      if (s.status === 'pending') {
        statusText.textContent = 'Waiting for wallet response...';
      } else if (s.status === 'processing') {
        statusText.textContent = 'Verifying your credentials...';
      }
    },
  });

  showSuccess(session);
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

  showSuccessFromDcApi(result);
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
  statusText.textContent = `Something went wrong: ${message}`;
  statusText.classList.add('error');
}

// Show success state
function showSuccess(session: Session): void {
  showSection(successSection);

  // Extract credential data from the response structure
  // Structure: credentials[].values[] where values contains the actual claims
  const credentials = session.credentials as Array<{ id: string; values: Array<Record<string, unknown>> }> | undefined;
  
  if (credentials && credentials.length > 0) {
    displayVerificationResults(credentials, false, session.sessionId);
  } else if (session.presentation) {
    // Fallback to presentation if available (single credential format)
    const p = session.presentation as Record<string, unknown>;
    displayVerificationResults([{ id: 'unknown', values: [p] }], false, session.sessionId);
  }
}

// Show success state from DC API result
function showSuccessFromDcApi(result: DcApiResult): void {
  showSection(successSection);

  // Try credentials array first, then fall back to presentation
  const credentials = result.credentials as Array<{ id: string; values: Array<Record<string, unknown>> }> | undefined;
  
  if (credentials && credentials.length > 0) {
    displayVerificationResults(credentials, true, result.sessionId);
  } else if (result.presentation) {
    const p = result.presentation as Record<string, unknown>;
    displayVerificationResults([{ id: 'unknown', values: [p] }], true, result.sessionId);
  }
}

// Find credential data by ID pattern
function findCredentialData(
  credentials: Array<{ id: string; values: Array<Record<string, unknown>> }>,
  idPattern: string
): Record<string, unknown> | undefined {
  const credential = credentials.find((c) => 
    c.id.toLowerCase().includes(idPattern.toLowerCase())
  );
  return credential?.values?.[0];
}

// Display verification results organized by category
function displayVerificationResults(
  credentials: Array<{ id: string; values: Array<Record<string, unknown>> }>,
  isDcApi = false,
  sessionId?: string
): void {
  const submitterResults = document.getElementById('submitterResults');
  const companyResults = document.getElementById('companyResults');
  const authorizationResults = document.getElementById('authorizationResults');
  const invoiceResults = document.getElementById('invoiceResults');

  // Find PID and DATEV credentials
  const pidData = findCredentialData(credentials, 'pid') ?? {};
  const datevData = findCredentialData(credentials, 'datev') ?? findCredentialData(credentials, 'company') ?? {};
  
  // If only one credential, it might contain everything
  if (credentials.length === 1) {
    const singleData = credentials[0].values[0] ?? {};
    Object.assign(pidData, singleData);
    Object.assign(datevData, singleData);
  }

  // Submitter (PID) details
  const submitterFields = [
    { label: 'Full Name', value: formatName(pidData) },
    { label: 'Date of Birth', value: formatDate(pidData.birth_date || pidData.birthdate) },
    { label: 'Nationality', value: pidData.nationality || pidData.issuing_country },
    { label: 'Address', value: formatPersonalAddress(pidData) },
  ].filter((f) => f.value);

  if (submitterResults) {
    submitterResults.innerHTML = submitterFields.length > 0
      ? submitterFields.map(renderResultItem).join('')
      : '<p class="no-data">No personal identity data provided</p>';
  }

  // Company details (from DATEV)
  const companyFields = [
    { label: 'Company Name', value: datevData.buyer_org_official_name || datevData.Handelsname_des_Käufers },
    { label: 'VAT ID', value: datevData.buyer_tax_vat_id },
    { label: 'Company ID', value: datevData.buyer_org_unique_id || datevData.buyer_org_euid },
    { label: 'Address', value: formatCompanyAddress(datevData) },
    { label: 'Contact Email', value: datevData.buyer_contact_email },
  ].filter((f) => f.value);

  if (companyResults) {
    companyResults.innerHTML = companyFields.length > 0
      ? companyFields.map(renderResultItem).join('')
      : '<p class="no-data">No company data provided</p>';
  }

  // Authorization details (from DATEV)
  const authFields = [
    { label: 'Employee ID', value: datevData.employee_person_id },
    { label: 'Authorization Role', value: formatRole(datevData.employee_authorization_role as string) },
    { label: 'Spending Limit', value: formatAmount(datevData.employee_authorization_limit_amount) },
    { label: 'Valid Until', value: formatDate(datevData.employee_authorization_validity) },
    { label: 'Acts for Organization', value: datevData.employee_acts_for_org_unique },
  ].filter((f) => f.value);

  if (authorizationResults) {
    authorizationResults.innerHTML = authFields.length > 0
      ? authFields.map(renderResultItem).join('')
      : '<p class="no-data">No authorization data provided</p>';
  }

  // E-Invoice routing details (from DATEV)
  const invoiceFields = [
    { label: 'PEPPOL ID', value: datevData.buyer_routing_peppol_id },
    { label: 'TraffiqX ID', value: datevData.buyer_routing_traffiqx_id },
    { label: 'Preferred Channel', value: datevData.buyer_routing_preferred_channel },
    { label: 'Invoice Email', value: datevData.buyer_routing_email },
    { label: 'Preferred Format', value: datevData.Empfängerwunschformat },
    { label: 'DATEV Mailbox', value: datevData.MyDATEVPostfach },
    { label: 'Advisor Number', value: datevData.Beraternummer },
    { label: 'Client Number', value: datevData.Mandantennummer },
  ].filter((f) => f.value);

  if (isDcApi) {
    invoiceFields.push({ label: 'Verification Method', value: 'DC API (Browser Native)' });
  }

  if (sessionId) {
    invoiceFields.push({ label: 'Session ID', value: `<span style="font-family: monospace; font-size: 0.75rem;">${sessionId}</span>` });
  }

  if (invoiceResults) {
    invoiceResults.innerHTML = invoiceFields.length > 0
      ? invoiceFields.map(renderResultItem).join('')
      : '<p class="no-data">No invoice routing configured</p>';
  }
}

// Format full name from PID fields
function formatName(p: Record<string, unknown>): string | null {
  const parts = [p.given_name, p.family_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

// Format personal address from PID
function formatPersonalAddress(p: Record<string, unknown>): string | null {
  const address = p.address as Record<string, unknown> | undefined;
  const parts = [
    p.street_address || address?.street_address,
    p.locality || address?.locality,
    p.postal_code || address?.postal_code,
    p.country || address?.country,
  ].filter(Boolean) as string[];

  return parts.length > 0 ? parts.join(', ') : null;
}

// Render a single result item
function renderResultItem(field: { label: string; value: unknown }): string {
  return `
    <div class="result-item">
      <span class="result-label">${field.label}</span>
      <span class="result-value">${field.value}</span>
    </div>
  `;
}

// Format company address from credential fields
function formatCompanyAddress(p: Record<string, unknown>): string | null {
  const parts = [
    p.buyer_postal_address_street,
    [p.buyer_postal_address_postcode, p.buyer_postal_address_city].filter(Boolean).join(' '),
    p.buyer_postal_address_country_code,
  ].filter(Boolean) as string[];

  return parts.length > 0 ? parts.join(', ') : null;
}

// Format authorization role for display
function formatRole(role: string | undefined): string | null {
  if (!role) return null;
  
  const roleMap: Record<string, string> = {
    'ceo': 'CEO / Managing Director',
    'cfo': 'CFO / Finance Director',
    'procurement_lead': 'Procurement Lead',
    'purchasing_manager': 'Purchasing Manager',
    'buyer': 'Buyer',
    'authorized_signatory': 'Authorized Signatory',
  };
  
  return roleMap[role.toLowerCase()] || role;
}

// Format amount with currency
function formatAmount(amount: unknown): string | null {
  if (amount === undefined || amount === null) return null;
  
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount));
  if (isNaN(num)) return String(amount);
  
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(num);
}

// Format date helper
function formatDate(date: unknown): string | null {
  if (!date || typeof date !== 'string') return null;
  try {
    return new Date(date).toLocaleDateString('en-EU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return date;
  }
}

// Handle continue (demo only)
function handleContinue(): void {
  alert(
    '🎉 Registration complete!\n\nIn a real application, you would now:\n' +
    '• Browse available procurement opportunities\n' +
    '• Submit quotes within your authorization limit\n' +
    '• Receive and process purchase orders\n' +
    '• Send e-invoices via your configured channel'
  );
}

// Start the app
init();
