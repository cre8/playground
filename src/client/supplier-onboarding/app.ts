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

  const result = await verifyWithDcApi(USE_CASE, (status) => {
    statusText.textContent = status;
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
  const credentialData = credentials?.[0]?.values?.[0];
  
  if (credentialData) {
    displayVerificationResults(credentialData);
  } else if (session.presentation) {
    // Fallback to presentation if available
    const p = session.presentation as Record<string, unknown>;
    displayVerificationResults(p);
  }
}

// Show success state from DC API result
function showSuccessFromDcApi(result: DcApiResult): void {
  showSection(successSection);

  // Try credentials array first, then fall back to presentation
  const credentials = result.credentials as Array<{ id: string; values: Array<Record<string, unknown>> }> | undefined;
  const credentialData = credentials?.[0]?.values?.[0];
  
  if (credentialData) {
    displayVerificationResults(credentialData, true);
  } else if (result.presentation) {
    const p = result.presentation as Record<string, unknown>;
    displayVerificationResults(p, true);
  }
}

// Display verification results organized by category
function displayVerificationResults(p: Record<string, unknown>, isDcApi = false): void {
  const companyResults = document.getElementById('companyResults');
  const authorizationResults = document.getElementById('authorizationResults');
  const invoiceResults = document.getElementById('invoiceResults');

  // Company details
  const companyFields = [
    { label: 'Company Name', value: p.buyer_org_official_name || p.Handelsname_des_Käufers },
    { label: 'VAT ID', value: p.buyer_tax_vat_id },
    { label: 'Company ID', value: p.buyer_org_unique_id || p.buyer_org_euid },
    { label: 'Address', value: formatCompanyAddress(p) },
    { label: 'Contact Email', value: p.buyer_contact_email },
  ].filter((f) => f.value);

  if (companyResults) {
    companyResults.innerHTML = companyFields.length > 0
      ? companyFields.map(renderResultItem).join('')
      : '<p class="no-data">No company data provided</p>';
  }

  // Authorization details
  const authFields = [
    { label: 'Employee ID', value: p.employee_person_id },
    { label: 'Authorization Role', value: formatRole(p.employee_authorization_role as string) },
    { label: 'Spending Limit', value: formatAmount(p.employee_authorization_limit_amount) },
    { label: 'Valid Until', value: formatDate(p.employee_authorization_validity) },
    { label: 'Acts for Organization', value: p.employee_acts_for_org_unique },
  ].filter((f) => f.value);

  if (authorizationResults) {
    authorizationResults.innerHTML = authFields.length > 0
      ? authFields.map(renderResultItem).join('')
      : '<p class="no-data">No authorization data provided</p>';
  }

  // E-Invoice routing details
  const invoiceFields = [
    { label: 'PEPPOL ID', value: p.buyer_routing_peppol_id },
    { label: 'TraffiqX ID', value: p.buyer_routing_traffiqx_id },
    { label: 'Preferred Channel', value: p.buyer_routing_preferred_channel },
    { label: 'Invoice Email', value: p.buyer_routing_email },
    { label: 'Preferred Format', value: p.Empfängerwunschformat },
    { label: 'DATEV Mailbox', value: p.MyDATEVPostfach },
    { label: 'Advisor Number', value: p.Beraternummer },
    { label: 'Client Number', value: p.Mandantennummer },
  ].filter((f) => f.value);

  if (isDcApi) {
    invoiceFields.push({ label: 'Verification Method', value: 'DC API (Browser Native)' });
  }

  if (invoiceResults) {
    invoiceResults.innerHTML = invoiceFields.length > 0
      ? invoiceFields.map(renderResultItem).join('')
      : '<p class="no-data">No invoice routing configured</p>';
  }
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
