// ═══════════════════════════════════════════════════
// CLAUDE API PROXY — with rate limiting & abuse protection
// ═══════════════════════════════════════════════════

// In-memory rate limiting (resets on cold start, which is fine for serverless)
const ipRequests = new Map(); // IP -> { count, resetTime }
const globalCounter = { count: 0, resetTime: 0 };

// CONFIGURATION — tune these to control spending
const RATE_LIMIT_PER_IP = 20;        // max requests per IP per hour
const RATE_LIMIT_WINDOW_MS = 3600000; // 1 hour
const DAILY_GLOBAL_CAP = 200;         // max total requests per day across all users (~$30-60/day worst case)
const DAILY_WINDOW_MS = 86400000;     // 24 hours
const ALLOWED_ORIGINS = [
  'https://debateos1.netlify.app',
  'http://localhost',
  'http://127.0.0.1',
];
const MAX_ALLOWED_TOKENS = 32000;     // cap max_tokens to prevent abuse
const ALLOWED_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001',
];

function getClientIP(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

function isOriginAllowed(request) {
  const origin = request.headers.get('origin') || '';
  const referer = request.headers.get('referer') || '';
  // Allow if origin matches, or if referer starts with an allowed origin, or if no origin (server-side/curl — block this)
  if (!origin && !referer) return false; // Block requests with no origin (scripts, curl)
  return ALLOWED_ORIGINS.some(o => origin.startsWith(o) || referer.startsWith(o));
}

function checkRateLimit(ip) {
  const now = Date.now();

  // Per-IP rate limit
  const ipData = ipRequests.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  if (now > ipData.resetTime) {
    ipData.count = 0;
    ipData.resetTime = now + RATE_LIMIT_WINDOW_MS;
  }
  if (ipData.count >= RATE_LIMIT_PER_IP) {
    return { allowed: false, reason: 'Rate limit exceeded. Try again in a bit.' };
  }
  ipData.count++;
  ipRequests.set(ip, ipData);

  // Global daily cap
  if (now > globalCounter.resetTime) {
    globalCounter.count = 0;
    globalCounter.resetTime = now + DAILY_WINDOW_MS;
  }
  if (globalCounter.count >= DAILY_GLOBAL_CAP) {
    return { allowed: false, reason: 'Daily usage limit reached. The free tier resets tomorrow. Thanks for using DebateOS!' };
  }
  globalCounter.count++;

  return { allowed: true };
}

function sanitizeBody(body) {
  // Enforce model whitelist
  if (body.model && !ALLOWED_MODELS.includes(body.model)) {
    body.model = ALLOWED_MODELS[0]; // Default to Sonnet
  }
  // Cap max_tokens
  if (body.max_tokens && body.max_tokens > MAX_ALLOWED_TOKENS) {
    body.max_tokens = MAX_ALLOWED_TOKENS;
  }
  // Cap thinking budget if present
  if (body.thinking?.budget_tokens && body.thinking.budget_tokens > 10000) {
    body.thinking.budget_tokens = 10000;
  }
  return body;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async (request, context) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // SECURITY: Check origin
  if (!isOriginAllowed(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized origin' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // SECURITY: Rate limiting
  const ip = getClientIP(request);
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return new Response(JSON.stringify({ error: rateCheck.reason }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const apiKey = Netlify.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'API key not configured on server' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  try {
    let body = await request.json();
    body = sanitizeBody(body);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    // Stream the response through to the client
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Proxy error: ' + err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }
};

export const config = {
  path: '/api/claude',
};
