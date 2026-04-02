import Stripe from 'stripe';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, getUserTeam, PLANS, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse();
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405);

  // Authenticate
  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    return errorResponse('Invalid token: ' + err.message, 401);
  }

  const uid = decoded.sub;
  const email = decoded.email || '';
  const name = decoded.name || '';

  // Check user isn't already on a team
  const existing = await getUserTeam(uid);
  if (existing) return errorResponse('You already belong to a team', 409);

  const body = await request.json();
  const teamName = (body.name || '').trim();
  if (!teamName) return errorResponse('Team name is required');

  // Create Stripe customer
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const customer = await stripe.customers.create({
    email,
    name: teamName,
    metadata: { firebaseUid: uid },
  });

  const db = getDb();
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

  // Create team document
  const teamRef = db.collection('teams').doc();
  const teamData = {
    name: teamName,
    ownerId: uid,
    stripeCustomerId: customer.id,
    stripeSubscriptionId: null,
    plan: 'trial',
    status: 'trialing',
    trialEndsAt: trialEnd,
    currentPeriodStart: now,
    currentPeriodEnd: trialEnd,
    usageThisPeriod: 0,
    usageLimit: PLANS.trial.requests,
    memberCount: 1,
    maxMembers: PLANS.trial.members,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await teamRef.set(teamData);

  // Create owner membership
  await db.collection('team_members').add({
    teamId: teamRef.id,
    userId: uid,
    email,
    displayName: name,
    role: 'owner',
    joinedAt: FieldValue.serverTimestamp(),
  });

  // Create/update user profile
  await db.collection('user_profiles').doc(uid).set({
    teamId: teamRef.id,
    email,
    displayName: name,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return jsonResponse({
    id: teamRef.id,
    ...teamData,
    trialEndsAt: trialEnd.toISOString(),
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: trialEnd.toISOString(),
  }, 201);
};

export const config = {
  path: '/api/teams',
};
