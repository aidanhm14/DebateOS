// Temporary diagnostic endpoint - DELETE after debugging
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse();

  const checks = {};

  // Check STRIPE_SECRET_KEY
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  checks.STRIPE_SECRET_KEY = stripeKey
    ? `Set (starts with ${stripeKey.substring(0, 7)}..., length ${stripeKey.length})`
    : 'NOT SET';

  // Check ANTHROPIC_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  checks.ANTHROPIC_API_KEY = anthropicKey
    ? `Set (starts with ${anthropicKey.substring(0, 7)}..., length ${anthropicKey.length})`
    : 'NOT SET';

  // Check GOOGLE_SERVICE_ACCOUNT
  let sa = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!sa) {
    checks.GOOGLE_SERVICE_ACCOUNT = 'NOT SET';
  } else {
    checks.GOOGLE_SERVICE_ACCOUNT_length = sa.length;
    checks.GOOGLE_SERVICE_ACCOUNT_firstChar = sa.charCodeAt(0);
    checks.GOOGLE_SERVICE_ACCOUNT_lastChar = sa.charCodeAt(sa.length - 1);
    checks.GOOGLE_SERVICE_ACCOUNT_first20 = sa.substring(0, 20);

    // Try parsing
    sa = sa.trim();
    if (sa.startsWith('"') && sa.endsWith('"')) {
      sa = sa.slice(1, -1);
      checks.GOOGLE_SERVICE_ACCOUNT_hadOuterQuotes = true;
    }
    if (sa.startsWith("'") && sa.endsWith("'")) {
      sa = sa.slice(1, -1);
      checks.GOOGLE_SERVICE_ACCOUNT_hadOuterSingleQuotes = true;
    }
    sa = sa.replace(/\\\\n/g, '\\n');

    try {
      const parsed = JSON.parse(sa);
      checks.GOOGLE_SERVICE_ACCOUNT_parsed = true;
      checks.GOOGLE_SERVICE_ACCOUNT_hasProjectId = !!parsed.project_id;
      checks.GOOGLE_SERVICE_ACCOUNT_hasClientEmail = !!parsed.client_email;
      checks.GOOGLE_SERVICE_ACCOUNT_hasPrivateKey = !!parsed.private_key;
      checks.GOOGLE_SERVICE_ACCOUNT_projectId = parsed.project_id;
    } catch (e) {
      checks.GOOGLE_SERVICE_ACCOUNT_parsed = false;
      checks.GOOGLE_SERVICE_ACCOUNT_parseError = e.message;
    }
  }

  // Check other env vars
  checks.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ? 'Set' : 'NOT SET';
  checks.STRIPE_PRICE_INDIVIDUAL = process.env.STRIPE_PRICE_INDIVIDUAL || 'NOT SET';
  checks.STRIPE_PRICE_TEAM = process.env.STRIPE_PRICE_TEAM || 'NOT SET';
  checks.SITE_URL = process.env.SITE_URL || 'NOT SET';

  return jsonResponse(checks);
};

export const config = {
  path: '/api/debug-env',
};
