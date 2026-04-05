// Claude API proxy — strips _feature before forwarding to Anthropic
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getUserTeam, logUsage, PLANS } from './lib/firestore.mjs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'API key not configured on server' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  // Check for authenticated path (team subscription)
  const bearerToken = extractBearerToken(request);
  let teamId = null;
  let userId = null;

  if (bearerToken) {
    try {
      const decoded = await verifyIdToken(bearerToken);
      userId = decoded.sub;

      const result = await getUserTeam(userId);
      if (!result) {
        return new Response(
          JSON.stringify({ error: 'No team found. Create or join a team first.' }),
          { status: 403, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      }

      const { team } = result;
      teamId = team.id;

      // Check subscription status
      if (!['active', 'trialing'].includes(team.status)) {
        return new Response(
          JSON.stringify({ error: 'Subscription inactive. Please update your billing.', code: 'SUBSCRIPTION_INACTIVE' }),
          { status: 402, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      }

      // Check usage limits
      const planLimits = PLANS[team.plan] || PLANS.trial;
      if (team.usageThisPeriod >= planLimits.requests) {
        return new Response(
          JSON.stringify({
            error: 'Monthly usage limit reached. Upgrade your plan for more requests.',
            code: 'USAGE_LIMIT_REACHED',
            usage: team.usageThisPeriod,
            limit: planLimits.requests,
          }),
          { status: 429, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      }
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Authentication failed: ' + err.message }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
      );
    }
  } else {
    // No auth token — BYOK fallback (legacy, will be removed in Phase 5)
    // Allow unauthenticated requests during transition period
  }

  try {
    const body = await request.json();

    // Extract and strip _feature before forwarding to Anthropic
    const feature = body._feature || 'unknown';
    delete body._feature;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    // Log usage for authenticated requests (fire-and-forget, don't block response)
    if (teamId && userId) {
      logUsage(teamId, userId, feature).catch(err => console.error('logUsage failed:', err));
    }

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
