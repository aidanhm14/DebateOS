import Stripe from 'stripe';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getUserTeam } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse();
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    return errorResponse('Invalid token: ' + err.message, 401);
  }

  const result = await getUserTeam(decoded.sub);
  if (!result) return errorResponse('No team found. Create a team first.', 404);

  const { team, membership } = result;
  if (membership.role !== 'owner') {
    return errorResponse('Only the team owner can manage billing', 403);
  }

  const body = await request.json();
  const planId = body.plan; // "team" or "school"

  const priceMap = {
    team: Netlify.env.get('STRIPE_PRICE_TEAM'),
    school: Netlify.env.get('STRIPE_PRICE_SCHOOL'),
  };

  const priceId = priceMap[planId];
  if (!priceId) return errorResponse('Invalid plan. Choose "team" or "school".', 400);

  const stripe = new Stripe(Netlify.env.get('STRIPE_SECRET_KEY'));
  const siteUrl = Netlify.env.get('SITE_URL') || 'https://debateos1.netlify.app';

  const session = await stripe.checkout.sessions.create({
    customer: team.stripeCustomerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}?billing=success`,
    cancel_url: `${siteUrl}?billing=canceled`,
    subscription_data: {
      metadata: { teamId: team.id },
    },
    ...(team.plan === 'trial' ? { subscription_data: {
      trial_period_days: 14,
      metadata: { teamId: team.id },
    }} : {}),
  });

  return jsonResponse({ url: session.url });
};

export const config = {
  path: '/api/billing/checkout',
};
