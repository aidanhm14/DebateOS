// ═══════════════════════════════════════════════════
// PERPLEXITY API PROXY — with rate limiting & abuse protection
// ═══════════════════════════════════════════════════

const ipRequests = new Map();
const RATE_LIMIT_PER_IP = 30;
const RATE_LIMIT_WINDOW_MS = 3600000;
const ALLOWED_ORIGINS = [
  'https://debateos1.netlify.app',
  'http://localhost',
  'http://127.0.0.1',
];

function getClientIP(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

function isOriginAllowed(request) {
  const origin = request.headers.get('origin') || '';
  const referer = request.headers.get('referer') || '';
  if (!origin && !referer) return false;
  return ALLOWED_ORIGINS.some(o => origin.startsWith(o) || referer.startsWith(o));
}

function checkRateLimit(ip) {
  const now = Date.now();
  const ipData = ipRequests.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  if (now > ipData.resetTime) {
    ipData.count = 0;
    ipData.resetTime = now + RATE_LIMIT_WINDOW_MS;
  }
  if (ipData.count >= RATE_LIMIT_PER_IP) {
    return { allowed: false };
  }
  ipData.count++;
  ipRequests.set(ip, ipData);
  return { allowed: true };
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async (request, context) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  if (!isOriginAllowed(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized origin' }), {
      status: 403, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const ip = getClientIP(request);
  if (!checkRateLimit(ip).allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again shortly.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const apiKey = Netlify.env.get('PERPLEXITY_API_KEY');
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Perplexity API key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  try {
    const { query } = await request.json();

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a research assistant for competitive parliamentary debate. Return concise, factual summaries of current events that would make good debate topics. Focus on: policy controversies, ethical dilemmas, international disputes, tech regulation, social justice issues, economic policy debates. For each event, include the key tension or dilemma that makes it debatable. No markdown formatting.'
          },
          { role: 'user', content: query }
        ],
        max_tokens: 2000,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: data.error?.message || 'Perplexity API error' }),
        { status: response.status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
      );
    }

    const text = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];

    return new Response(
      JSON.stringify({ text, citations }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Proxy error: ' + err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }
};

export const config = {
  path: '/api/perplexity',
};
