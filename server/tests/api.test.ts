import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { Server } from 'node:http';
import { createApp } from '../src/app';
import { prisma } from '../src/db';

// End-to-end API tests. Spins the real app up in-process against the dev SQLite
// DB and drives the full favor lifecycle plus the security controls. Uses unique
// emails per run so it never collides with seed/other runs.

let server: Server;
let baseUrl = '';
const uniq = crypto.randomBytes(4).toString('hex');

before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  server.close();
  await prisma.$disconnect();
});

type Res = { status: number; json: any };
async function api(path: string, opts: { method?: string; token?: string; body?: unknown } = {}): Promise<Res> {
  const res = await fetch(baseUrl + path, {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json };
}

async function makeUser(role: 'member' | 'pal') {
  const email = `test_${role}_${uniq}_${crypto.randomBytes(3).toString('hex')}@example.com`;
  const phone = `+1555${crypto.randomInt(1000000, 9999999)}`;
  const signup = await api('/api/auth/signup', {
    method: 'POST',
    body: { firstName: 'Test', lastName: role, email, phone, password: 'Password123', role },
  });
  assert.equal(signup.status, 201, 'signup should succeed');
  assert.ok(signup.json.devCode, 'dev OTP code returned in dev mode');

  const verify = await api('/api/auth/verify-otp', {
    method: 'POST',
    body: { destination: email, code: signup.json.devCode },
  });
  assert.equal(verify.status, 200, 'otp verify should succeed');
  assert.ok(verify.json.accessToken && verify.json.refreshToken, 'session returned');
  return { email, token: verify.json.accessToken as string, refreshToken: verify.json.refreshToken as string, id: verify.json.user.id as string };
}

test('health check', async () => {
  const res = await api('/health');
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
});

test('rejects unauthenticated access', async () => {
  const res = await api('/api/profile/me');
  assert.equal(res.status, 401);
});

test('signup → never leaks password hash', async () => {
  const member = await makeUser('member');
  const me = await api('/api/profile/me', { token: member.token });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.email, member.email);
  assert.ok(!('passwordHash' in me.json.user), 'passwordHash must not be serialized');
});

test('full favor lifecycle: request → accept → advance → finish → rate', async () => {
  const member = await makeUser('member');
  const pal = await makeUser('pal');

  // Member creates a favor; server computes the fees.
  const create = await api('/api/favors', {
    method: 'POST',
    token: member.token,
    body: { tier: 'small', description: 'Walk my dog', location: { lat: 30.26, lng: -97.74, address: '1 Main St' } },
  });
  assert.equal(create.status, 201);
  const favorId = create.json.favor.id;
  assert.equal(create.json.favor.price, 50, 'small tier is $50 server-side');
  assert.equal(create.json.favor.total, 51.75, 'fees computed server-side');

  // Pal sees it in the incoming feed.
  const incoming = await api('/api/favors/incoming', { token: pal.token });
  assert.equal(incoming.status, 200);
  assert.ok(incoming.json.favors.some((f: any) => f.id === favorId), 'favor appears for pal');

  // Pal accepts.
  const accept = await api(`/api/favors/${favorId}/accept`, { method: 'POST', token: pal.token });
  assert.equal(accept.status, 200);
  assert.equal(accept.json.favor.status, 'matched');

  // Double-accept is rejected (race safety).
  const accept2 = await api(`/api/favors/${favorId}/accept`, { method: 'POST', token: pal.token });
  assert.equal(accept2.status, 409, 'already-taken favor cannot be re-accepted');

  // Pal advances the status forward.
  for (const status of ['enroute', 'arrived', 'in_progress']) {
    const adv = await api(`/api/favors/${favorId}/advance`, { method: 'POST', token: pal.token, body: { status } });
    assert.equal(adv.status, 200, `advance to ${status}`);
    assert.equal(adv.json.favor.status, status);
  }

  // Pal finishes; payout = 50 - 20% = 40.
  const finish = await api(`/api/favors/${favorId}/finish`, { method: 'POST', token: pal.token });
  assert.equal(finish.status, 200);
  assert.equal(finish.json.payout, 40, 'payout is base minus 20% commission');

  // Member rates with a tip.
  const rate = await api(`/api/favors/${favorId}/rate`, { method: 'POST', token: member.token, body: { rating: 5, feedback: 'Great', tip: 10 } });
  assert.equal(rate.status, 200);

  // Ledgers reflect the transaction.
  const txns = await api('/api/payments/transactions', { token: member.token });
  assert.ok(txns.json.transactions.length >= 1, 'member has a payment');
  const earnings = await api('/api/payments/earnings', { token: pal.token });
  assert.ok(earnings.json.earnings.length >= 1, 'pal has an earning');
});

test('authorization: non-participant cannot read a favor', async () => {
  const member = await makeUser('member');
  const stranger = await makeUser('member');
  const create = await api('/api/favors', {
    method: 'POST',
    token: member.token,
    body: { tier: 'tiny', description: 'Secret errand', location: { lat: 30, lng: -97, address: 'X' } },
  });
  const favorId = create.json.favor.id;
  const peek = await api(`/api/favors/${favorId}`, { token: stranger.token });
  assert.equal(peek.status, 403, 'stranger is forbidden from another user’s favor');
});

test('role gate: a member cannot use a pal-only endpoint', async () => {
  const member = await makeUser('member');
  const res = await api('/api/favors/incoming', { token: member.token });
  assert.equal(res.status, 403);
});

test('input validation: malformed id is rejected', async () => {
  const member = await makeUser('member');
  const res = await api('/api/favors/not-a-uuid', { token: member.token });
  assert.equal(res.status, 400, 'non-uuid id fails validation');
});

test('login with wrong password is generic 401', async () => {
  const member = await makeUser('member');
  const res = await api('/api/auth/login', { method: 'POST', body: { email: member.email, password: 'WrongPassword1' } });
  assert.equal(res.status, 401);
  assert.match(res.json.error.message, /invalid email or password/i);
});

test('refresh token rotates', async () => {
  const member = await makeUser('member');
  const res = await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: member.refreshToken } });
  assert.equal(res.status, 200);
  assert.ok(res.json.accessToken && res.json.refreshToken);
  // Old token is now revoked (single-use rotation).
  const reuse = await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: member.refreshToken } });
  assert.equal(reuse.status, 401, 'rotated refresh token cannot be reused');
});

test('block prevents messaging', async () => {
  const a = await makeUser('member');
  const b = await makeUser('pal');
  await api('/api/moderation/block', { method: 'POST', token: a.token, body: { userId: b.id } });
  const thread = await api('/api/messages/threads', { method: 'POST', token: a.token, body: { withUserId: b.id } });
  assert.equal(thread.status, 403, 'cannot open a thread with a blocked user');
});

// Drive a favor to a target status and return the ids. Helper for the
// security-regression tests below.
async function activeFavor(opts: { advanceTo?: 'matched' | 'enroute' | 'arrived' | 'in_progress' } = {}) {
  const member = await makeUser('member');
  const pal = await makeUser('pal');
  const create = await api('/api/favors', {
    method: 'POST',
    token: member.token,
    body: { tier: 'small', description: 'Pick up a package', location: { lat: 30.2672, lng: -97.7431, address: '500 Congress Ave, Austin, TX' } },
  });
  const favorId = create.json.favor.id as string;
  const target = opts.advanceTo ?? 'matched';
  await api(`/api/favors/${favorId}/accept`, { method: 'POST', token: pal.token });
  for (const s of ['enroute', 'arrived', 'in_progress'] as const) {
    if (['enroute', 'arrived', 'in_progress'].indexOf(target) >= ['enroute', 'arrived', 'in_progress'].indexOf(s) && target !== 'matched') {
      await api(`/api/favors/${favorId}/advance`, { method: 'POST', token: pal.token, body: { status: s } });
    }
  }
  return { member, pal, favorId };
}

test('SECURITY: concurrent double-finish pays out exactly once', async () => {
  const { member, pal, favorId } = await activeFavor({ advanceTo: 'in_progress' });
  // Fire two finishes at once — only one may win.
  const [a, b] = await Promise.all([
    api(`/api/favors/${favorId}/finish`, { method: 'POST', token: pal.token }),
    api(`/api/favors/${favorId}/finish`, { method: 'POST', token: pal.token }),
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 409], 'one finish succeeds, the other is rejected');
  // Exactly one earning + one payment exist for this favor.
  const earnings = await api('/api/payments/earnings', { token: pal.token });
  assert.equal(earnings.json.earnings.filter((t: any) => t.favorId === favorId).length, 1, 'no duplicate payout');
  const txns = await api('/api/payments/transactions', { token: member.token });
  assert.equal(txns.json.transactions.filter((t: any) => t.favorId === favorId).length, 1, 'no duplicate charge');
});

test('SECURITY: re-rating a favor is rejected', async () => {
  const { member, pal, favorId } = await activeFavor({ advanceTo: 'in_progress' });
  await api(`/api/favors/${favorId}/finish`, { method: 'POST', token: pal.token });
  const r1 = await api(`/api/favors/${favorId}/rate`, { method: 'POST', token: member.token, body: { rating: 5, tip: 10 } });
  assert.equal(r1.status, 200);
  const r2 = await api(`/api/favors/${favorId}/rate`, { method: 'POST', token: member.token, body: { rating: 1, tip: 10 } });
  assert.equal(r2.status, 409, 'second rating rejected');
});

test('SECURITY: late cancellation persists the fee to the ledger', async () => {
  const { member, favorId } = await activeFavor({ advanceTo: 'in_progress' });
  const cancel = await api(`/api/favors/${favorId}/cancel`, { method: 'POST', token: member.token });
  assert.equal(cancel.status, 200);
  assert.ok(cancel.json.cancellation.fee > 0, 'in-progress cancel has a fee');
  const txns = await api('/api/payments/transactions', { token: member.token });
  const feeTxn = txns.json.transactions.find((t: any) => t.favorId === favorId && t.kind === 'payment');
  assert.ok(feeTxn, 'cancellation fee is recorded as a member charge');
  assert.equal(feeTxn.amount, cancel.json.cancellation.fee, 'recorded fee matches policy');
});

test('SECURITY: open favor feed exposes only coarse location', async () => {
  const member = await makeUser('member');
  const pal = await makeUser('pal');
  await api('/api/favors', {
    method: 'POST',
    token: member.token,
    body: { tier: 'tiny', description: 'Water my plants', location: { lat: 30.26721, lng: -97.74312, address: '123 Secret Home Ln, Austin, TX' } },
  });
  const incoming = await api('/api/favors/incoming', { token: pal.token });
  const f = incoming.json.favors.find((x: any) => x.description === 'Water my plants');
  assert.ok(f, 'favor visible to pal');
  assert.ok(!f.location.address.includes('Secret Home Ln'), 'street address is hidden pre-match');
  assert.equal(f.location.lat, 30.27, 'coordinates are coarsened');
});

test('assigned pal sees the member name on the active favor', async () => {
  const { pal } = await activeFavor({ advanceTo: 'matched' });
  const active = await api('/api/favors/active', { token: pal.token });
  assert.equal(active.status, 200);
  assert.ok(active.json.favor?.memberName, 'memberName present for the assigned pal');
});

test('cashout pays the available balance exactly once', async () => {
  const { pal, favorId } = await activeFavor({ advanceTo: 'in_progress' });
  await api(`/api/favors/${favorId}/finish`, { method: 'POST', token: pal.token });
  const cash1 = await api('/api/payments/cashout', { method: 'POST', token: pal.token });
  assert.equal(cash1.status, 200);
  assert.ok(cash1.json.amount > 0, 'positive payout');
  const cash2 = await api('/api/payments/cashout', { method: 'POST', token: pal.token });
  assert.equal(cash2.status, 400, 'no funds left after cashout');
});

test('pal can rate the member once', async () => {
  const { pal, favorId } = await activeFavor({ advanceTo: 'in_progress' });
  await api(`/api/favors/${favorId}/finish`, { method: 'POST', token: pal.token });
  const r1 = await api(`/api/favors/${favorId}/rate-member`, { method: 'POST', token: pal.token, body: { rating: 5, feedback: 'Great member' } });
  assert.equal(r1.status, 200);
  const r2 = await api(`/api/favors/${favorId}/rate-member`, { method: 'POST', token: pal.token, body: { rating: 1 } });
  assert.equal(r2.status, 409, 'cannot rate the member twice');
});

test('pal reviews reflect member ratings', async () => {
  const { member, pal, favorId } = await activeFavor({ advanceTo: 'in_progress' });
  await api(`/api/favors/${favorId}/finish`, { method: 'POST', token: pal.token });
  await api(`/api/favors/${favorId}/rate`, { method: 'POST', token: member.token, body: { rating: 5, feedback: 'Fantastic pal' } });
  const reviews = await api(`/api/profile/pals/${pal.id}/reviews`, { token: member.token });
  assert.equal(reviews.status, 200);
  assert.ok(reviews.json.reviews.some((r: any) => r.comment === 'Fantastic pal' && r.rating === 5), 'review present');
});

test('cancellation compensation is cashable by the committed pal', async () => {
  const { member, pal, favorId } = await activeFavor({ advanceTo: 'in_progress' });
  const cancel = await api(`/api/favors/${favorId}/cancel`, { method: 'POST', token: member.token });
  assert.equal(cancel.status, 200);
  assert.ok(cancel.json.cancellation.fee > 0, 'in-progress cancel has a fee');
  const cash = await api('/api/payments/cashout', { method: 'POST', token: pal.token });
  assert.equal(cash.status, 200);
  assert.ok(cash.json.amount >= cancel.json.cancellation.fee, 'pal can cash out the compensation');
});

test('SECURITY: a tip charges the member and credits the pal equally (no unfunded earning)', async () => {
  const { member, pal, favorId } = await activeFavor({ advanceTo: 'in_progress' });
  await api(`/api/favors/${favorId}/finish`, { method: 'POST', token: pal.token });
  await api(`/api/favors/${favorId}/rate`, { method: 'POST', token: member.token, body: { rating: 5, tip: 10 } });
  const txns = await api('/api/payments/transactions', { token: member.token });
  const earns = await api('/api/payments/earnings', { token: pal.token });
  const memberTip = txns.json.transactions.find((t: any) => t.favorId === favorId && t.amount === 10 && t.kind === 'payment');
  const palTip = earns.json.earnings.find((t: any) => t.favorId === favorId && t.amount === 10 && t.kind === 'earning');
  assert.ok(memberTip, 'member is charged for the tip');
  assert.ok(palTip, 'pal is credited the tip — funded by the member charge');
});

test('account deletion is permanent', async () => {
  const member = await makeUser('member');
  const del = await api('/api/auth/account', { method: 'DELETE', token: member.token });
  assert.equal(del.status, 200);
  // Token no longer resolves to a user.
  const me = await api('/api/profile/me', { token: member.token });
  assert.equal(me.status, 401, 'deleted account’s token is rejected');
});
