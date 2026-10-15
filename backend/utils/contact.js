// =====================================================================
//  Contact validation — the SAME rules run in the browser (frontend/src/utils/contact.js)
//
//  Email : Gmail only  (name@gmail.com)
//  Phone : "+" + country code (1-3 digits) + EXACTLY 10 digits   e.g. +919876543210
//
//  Rules can only prove a number LOOKS real (no obvious fakes like 9999999999).
// =====================================================================

// ---------- Gmail ----------
// Gmail rules: 6-30 chars, letters/digits/dots, no leading/trailing/double dots (and we reject +tags so one inbox = one account)
export function normalizeGmail(input) {
  const email = String(input || '').trim().toLowerCase();
  const m = /^([a-z0-9.]+)@gmail\.com$/.exec(email);
  if (!m) return { ok: false, error: 'Use your Gmail address (name@gmail.com)' };
  const local = m[1];
  if (local.length < 6 || local.length > 30) return { ok: false, error: 'A Gmail address has 6 to 30 characters before @gmail.com' };
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return { ok: false, error: 'Enter a valid Gmail address' };
  return { ok: true, email };
}

// Gmail ignores dots, so j.ohn@gmail.com and john@gmail.com are the SAME inbox.
export const gmailCanonical = (email) => String(email).toLowerCase().replace(/@gmail\.com$/, '').replace(/\./g, '');

// ---------- Phone ----------
// Real ITU country calling codes we accept. The code length is derived from "total digits - 10", so
// validating against this list also stops "+91 987654321" (9 digits) being read as country code "9".
export const COUNTRIES = [
  ['91', 'India'], ['1', 'USA / Canada'], ['44', 'United Kingdom'], ['971', 'UAE'], ['61', 'Australia'], ['65', 'Singapore'],
  ['966', 'Saudi Arabia'], ['974', 'Qatar'], ['968', 'Oman'], ['965', 'Kuwait'], ['973', 'Bahrain'], ['92', 'Pakistan'],
  ['880', 'Bangladesh'], ['94', 'Sri Lanka'], ['977', 'Nepal'], ['60', 'Malaysia'], ['62', 'Indonesia'], ['49', 'Germany'],
  ['33', 'France'], ['39', 'Italy'], ['34', 'Spain'], ['31', 'Netherlands'], ['81', 'Japan'], ['86', 'China'], ['82', 'South Korea'],
  ['27', 'South Africa'], ['234', 'Nigeria'], ['254', 'Kenya'], ['64', 'New Zealand'], ['353', 'Ireland'], ['41', 'Switzerland'],
  ['46', 'Sweden'], ['47', 'Norway'], ['45', 'Denmark'], ['55', 'Brazil'], ['52', 'Mexico'], ['7', 'Russia'], ['90', 'Turkey'],
];
const VALID_CC = new Set(COUNTRIES.map(([c]) => c));

const FAKE_NUMBERS = new Set(['1234567890', '0123456789', '9876543210', '0987654321', '1231231234', '1212121212']);

function looksFake(national) {
  if (FAKE_NUMBERS.has(national)) return true;
  if (/(\d)\1{6,}/.test(national)) return true;          // 7+ identical digits in a row (9999999999, 9000000000…)
  if (/^(\d)(\d)(?:\1\2){4}$/.test(national)) return true; // 1212121212 style
  return false;
}

/**
 * Accepts "+919876543210", "+91 98765 43210", "+91-9876543210" or (as a convenience) a bare 10-digit number (assumed +91).
 * Returns { ok, e164, cc, national } or { ok:false, error }.
 */
export function normalizePhone(input, { defaultCc = '91' } = {}) {
  const raw = String(input || '').trim().replace(/[\s\-().]/g, '');
  let digits;
  if (raw.startsWith('+')) digits = raw.slice(1);
  else if (/^\d{10}$/.test(raw)) digits = defaultCc + raw;
  else return { ok: false, error: 'Enter the country code (+91) followed by a 10-digit mobile number' };

  if (!/^\d+$/.test(digits)) return { ok: false, error: 'Phone number can only contain digits' };
  const ccLen = digits.length - 10;                       // national number is always exactly 10 digits
  if (ccLen < 1 || ccLen > 3) return { ok: false, error: 'Use +country code and exactly 10 digits (e.g. +91 98765 43210)' };
  const cc = digits.slice(0, ccLen);
  const national = digits.slice(ccLen);
  if (!VALID_CC.has(cc)) return { ok: false, error: 'Unsupported country code — use +91 followed by exactly 10 digits' };

  if (cc === '91' && !/^[6-9]\d{9}$/.test(national)) return { ok: false, error: 'Indian mobile numbers start with 6, 7, 8 or 9' };
  if (cc === '1' && !/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return { ok: false, error: 'Enter a valid US/Canada number' };
  if (national.startsWith('0')) return { ok: false, error: 'Enter a valid mobile number' };
  if (looksFake(national)) return { ok: false, error: 'Enter a real mobile number' };

  return { ok: true, e164: `+${cc}${national}`, cc, national };
}

export const maskEmailAddr = (e) => {
  const [local = '', domain = ''] = String(e || '').split('@');
  return `${local.slice(0, Math.min(2, Math.max(1, local.length - 1)))}***@${domain}`;
};
export const maskPhoneNumber = (p) => (p ? `${String(p).slice(0, String(p).length - 10)} ••••••${String(p).slice(-4)}` : '');
