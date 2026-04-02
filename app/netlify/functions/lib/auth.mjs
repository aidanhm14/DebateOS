// Firebase ID token verification without firebase-admin SDK.
// Verifies JWT signature against Google's public keys.

let cachedKeys = null;
let cachedKeysExpiry = 0;

const FIREBASE_PROJECT_ID = 'debateos-78ac5';
const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

async function getPublicKeys() {
  if (cachedKeys && Date.now() < cachedKeysExpiry) return cachedKeys;

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) throw new Error('Failed to fetch Google public keys');

  // Cache based on Cache-Control max-age
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) * 1000 : 3600000;
  cachedKeysExpiry = Date.now() + maxAge;

  cachedKeys = await res.json();
  return cachedKeys;
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

function base64urlToArrayBuffer(str) {
  const binary = base64urlDecode(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Verify a Firebase ID token and return the decoded payload.
 * Throws on invalid/expired tokens.
 */
export async function verifyIdToken(idToken) {
  if (!idToken) throw new Error('No ID token provided');

  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');

  const header = JSON.parse(base64urlDecode(parts[0]));
  const payload = JSON.parse(base64urlDecode(parts[1]));

  // Check claims
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error('Token expired');
  if (payload.iat > now + 300) throw new Error('Token issued in the future');
  if (payload.aud !== FIREBASE_PROJECT_ID) throw new Error('Invalid audience');
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`)
    throw new Error('Invalid issuer');
  if (!payload.sub || typeof payload.sub !== 'string')
    throw new Error('Invalid subject');

  // Verify signature
  const keys = await getPublicKeys();
  const certPem = keys[header.kid];
  if (!certPem) throw new Error('Unknown signing key');

  const keyData = pemToArrayBuffer(certPem);
  const cryptoKey = await crypto.subtle.importKey(
    'spki',
    extractPublicKeyFromCert(keyData),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signatureBuffer = base64urlToArrayBuffer(parts[2]);
  const dataBuffer = new TextEncoder().encode(parts[0] + '.' + parts[1]);

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBuffer,
    dataBuffer
  );

  if (!valid) throw new Error('Invalid token signature');

  return payload;
}

/**
 * Extract the SubjectPublicKeyInfo from a DER-encoded X.509 certificate.
 * This is a minimal ASN.1 parser that finds the SPKI structure.
 */
function extractPublicKeyFromCert(certDer) {
  const bytes = new Uint8Array(certDer);
  // The SPKI is the 7th element we need to find in the TBSCertificate.
  // We use a simplified approach: search for the RSA OID and back up to the SEQUENCE.
  // RSA OID: 1.2.840.113549.1.1.1 = 06 09 2a 86 48 86 f7 0d 01 01 01
  const rsaOid = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];

  let oidIndex = -1;
  for (let i = 0; i < bytes.length - rsaOid.length; i++) {
    let match = true;
    for (let j = 0; j < rsaOid.length; j++) {
      if (bytes[i + j] !== rsaOid[j]) { match = false; break; }
    }
    if (match) { oidIndex = i; break; }
  }

  if (oidIndex === -1) throw new Error('RSA OID not found in certificate');

  // Back up to the SEQUENCE that contains the AlgorithmIdentifier
  // The SPKI SEQUENCE starts before the AlgorithmIdentifier SEQUENCE
  let seqStart = oidIndex - 2; // AlgorithmIdentifier SEQUENCE tag + length
  // Back up one more SEQUENCE for the SubjectPublicKeyInfo
  seqStart = seqStart - 2;
  // Find the actual SEQUENCE start by scanning backwards
  for (let i = oidIndex - 1; i >= 0; i--) {
    if (bytes[i] === 0x30) {
      // Check if this SEQUENCE encompasses the OID and extends beyond it
      const len = parseAsn1Length(bytes, i + 1);
      if (len.offset + len.length + i + 1 > oidIndex + rsaOid.length + 20) {
        seqStart = i;
        break;
      }
    }
  }

  const lenInfo = parseAsn1Length(bytes, seqStart + 1);
  const totalLen = 1 + lenInfo.bytesUsed + lenInfo.length;
  return bytes.slice(seqStart, seqStart + totalLen).buffer;
}

function parseAsn1Length(bytes, offset) {
  const first = bytes[offset];
  if (first < 0x80) {
    return { length: first, bytesUsed: 1, offset: offset + 1 };
  }
  const numBytes = first & 0x7f;
  let length = 0;
  for (let i = 0; i < numBytes; i++) {
    length = (length << 8) | bytes[offset + 1 + i];
  }
  return { length, bytesUsed: 1 + numBytes, offset: offset + 1 + numBytes };
}

/**
 * Extract the Bearer token from an Authorization header.
 */
export function extractBearerToken(request) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}
