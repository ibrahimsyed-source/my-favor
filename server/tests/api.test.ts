import './_setup'; // must be first: sets NODE_ENV=test before app/config loads
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { Server } from 'node:http';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { computeFees } from '../src/lib/money';

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

async function makeUser(role: 'member' | 'pal', opts: { vetted?: boolean } = {}) {
  const email = `test_${role}_${uniq}_${crypto.randomBytes(3).toString('hex')}@example.com`;
  const phone = `+1555${crypto.randomInt(1000000, 9999999)}`;
  const signup = await api('/api/auth/signup', {
    method: 'POST',
    body: { firstName: 'Test', lastName: role, email, phone, password: 'Password123', role, ageAffirmed: true, acceptedTerms: true },
  });
  assert.equal(signup.status, 201, 'signup should succeed');
  assert.ok(signup.json.devCode, 'dev OTP code returned in dev mode');

  const verify = await api('/api/auth/verify-otp', {
    method: 'POST',
    body: { destination: email, code: signup.json.devCode },
  });
  assert.equal(verify.status, 200, 'otp verify should succeed');
  assert.ok(verify.json.accessToken && verify.json.refreshToken, 'session returned');
  const token = verify.json.accessToken as string;

  // Pals must clear vetting before they can accept favors — auto-approve the
  // mocked application so lifecycle tests can proceed. Pass { vetted: false }
  // to get a pal-role account that has NOT cleared vetting (gate tests).
  if (role === 'pal' && opts.vetted !== false) {
    const vet = await api('/api/profile/verify-pal', {
      method: 'POST',
      token,
      body: { legalFirstName: 'Test', legalLastName: 'Pal', dateOfBirth: '1990-01-01', consent: true },
    });
    assert.equal(vet.status, 200, 'pal vetting should succeed');
  }
  return { email, token, refreshToken: verify.json.refreshToken as string, id: verify.json.user.id as string };
}

// Approval flow: a pal's /accept is a REQUEST (list-price offer, no match); the
// member approves the person via the atomic offer-accept. Returns the approval
// response (matched favor).
async function requestAndApprove(favorId: string, memberToken: string, palToken: string) {
  const req = await api(`/api/favors/${favorId}/accept`, { method: 'POST', token: palToken });
  assert.equal(req.status, 200, 'pal request should land');
  assert.ok(req.json.offer && req.json.pending, 'accept returns a pending offer, not a match');
  const approve = await api(`/api/favors/${favorId}/offers/${req.json.offer.id}/accept`, {
    method: 'POST', token: memberToken, body: { price: req.json.offer.price },
  });
  assert.equal(approve.status, 200, 'member approval matches the favor');
  assert.equal(approve.json.favor.status, 'matched');
  return approve.json;
}

// Finish-and-release flow: the pal marks the work done (parks the favor in
// 'pending_release' — no money moves yet), then the MEMBER releases the
// payment, which completes the favor and settles both ledgers. Returns the
// release response ({ favor, payout, ledgerStatus }).
async function finishAndRelease(favorId: string, memberToken: string, palToken: string) {
  const finish = await api(`/api/favors/${favorId}/finish`, { method: 'POST', token: palToken });
  assert.equal(finish.status, 200, 'pal finish should land');
  assert.equal(finish.json.favor.status, 'pending_release', 'finish parks the favor awaiting release');
  assert.equal(finish.json.awaitingRelease, true, 'finish flags the pending release');
  const release = await api(`/api/favors/${favorId}/release`, { method: 'POST', token: memberToken });
  assert.equal(release.status, 200, 'member release should land');
  assert.equal(release.json.favor.status, 'completed', 'release completes the favor');
  return release.json;
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

test('public legal pages serve HTML (store-required URLs)', async () => {
  for (const [path, marker] of [
    ['/privacy', 'Privacy Policy'],
    ['/terms', 'Terms and Conditions'],
    ['/support', 'support@myfavorr.com'],
  ] as const) {
    const res = await fetch(baseUrl + path);
    assert.equal(res.status, 200, `${path} should be public`);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/, `${path} should be HTML`);
    const body = await res.text();
    assert.ok(body.includes(marker), `${path} should contain "${marker}"`);
  }
});

test('signup → never leaks password hash', async () => {
  const member = await makeUser('member');
  const me = await api('/api/profile/me', { token: member.token });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.email, member.email);
  assert.ok(!('passwordHash' in me.json.user), 'passwordHash must not be serialized');
});

test('full favor lifecycle: request → accept → advance → finish → release → rate', async () => {
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

  // Pal requests the favor; the member approves them — only then is it matched.
  await requestAndApprove(favorId, member.token, pal.token);

  // Requesting a matched favor is rejected (race safety).
  const accept2 = await api(`/api/favors/${favorId}/accept`, { method: 'POST', token: pal.token });
  assert.equal(accept2.status, 409, 'already-taken favor cannot be re-requested');

  // Pal advances the status forward.
  for (const status of ['enroute', 'arrived', 'in_progress']) {
    const adv = await api(`/api/favors/${favorId}/advance`, { method: 'POST', token: pal.token, body: { status } });
    assert.equal(adv.status, 200, `advance to ${status}`);
    assert.equal(adv.json.favor.status, status);
  }

  // Pal finishes — the favor PARKS in pending_release: no payout, no ledger
  // rows, nothing moves until the member releases.
  const finish = await api(`/api/favors/${favorId}/finish`, { method: 'POST', token: pal.token });
  assert.equal(finish.status, 200);
  assert.equal(finish.json.favor.status, 'pending_release', 'finish no longer completes the favor');
  assert.equal(finish.json.awaitingRelease, true, 'finish flags the pending release');
  assert.equal(finish.json.payout, undefined, 'no payout rides the finish anymore');
  const earlyEarnings = await api('/api/payments/earnings', { token: pal.token });
  assert.ok(
    !earlyEarnings.json.earnings.some((t: any) => t.favorId === favorId),
    'no earning row exists before the release',
  );
  const earlyTxns = await api('/api/payments/transactions', { token: member.token });
  assert.ok(
    !earlyTxns.json.transactions.some((t: any) => t.favorId === favorId),
    'no member charge exists before the release',
  );

  // Member releases; payout = 50 - 20% = 40. The settle result rides the
  // response so the client can be honest about whether the earning is cashable
  // yet ('completed') or still uncollected ('incomplete' in Stripe-live dev —
  // assert the field exists rather than pin its value).
  const release = await api(`/api/favors/${favorId}/release`, { method: 'POST', token: member.token });
  assert.equal(release.status, 200);
  assert.equal(release.json.favor.status, 'completed');
  assert.equal(release.json.payout, 40, 'payout is base minus 20% commission');
  assert.ok(['completed', 'incomplete'].includes(release.json.ledgerStatus), 'settle result rides the release');

  // Member rates with a tip.
  const rate = await api(`/api/favors/${favorId}/rate`, { method: 'POST', token: member.token, body: { rating: 5, feedback: 'Great', tip: 10 } });
  assert.equal(rate.status, 200);

  // Ledgers reflect the transaction.
  const txns = await api('/api/payments/transactions', { token: member.token });
  assert.ok(txns.json.transactions.length >= 1, 'member has a payment');
  const earnings = await api('/api/payments/earnings', { token: pal.token });
  assert.ok(earnings.json.earnings.length >= 1, 'pal has an earning');
});

test('one active request per member: a second create 409s until the first ends', async () => {
  const member = await makeUser('member');
  const loc = { lat: 30.26, lng: -97.74, address: '1 Main St' };
  const first = await api('/api/favors', {
    method: 'POST',
    token: member.token,
    body: { tier: 'tiny', description: 'First errand', location: loc },
  });
  assert.equal(first.status, 201);

  // The client UI has exactly one member-favor slot, so a second concurrent
  // request is refused while ANY member favor is in an active status.
  const second = await api('/api/favors', {
    method: 'POST',
    token: member.token,
    body: { tier: 'small', description: 'Second errand', location: loc },
  });
  assert.equal(second.status, 409, 'second create is refused while one is active');
  assert.match(second.json.error.message, /finish or cancel your current favor/i);

  // Cancelling the open request frees the slot — the next create succeeds.
  const cancel = await api(`/api/favors/${first.json.favor.id}/cancel`, { method: 'POST', token: member.token });
  assert.equal(cancel.status, 200);
  const third = await api('/api/favors', {
    method: 'POST',
    token: member.token,
    body: { tier: 'small', description: 'Third errand', location: loc },
  });
  assert.equal(third.status, 201, 'slot reopens after cancel');
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

test('any vetted account can browse and fulfill others\' favors, but not their own', async () => {
  const alice = await makeUser('member');
  // A "member" can also fulfill favors, but only after passing pal vetting
  // (entering a home requires a background check regardless of the role label).
  const bob = await makeUser('member');
  const bobVet = await api('/api/profile/verify-pal', {
    method: 'POST', token: bob.token,
    body: { legalFirstName: 'Bob', legalLastName: 'Member', dateOfBirth: '1992-05-05', consent: true },
  });
  assert.equal(bobVet.status, 200, 'member can complete vetting to fulfill favors');

  const create = await api('/api/favors', {
    method: 'POST',
    token: alice.token,
    body: { tier: 'tiny', description: 'Browse-and-do test', location: { lat: 30, lng: -97, address: 'X' } },
  });
  assert.equal(create.status, 201);
  const favorId = create.json.favor.id;

  // Any account can browse open favors (no role gate anymore).
  const incoming = await api('/api/favors/incoming', { token: bob.token });
  assert.equal(incoming.status, 200);
  assert.ok(incoming.json.favors.some((f: any) => f.id === favorId), 'bob sees the open favor');

  // Ownership still holds: you cannot accept your own favor.
  const ownAccept = await api(`/api/favors/${favorId}/accept`, { method: 'POST', token: alice.token });
  assert.equal(ownAccept.status, 403);

  // But anyone else can request it, and the member's approval matches it.
  await requestAndApprove(favorId, alice.token, bob.token);
});

test('password reset: forgot -> reset -> login with the new password', async () => {
  const user = await makeUser('member');

  const forgot = await api('/api/auth/forgot-password', { method: 'POST', body: { email: user.email } });
  assert.equal(forgot.status, 200);
  assert.ok(forgot.json.devCode, 'reset code issued for a verified account');

  const reset = await api('/api/auth/reset-password', {
    method: 'POST',
    body: { email: user.email, code: forgot.json.devCode, password: 'NewPassword456' },
  });
  assert.equal(reset.status, 200);

  // New password works…
  const login = await api('/api/auth/login', { method: 'POST', body: { email: user.email, password: 'NewPassword456' } });
  assert.equal(login.status, 200, 'login with the new password succeeds');
  // …and the old one no longer does.
  const old = await api('/api/auth/login', { method: 'POST', body: { email: user.email, password: 'Password123' } });
  assert.equal(old.status, 401, 'old password is rejected after reset');
});

test('pal abandon: a released favor returns to the open board, member not stranded', async () => {
  const member = await makeUser('member');
  const pal = await makeUser('pal');
  const create = await api('/api/favors', {
    method: 'POST',
    token: member.token,
    body: { tier: 'tiny', description: 'Abandon test', location: { lat: 30, lng: -97, address: 'X' } },
  });
  const favorId = create.json.favor.id;
  await requestAndApprove(favorId, member.token, pal.token);

  // Only the assigned pal can release; a stranger cannot.
  const stranger = await makeUser('pal');
  const bad = await api(`/api/favors/${favorId}/abandon`, { method: 'POST', token: stranger.token });
  assert.equal(bad.status, 403);

  const abandon = await api(`/api/favors/${favorId}/abandon`, { method: 'POST', token: pal.token });
  assert.equal(abandon.status, 200);

  // The favor is open again and re-appears on the board for another pal.
  const incoming = await api('/api/favors/incoming', { token: stranger.token });
  assert.ok(incoming.json.favors.some((f: any) => f.id === favorId), 'released favor is browseable again');
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
  await requestAndApprove(favorId, member.token, pal.token);
  for (const s of ['enroute', 'arrived', 'in_progress'] as const) {
    if (['enroute', 'arrived', 'in_progress'].indexOf(target) >= ['enroute', 'arrived', 'in_progress'].indexOf(s) && target !== 'matched') {
      await api(`/api/favors/${favorId}/advance`, { method: 'POST', token: pal.token, body: { status: s } });
    }
  }
  return { member, pal, favorId };
}

test('live location: assigned pal shares GPS; member sees it, strangers cannot', async () => {
  const { member, pal, favorId } = await activeFavor({ advanceTo: 'enroute' });

  // The assigned pal posts a live fix.
  const post = await api(`/api/favors/${favorId}/location`, {
    method: 'POST', token: pal.token, body: { lat: 30.30, lng: -97.75 },
  });
  assert.equal(post.status, 200);

  // The member sees the pal's position on the active favor.
  const active = await api('/api/favors/active', { token: member.token });
  assert.equal(active.status, 200);
  assert.ok(active.json.favor.palLocation, 'member sees palLocation');
  assert.equal(active.json.favor.palLocation.lat, 30.30);
  assert.equal(active.json.favor.palLocation.lng, -97.75);

  // A non-participant cannot post a location for this favor.
  const stranger = await makeUser('pal');
  const bad = await api(`/api/favors/${favorId}/location`, {
    method: 'POST', token: stranger.token, body: { lat: 0, lng: 0 },
  });
  assert.equal(bad.status, 409, 'non-pal cannot post location');

  // The member (not the assigned pal) cannot post a location either.
  const memberPost = await api(`/api/favors/${favorId}/location`, {
    method: 'POST', token: member.token, body: { lat: 1, lng: 1 },
  });
  assert.equal(memberPost.status, 409, 'member cannot post pal location');
});

test('live location: rejected once the work is done (incl. pending_release)', async () => {
  const { pal, favorId } = await activeFavor({ advanceTo: 'in_progress' });
  // Finishing parks the favor in pending_release — no GPS streams while the
  // member decides to release.
  await api(`/api/favors/${favorId}/finish`, { method: 'POST', token: pal.token });
  const post = await api(`/api/favors/${favorId}/location`, {
    method: 'POST', token: pal.token, body: { lat: 30.30, lng: -97.75 },
  });
  assert.equal(post.status, 409, 'cannot share location on a finished favor');
});

test('SECURITY: concurrent double-finish and double-release pay out exactly once', async () => {
  const { member, pal, favorId } = await activeFavor({ advanceTo: 'in_progress' });
  // Fire two finishes at once — only one may park the favor.
  const [a, b] = await Promise.all([
    api(`/api/favors/${favorId}/finish`, { method: 'POST', token: pal.token }),
    api(`/api/favors/${favorId}/finish`, { method: 'POST', token: pal.token }),
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 409], 'one finish succeeds, the other is rejected');
  // Finishing moves no money — both ledgers stay empty until the release.
  const before = await api('/api/payments/earnings', { token: pal.token });
  assert.equal(before.json.earnings.filter((t: any) => t.favorId === favorId).length, 0, 'no earning before release');

  // Fire two releases at once — only one may settle.
  const [r1, r2] = await Promise.all([
    api(`/api/favors/${favorId}/release`, { method: 'POST', token: member.token }),
    api(`/api/favors/${favorId}/release`, { method: 'POST', token: member.token }),
  ]);
  assert.deepEqual([r1.status, r2.status].sort(), [200, 409], 'one release succeeds, the other is rejected');
  // Exactly one earning + one payment exist for this favor.
  const earnings = await api('/api/payments/earnings', { token: pal.token });
  assert.equal(earnings.json.earnings.filter((t: any) => t.favorId === favorId).length, 1, 'no duplicate payout');
  const txns = await api('/api/payments/transactions', { token: member.token });
  assert.equal(txns.json.transactions.filter((t: any) => t.favorId === favorId).length, 1, 'no duplicate charge');
  // The trust counter moved exactly once, and onto the PAL (the release is
  // called by the MEMBER — a refactor slip crediting the caller would pass
  // every other assert in this file).
  const palMe = await api('/api/profile/me', { token: pal.token });
  assert.equal(palMe.json.user.totalFavors, 1, 'pal totalFavors bumped exactly once by the release');
  const memberMe = await api('/api/profile/me', { token: member.token });
  assert.equal(memberMe.json.user.totalFavors, 0, 'member totalFavors untouched');
});

test('fund release: member-only, single-shot, and it gates rating/cancel/abandon', async () => {
  const { member, pal, favorId } = await activeFavor({ advanceTo: 'in_progress' });
  const finish = await api(`/api/favors/${favorId}/finish`, { method: 'POST', token: pal.token });
  assert.equal(finish.status, 200);
  assert.equal(finish.json.favor.status, 'pending_release');

  // The finish asks the member (and only the member) to release.
  const memberNotes = await api('/api/notifications', { token: member.token });
  assert.ok(
    memberNotes.json.notifications.some(
      (n: any) => n.type === 'release_request' && n.title === 'Release the payment' && /marked your favor as done/i.test(n.body),
    ),
    'member gets the release_request notification',
  );

  // Neither the pal nor a stranger can release the member's money.
  const palRelease = await api(`/api/favors/${favorId}/release`, { method: 'POST', token: pal.token });
  assert.equal(palRelease.status, 403, 'the pal cannot release their own payment');
  const stranger = await makeUser('member');
  const strangerRelease = await api(`/api/favors/${favorId}/release`, { method: 'POST', token: stranger.token });
  assert.equal(strangerRelease.status, 403, 'a stranger cannot release');

  // Ratings (both directions) wait for the release.
  const earlyRate = await api(`/api/favors/${favorId}/rate`, { method: 'POST', token: member.token, body: { rating: 5 } });
  assert.equal(earlyRate.status, 409, 'member cannot rate before releasing');
  const earlyRateMember = await api(`/api/favors/${favorId}/rate-member`, { method: 'POST', token: pal.token, body: { rating: 5 } });
  assert.equal(earlyRateMember.status, 409, 'pal cannot rate the member before the release');

  // The member cannot cancel their way out of paying, and the pal cannot
  // abandon finished work.
  const cancel = await api(`/api/favors/${favorId}/cancel`, { method: 'POST', token: member.token });
  assert.equal(cancel.status, 409, 'cancel is refused on a finished favor');
  assert.match(cancel.json.error.message, /this favor is finished — release the payment, or contact support/i);
  const abandon = await api(`/api/favors/${favorId}/abandon`, { method: 'POST', token: pal.token });
  assert.equal(abandon.status, 409, 'finished work cannot be abandoned');

  // The member releases → completed; the pal is told; a second release 409s;
  // rating opens.
  const release = await api(`/api/favors/${favorId}/release`, { method: 'POST', token: member.token });
  assert.equal(release.status, 200);
  assert.equal(release.json.payout, 40, 'small tier releases a $40 payout');
  const palNotes = await api('/api/notifications', { token: pal.token });
  assert.ok(
    palNotes.json.notifications.some(
      (n: any) => n.type === 'released' && n.title === 'Payment released' && /released your \$40\.00 payment/i.test(n.body),
    ),
    'pal gets the released notification',
  );
  const again = await api(`/api/favors/${favorId}/release`, { method: 'POST', token: member.token });
  assert.equal(again.status, 409, 'double release is rejected');
  const rate = await api(`/api/favors/${favorId}/rate`, { method: 'POST', token: member.token, body: { rating: 5 } });
  assert.equal(rate.status, 200, 'rating opens after the release');
});

test('pending_release never blocks or outranks new work (live-first /active)', async () => {
  // A second member's open request posted FIRST, so it is OLDER than the favor
  // that will park in pending_release below — the live-first slot must still
  // prefer it.
  const other = await makeUser('member');
  const older = await api('/api/favors', {
    method: 'POST',
    token: other.token,
    body: { tier: 'tiny', description: 'Older open request', location: { lat: 30.26, lng: -97.74, address: '8 Main St' } },
  });
  assert.equal(older.status, 201);

  const { member, pal, favorId } = await activeFavor({ advanceTo: 'in_progress' });
  await api(`/api/favors/${favorId}/finish`, { method: 'POST', token: pal.token });

  // While nothing live runs, both slots surface the parked favor (the member
  // must see the release prompt; the pal must see the release land).
  const parkedPal = await api('/api/favors/active', { token: pal.token });
  assert.equal(parkedPal.json.palFavor?.id, favorId, 'pal slot holds the parked favor');
  assert.equal(parkedPal.json.palFavor?.status, 'pending_release');
  const parkedMember = await api('/api/favors/active', { token: member.token });
  assert.equal(parkedMember.json.memberFavor?.id, favorId, 'member slot holds the parked favor');

  // The busy guard ignores pending_release: the pal takes the older request…
  await requestAndApprove(older.json.favor.id, other.token, pal.token);
  // …and the LIVE job wins the pal slot even though the parked favor is newer.
  const palActive = await api('/api/favors/active', { token: pal.token });
  assert.equal(palActive.json.palFavor?.id, older.json.favor.id, 'live job outranks the newer parked favor');
  assert.equal(palActive.json.favor?.id, older.json.favor.id, 'legacy field prefers the live pal job');

  // The member create cap also ignores pending_release — and the live request
  // wins the member slot.
  const mine = await api('/api/favors', {
    method: 'POST',
    token: member.token,
    body: { tier: 'tiny', description: 'Posted while waiting on a release', location: { lat: 30.26, lng: -97.74, address: '9 Main St' } },
  });
  assert.equal(mine.status, 201, 'pending_release does not hold the member create slot');
  const memberActive = await api('/api/favors/active', { token: member.token });
  assert.equal(memberActive.json.memberFavor?.id, mine.json.favor.id, 'live request wins the member slot');
});

test('SECURITY: re-rating a favor is rejected', async () => {
  const { member, pal, favorId } = await activeFavor({ advanceTo: 'in_progress' });
  await finishAndRelease(favorId, member.token, pal.token);
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

test('role slots are independent: an open request does not block pal work', async () => {
  const a = await makeUser('member');
  const b = await makeUser('member');
  // A opens their own request…
  const mine = await api('/api/favors', {
    method: 'POST',
    token: a.token,
    body: { tier: 'tiny', description: 'My own errand', location: { lat: 30.26, lng: -97.74, address: '1 Main St' } },
  });
  assert.equal(mine.status, 201);
  // …then clears vetting and accepts B's favor as a pal.
  const vet = await api('/api/profile/verify-pal', {
    method: 'POST',
    token: a.token,
    body: { legalFirstName: 'Test', legalLastName: 'Pal', dateOfBirth: '1990-01-01', consent: true },
  });
  assert.equal(vet.status, 200);
  const theirs = await api('/api/favors', {
    method: 'POST',
    token: b.token,
    body: { tier: 'small', description: 'Walk my dog', location: { lat: 30.26, lng: -97.74, address: '2 Main St' } },
  });
  assert.equal(theirs.status, 201);
  // Own open request must not block requesting (and being approved) as a pal.
  await requestAndApprove(theirs.json.favor.id, b.token, a.token);
  // GET /active returns both slots, split by role.
  const active = await api('/api/favors/active', { token: a.token });
  assert.equal(active.status, 200);
  assert.equal(active.json.memberFavor?.id, mine.json.favor.id, 'member slot holds my own request');
  assert.equal(active.json.palFavor?.id, theirs.json.favor.id, 'pal slot holds the job');
  assert.equal(active.json.favor?.id, theirs.json.favor.id, 'legacy field prefers the pal-side job');
});

test('phones are shared between participants only while the favor is in flight', async () => {
  const { member, pal, favorId } = await activeFavor({ advanceTo: 'matched' });
  // Both participants see each other's number on the matched favor.
  const palView = await api(`/api/favors/${favorId}`, { token: pal.token });
  assert.equal(palView.status, 200);
  assert.ok(palView.json.favor.memberPhone, 'assigned pal sees the member phone');
  const memberView = await api(`/api/favors/${favorId}`, { token: member.token });
  assert.ok(memberView.json.favor.palPhone, 'member sees the assigned pal phone');
  // The open feed never carries phones.
  const stranger = await makeUser('pal');
  const feed = await api('/api/favors/incoming', { token: stranger.token });
  assert.ok(
    feed.json.favors.every((f: any) => f.memberPhone === undefined && f.palPhone === undefined),
    'open feed has no phone numbers',
  );
  // Finishing parks the favor awaiting release — the two parties are still
  // engaged (the member must review and release), so the numbers stay visible.
  await api(`/api/favors/${favorId}/advance`, { method: 'POST', token: pal.token, body: { status: 'arrived' } });
  await api(`/api/favors/${favorId}/finish`, { method: 'POST', token: pal.token });
  const parked = await api(`/api/favors/${favorId}`, { token: pal.token });
  assert.equal(parked.json.favor.status, 'pending_release');
  assert.ok(parked.json.favor.memberPhone, 'phones persist while awaiting release');
  // After the member releases, the favor completes and the numbers disappear.
  await api(`/api/favors/${favorId}/release`, { method: 'POST', token: member.token });
  const done = await api(`/api/favors/${favorId}`, { token: pal.token });
  assert.equal(done.json.favor.status, 'completed');
  assert.equal(done.json.favor.memberPhone, undefined, 'phone gone after completion');
});

test('two-way reviews: pal rating aggregates into the member profile + reviews feed', async () => {
  const { member, pal, favorId } = await activeFavor({ advanceTo: 'arrived' });
  await finishAndRelease(favorId, member.token, pal.token);
  const rate = await api(`/api/favors/${favorId}/rate-member`, {
    method: 'POST', token: pal.token, body: { rating: 4, feedback: 'Friendly member' },
  });
  assert.equal(rate.status, 200);
  const prof = await api(`/api/profile/members/${member.id}`, { token: pal.token });
  assert.equal(prof.status, 200);
  assert.equal(prof.json.member.memberRating, 4, 'pal review aggregates into memberRating');
  const revs = await api(`/api/profile/members/${member.id}/reviews`, { token: pal.token });
  assert.ok(
    revs.json.reviews.some((r: any) => r.comment === 'Friendly member'),
    'review appears in the member reviews feed',
  );
});

test('decline persists: a declined favor leaves only that pal’s feed', async () => {
  const member = await makeUser('member');
  const pal1 = await makeUser('pal');
  const pal2 = await makeUser('pal');
  const create = await api('/api/favors', {
    method: 'POST',
    token: member.token,
    body: { tier: 'tiny', description: 'Pick up mail', location: { lat: 30.26, lng: -97.74, address: '3 Main St' } },
  });
  assert.equal(create.status, 201);
  const favorId = create.json.favor.id;
  const dec = await api(`/api/favors/${favorId}/decline`, { method: 'POST', token: pal1.token });
  assert.equal(dec.status, 200);
  const dec2 = await api(`/api/favors/${favorId}/decline`, { method: 'POST', token: pal1.token });
  assert.equal(dec2.status, 200, 'declining twice is idempotent');
  const feed1 = await api('/api/favors/incoming', { token: pal1.token });
  assert.ok(!feed1.json.favors.some((f: any) => f.id === favorId), 'declined favor gone from this pal’s feed');
  const feed2 = await api('/api/favors/incoming', { token: pal2.token });
  assert.ok(feed2.json.favors.some((f: any) => f.id === favorId), 'other pals still see it');
  const own = await api(`/api/favors/${favorId}/decline`, { method: 'POST', token: member.token });
  assert.equal(own.status, 403, 'cannot decline your own favor');
});

test('cashout pays the available balance exactly once', async () => {
  const { member, pal, favorId } = await activeFavor({ advanceTo: 'in_progress' });
  await finishAndRelease(favorId, member.token, pal.token);
  const cash1 = await api('/api/payments/cashout', { method: 'POST', token: pal.token });
  assert.equal(cash1.status, 200);
  assert.ok(cash1.json.amount > 0, 'positive payout');
  const cash2 = await api('/api/payments/cashout', { method: 'POST', token: pal.token });
  assert.equal(cash2.status, 400, 'no funds left after cashout');
});

test('pal can rate the member once', async () => {
  const { member, pal, favorId } = await activeFavor({ advanceTo: 'in_progress' });
  await finishAndRelease(favorId, member.token, pal.token);
  const r1 = await api(`/api/favors/${favorId}/rate-member`, { method: 'POST', token: pal.token, body: { rating: 5, feedback: 'Great member' } });
  assert.equal(r1.status, 200);
  const r2 = await api(`/api/favors/${favorId}/rate-member`, { method: 'POST', token: pal.token, body: { rating: 1 } });
  assert.equal(r2.status, 409, 'cannot rate the member twice');
});

test('pal reviews reflect member ratings', async () => {
  const { member, pal, favorId } = await activeFavor({ advanceTo: 'in_progress' });
  await finishAndRelease(favorId, member.token, pal.token);
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
  await finishAndRelease(favorId, member.token, pal.token);
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

test('signup requires 18+ affirmation and terms acceptance', async () => {
  const email = `test_consent_${uniq}_${crypto.randomBytes(3).toString('hex')}@example.com`;
  const phone = `+1555${crypto.randomInt(1000000, 9999999)}`;
  const res = await api('/api/auth/signup', {
    method: 'POST',
    body: { firstName: 'No', lastName: 'Consent', email, phone, password: 'Password123' }, // no ageAffirmed/acceptedTerms
  });
  assert.equal(res.status, 400, 'signup without consent is rejected');
});

test('trust & safety: an unvetted account cannot accept a favor until verified', async () => {
  const member = await makeUser('member'); // posts a favor
  const create = await api('/api/favors', {
    method: 'POST', token: member.token,
    body: { tier: 'tiny', description: 'Vetting gate test', location: { lat: 30, lng: -97, address: 'X' } },
  });
  assert.equal(create.status, 201);
  const favorId = create.json.favor.id;

  // A fresh, unvetted account is blocked from accepting (403).
  const helper = await makeUser('member');
  const blocked = await api(`/api/favors/${favorId}/accept`, { method: 'POST', token: helper.token });
  assert.equal(blocked.status, 403, 'unvetted account cannot accept');

  // After completing vetting, the same account can accept.
  const vet = await api('/api/profile/verify-pal', {
    method: 'POST', token: helper.token,
    body: { legalFirstName: 'Help', legalLastName: 'Er', dateOfBirth: '1991-02-02', consent: true },
  });
  assert.equal(vet.status, 200);
  assert.equal(vet.json.user.palVerified, true, 'vetting sets palVerified');
  const ok = await api(`/api/favors/${favorId}/accept`, { method: 'POST', token: helper.token });
  assert.equal(ok.status, 200, 'vetted account can request the favor');
  assert.ok(ok.json.offer && ok.json.pending, 'request lands as a pending list-price offer');
});

test('public /api/config returns maintenance + minVersion', async () => {
  const res = await api('/api/config');
  assert.equal(res.status, 200);
  assert.equal(typeof res.json.maintenance, 'boolean');
  assert.equal(typeof res.json.minVersion, 'string');
});

test('suspended accounts cannot log in and are cut off mid-session', async () => {
  const u = await makeUser('member');
  // Suspend directly in the DB, then a normal authed call is rejected with the
  // distinct code, and login is blocked too.
  await prisma.user.update({ where: { id: u.id }, data: { suspended: true } });

  const me = await api('/api/profile/me', { token: u.token });
  assert.equal(me.status, 403);
  assert.equal(me.json.error.code, 'account_suspended', 'mid-session request is cut off');

  const login = await api('/api/auth/login', { method: 'POST', body: { email: u.email, password: 'Password123' } });
  assert.equal(login.status, 403);
  assert.equal(login.json.error.code, 'account_suspended', 'suspended login is blocked');
});

test('pal vetting rejects an under-18 applicant', async () => {
  const u = await makeUser('member');
  const thisYear = new Date().getFullYear();
  const minorDob = `${thisYear - 15}-01-01`;
  const res = await api('/api/profile/verify-pal', {
    method: 'POST', token: u.token,
    body: { legalFirstName: 'Kid', legalLastName: 'Doe', dateOfBirth: minorDob, consent: true },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.user.palVerified, false, 'under-18 is not verified');
  assert.equal(res.json.user.palVetStatus, 'rejected', 'under-18 application is rejected');
});

test('vetting still accepts (and ignores) the legacy ssn field from old app builds', async () => {
  const u = await makeUser('member');
  const res = await api('/api/profile/verify-pal', {
    method: 'POST', token: u.token,
    body: { legalFirstName: 'Old', legalLastName: 'Client', ssn: '123456789', dateOfBirth: '1990-01-01', consent: true },
  });
  assert.equal(res.status, 200, 'unknown keys are stripped, not rejected');
  assert.equal(res.json.user.palVerified, true);
});

test('geo proxy degrades to empty results without a server key and validates input', async () => {
  const u = await makeUser('member');

  // Unauthenticated requests are rejected — the proxy spends Google quota.
  const anon = await api('/api/geo/suggest?q=100%20Main%20St');
  assert.equal(anon.status, 401, 'geo routes require auth');

  // No GOOGLE_MAPS_SERVER_KEY in the test env → graceful empty shapes.
  const suggest = await api('/api/geo/suggest?q=100%20Main%20St', { token: u.token });
  assert.equal(suggest.status, 200);
  assert.deepEqual(suggest.json.suggestions, [], 'no key → empty suggestions');

  const resolve = await api('/api/geo/resolve?placeId=ChIJd8BlQ2BZwokRAFUEcm_qrcA', { token: u.token });
  assert.equal(resolve.status, 200);
  assert.equal(resolve.json.location, null, 'no key → null location');

  const geocode = await api('/api/geo/geocode?q=100%20Main%20St%20Miami', { token: u.token });
  assert.equal(geocode.status, 200);
  assert.equal(geocode.json.location, null, 'no key → null location');

  const reverse = await api('/api/geo/reverse?lat=25.79&lng=-80.13', { token: u.token });
  assert.equal(reverse.status, 200);
  assert.equal(reverse.json.location, null, 'no key → null location');

  const badLat = await api('/api/geo/reverse?lat=999&lng=0', { token: u.token });
  assert.equal(badLat.status, 400, 'out-of-range lat is rejected');

  // Validation: too-short queries are a 400, not a Google call.
  const short = await api('/api/geo/suggest?q=ab', { token: u.token });
  assert.equal(short.status, 400, 'q under 3 chars is rejected');
});

test('price negotiation: pal offers → member counters → pal accepts at the agreed price', async () => {
  const member = await makeUser('member');
  const pal = await makeUser('pal');

  const create = await api('/api/favors', {
    method: 'POST',
    token: member.token,
    body: { tier: 'big', description: 'Assemble a bookshelf', location: { lat: 30.26, lng: -97.74, address: '2 Main St' } },
  });
  assert.equal(create.status, 201);
  const favorId = create.json.favor.id;

  // A member can't bid on their own favor.
  const selfOffer = await api(`/api/favors/${favorId}/offers`, { method: 'POST', token: member.token, body: { price: 10 } });
  assert.equal(selfOffer.status, 403);

  // Pal opens the negotiation at $60.
  const offer = await api(`/api/favors/${favorId}/offers`, { method: 'POST', token: pal.token, body: { price: 60 } });
  assert.equal(offer.status, 201);
  const offerId = offer.json.offer.id as string;
  assert.equal(offer.json.offer.lastBy, 'pal');

  // The pending offer rides the member's active-favor poll.
  const active = await api('/api/favors/active', { token: member.token });
  assert.equal(active.status, 200);
  assert.ok(
    active.json.favor.offers?.some((o: any) => o.id === offerId),
    'pending offer appears on the active favor',
  );

  // Nobody may accept their OWN price.
  const palSelfAccept = await api(`/api/favors/${favorId}/offers/${offerId}/accept`, {
    method: 'POST',
    token: pal.token,
    body: { price: 60 },
  });
  assert.equal(palSelfAccept.status, 409);

  // Member counters at $45 — the number on the table flips to the member's.
  const counter = await api(`/api/favors/${favorId}/offers/${offerId}/counter`, {
    method: 'POST',
    token: member.token,
    body: { price: 45 },
  });
  assert.equal(counter.status, 200);
  assert.equal(counter.json.offer.price, 45);
  assert.equal(counter.json.offer.lastBy, 'member');

  // SECURITY: an accept must echo the price on the acceptor's screen — a stale
  // (re-priced) number is refused instead of silently booking at the new one.
  const staleAccept = await api(`/api/favors/${favorId}/offers/${offerId}/accept`, {
    method: 'POST',
    token: pal.token,
    body: { price: 60 },
  });
  assert.equal(staleAccept.status, 409, 'accepting a price that is no longer on the table is refused');

  // Pal accepts the counter → matched at $45 with server-recomputed fees.
  const accept = await api(`/api/favors/${favorId}/offers/${offerId}/accept`, {
    method: 'POST',
    token: pal.token,
    body: { price: 45 },
  });
  assert.equal(accept.status, 200);
  assert.equal(accept.json.favor.status, 'matched');
  assert.equal(accept.json.favor.palId, pal.id);
  assert.equal(accept.json.favor.price, 45);
  assert.equal(accept.json.favor.total, computeFees(45).total, 'invoice recomputed at the agreed price');

  // The closed negotiation can't be re-accepted.
  const again = await api(`/api/favors/${favorId}/offers/${offerId}/accept`, {
    method: 'POST',
    token: pal.token,
    body: { price: 45 },
  });
  assert.equal(again.status, 409);
});

test('price negotiation: member accepts a pal offer; rival pending offers are declined', async () => {
  const member = await makeUser('member');
  const palA = await makeUser('pal');
  const palB = await makeUser('pal');

  const create = await api('/api/favors', {
    method: 'POST',
    token: member.token,
    body: { tier: 'tiny', description: 'Drop off a package', location: { lat: 30.26, lng: -97.74, address: '3 Main St' } },
  });
  assert.equal(create.status, 201);
  const favorId = create.json.favor.id;

  const offerA = await api(`/api/favors/${favorId}/offers`, { method: 'POST', token: palA.token, body: { price: 15 } });
  const offerB = await api(`/api/favors/${favorId}/offers`, { method: 'POST', token: palB.token, body: { price: 18 } });
  assert.equal(offerA.status, 201);
  assert.equal(offerB.status, 201);

  // Member accepts pal A's $15 → matched to A at 15.
  const accept = await api(`/api/favors/${favorId}/offers/${offerA.json.offer.id}/accept`, {
    method: 'POST',
    token: member.token,
    body: { price: 15 },
  });
  assert.equal(accept.status, 200);
  assert.equal(accept.json.favor.palId, palA.id);
  assert.equal(accept.json.favor.price, 15);

  // Pal B's offer was auto-declined, and B can see that on their offer read.
  const bView = await api(`/api/favors/${favorId}/offers`, { token: palB.token });
  assert.equal(bView.status, 200);
  assert.equal(bView.json.offers[0].status, 'declined');
  assert.equal(bView.json.favorStatus, 'matched');

  // Late offers on a matched favor are refused.
  const late = await api(`/api/favors/${favorId}/offers`, { method: 'POST', token: palB.token, body: { price: 12 } });
  assert.equal(late.status, 409);
});

test('assign: unvetted and busy pals cannot be booked; a free pal can', async () => {
  const member = await makeUser('member');
  const create = await api('/api/favors', {
    method: 'POST',
    token: member.token,
    body: { tier: 'tiny', description: 'Assign gate test', location: { lat: 30.26, lng: -97.74, address: '4 Main St' } },
  });
  assert.equal(create.status, 201);
  const favorId = create.json.favor.id;

  // A pal-role account that never cleared vetting can't be booked.
  const unvetted = await makeUser('pal', { vetted: false });
  const noVet = await api(`/api/favors/${favorId}/assign`, {
    method: 'POST', token: member.token, body: { palId: unvetted.id },
  });
  assert.equal(noVet.status, 403, 'unvetted pal is refused');

  // A pal mid-favor elsewhere can't be hijacked onto a second job.
  const { pal: busyPal } = await activeFavor({ advanceTo: 'matched' });
  const busy = await api(`/api/favors/${favorId}/assign`, {
    method: 'POST', token: member.token, body: { palId: busyPal.id },
  });
  assert.equal(busy.status, 409, 'busy pal is refused');
  assert.match(busy.json.error.message, /busy with another favor/i);

  // A free, vetted pal books fine — and the response carries the participant
  // shape (memberName), same as every other match response.
  const freePal = await makeUser('pal');
  const ok = await api(`/api/favors/${favorId}/assign`, {
    method: 'POST', token: member.token, body: { palId: freePal.id },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.favor.status, 'matched');
  assert.equal(ok.json.favor.palId, freePal.id);
  assert.ok(ok.json.favor.memberName, 'assign response uses the participant shape');
});

test('abandon scrubs the pal GPS and reopens negotiated favors at the listed price', async () => {
  const member = await makeUser('member');
  const pal = await makeUser('pal');
  const create = await api('/api/favors', {
    method: 'POST',
    token: member.token,
    body: { tier: 'negotiate', price: 30, description: 'Negotiated abandon test', location: { lat: 30.26, lng: -97.74, address: '5 Main St' } },
  });
  assert.equal(create.status, 201);
  const favorId = create.json.favor.id;
  assert.equal(create.json.favor.price, 30, 'listed price honored at create');

  // Pal negotiates up to $42; member accepts → matched at the negotiated price.
  const offer = await api(`/api/favors/${favorId}/offers`, { method: 'POST', token: pal.token, body: { price: 42 } });
  assert.equal(offer.status, 201);
  const approve = await api(`/api/favors/${favorId}/offers/${offer.json.offer.id}/accept`, {
    method: 'POST', token: member.token, body: { price: 42 },
  });
  assert.equal(approve.status, 200);
  assert.equal(approve.json.favor.price, 42);

  // Pal shares a live fix, then steps back.
  const fix = await api(`/api/favors/${favorId}/location`, { method: 'POST', token: pal.token, body: { lat: 30.31, lng: -97.76 } });
  assert.equal(fix.status, 200);
  const abandon = await api(`/api/favors/${favorId}/abandon`, { method: 'POST', token: pal.token });
  assert.equal(abandon.status, 200);

  // Reopened at the member's LIST price with recomputed fees — the number the
  // departed pal negotiated must not follow the favor back onto the board.
  const view = await api(`/api/favors/${favorId}`, { token: member.token });
  assert.equal(view.json.favor.status, 'requested');
  assert.equal(view.json.favor.price, 30, 'negotiated price does not survive the reopen');
  assert.equal(view.json.favor.total, computeFees(30).total, 'fees recomputed from the list price');
  assert.equal(view.json.favor.palLocation, undefined, 'participant read carries no stale GPS');

  // The open feed never carries the departed pal's last fix either.
  const pal2 = await makeUser('pal');
  const feed = await api('/api/favors/incoming', { token: pal2.token });
  const row = feed.json.favors.find((f: any) => f.id === favorId);
  assert.ok(row, 'reopened favor is back on the board');
  assert.equal(row.palLocation, undefined, 'open feed has no palLocation');

  // A second pal matches at the list price — the old pal's cleared fix must not
  // masquerade as the new pal's live position.
  await requestAndApprove(favorId, member.token, pal2.token);
  const active = await api('/api/favors/active', { token: member.token });
  assert.equal(active.json.memberFavor.palId, pal2.id);
  assert.equal(active.json.memberFavor.palLocation, undefined, 'stale GPS does not ride the new match');
});

test('a pal mid-favor cannot open new negotiations or requests', async () => {
  const { pal } = await activeFavor({ advanceTo: 'matched' });
  const member = await makeUser('member');
  const create = await api('/api/favors', {
    method: 'POST',
    token: member.token,
    body: { tier: 'small', description: 'Busy pal gate test', location: { lat: 30.26, lng: -97.74, address: '6 Main St' } },
  });
  assert.equal(create.status, 201);
  const favorId = create.json.favor.id;

  const offer = await api(`/api/favors/${favorId}/offers`, { method: 'POST', token: pal.token, body: { price: 25 } });
  assert.equal(offer.status, 409, 'busy pal cannot open a negotiation');
  assert.match(offer.json.error.message, /active favor/i);

  const accept = await api(`/api/favors/${favorId}/accept`, { method: 'POST', token: pal.token });
  assert.equal(accept.status, 409, 'busy pal cannot request either');
});

test('a pal quietly withdrawing their own request does not notify the member', async () => {
  const member = await makeUser('member');
  const pal = await makeUser('pal');
  const create = await api('/api/favors', {
    method: 'POST',
    token: member.token,
    body: { tier: 'tiny', description: 'Withdraw test', location: { lat: 30.26, lng: -97.74, address: '7 Main St' } },
  });
  assert.equal(create.status, 201);
  const favorId = create.json.favor.id;

  const req = await api(`/api/favors/${favorId}/accept`, { method: 'POST', token: pal.token });
  assert.equal(req.status, 200);

  const before = await api('/api/notifications', { token: member.token });
  const withdraw = await api(`/api/favors/${favorId}/offers/${req.json.offer.id}/decline`, {
    method: 'POST', token: pal.token,
  });
  assert.equal(withdraw.status, 200);
  const after = await api('/api/notifications', { token: member.token });
  assert.equal(
    after.json.notifications.length,
    before.json.notifications.length,
    'a withdrawal the member never acted on adds no notification row',
  );
  assert.ok(
    !after.json.notifications.some((n: any) => /declined/i.test(n.title)),
    'no "declined" notification for a quiet withdrawal',
  );

  // The withdrawn row is deleted outright, so re-requesting at the list price
  // is not blocked by the declined-at-this-price guard (that guard is for
  // MEMBER "no"s).
  const again = await api(`/api/favors/${favorId}/accept`, { method: 'POST', token: pal.token });
  assert.equal(again.status, 200, 'pal can re-request after withdrawing');
});

test('history rows name the member for pal-side receipts', async () => {
  const { member, pal, favorId } = await activeFavor({ advanceTo: 'in_progress' });
  await finishAndRelease(favorId, member.token, pal.token);
  const hist = await api('/api/favors', { token: pal.token });
  assert.equal(hist.status, 200);
  const row = hist.json.favors.find((f: any) => f.id === favorId);
  assert.ok(row, 'completed favor is in the pal history');
  assert.equal(row.memberName, 'Test', 'history rows carry the member first name');
});

test('adding the same card twice returns the existing row, not a dupe', async () => {
  const member = await makeUser('member');
  const card = { brand: 'Visa', last4: '4242', expMonth: 12, expYear: 2030 };
  const first = await api('/api/payments/cards', { method: 'POST', token: member.token, body: card });
  assert.equal(first.status, 201);
  const second = await api('/api/payments/cards', { method: 'POST', token: member.token, body: card });
  assert.equal(second.status, 200, 'duplicate add is a 200, not a new row');
  assert.equal(second.json.card.id, first.json.card.id, 'the existing card is returned');
  const list = await api('/api/payments/cards', { token: member.token });
  assert.equal(
    list.json.cards.filter((c: any) => c.brand === 'Visa' && c.last4 === '4242').length,
    1,
    'no server-side dupe',
  );
});

test('unverified login 403 carries a fresh devCode in dev', async () => {
  const email = `test_unverified_${uniq}_${crypto.randomBytes(3).toString('hex')}@example.com`;
  const phone = `+1555${crypto.randomInt(1000000, 9999999)}`;
  const signup = await api('/api/auth/signup', {
    method: 'POST',
    body: { firstName: 'Test', lastName: 'Unverified', email, phone, password: 'Password123', role: 'member', ageAffirmed: true, acceptedTerms: true },
  });
  assert.equal(signup.status, 201);

  // Logging in before verifying re-issues a code; in dev it rides the 403 so
  // the tester can finish signup without a real email.
  const login = await api('/api/auth/login', { method: 'POST', body: { email, password: 'Password123' } });
  assert.equal(login.status, 403);
  assert.match(login.json.error.message, /not verified/i);
  assert.match(String(login.json.error.details?.devCode ?? ''), /^\d{4}$/, 'fresh devCode rides the 403 in dev');

  // The re-issued code actually verifies the account.
  const verify = await api('/api/auth/verify-otp', {
    method: 'POST',
    body: { destination: email, code: login.json.error.details.devCode },
  });
  assert.equal(verify.status, 200, 're-issued code completes verification');
});

test('unblock restores messaging', async () => {
  const a = await makeUser('member');
  const b = await makeUser('pal');
  await api('/api/moderation/block', { method: 'POST', token: a.token, body: { userId: b.id } });

  const blockedList = await api('/api/moderation/blocked', { token: a.token });
  assert.ok(blockedList.json.blocked.includes(b.id), 'block is listed');
  const refused = await api('/api/messages/threads', { method: 'POST', token: a.token, body: { withUserId: b.id } });
  assert.equal(refused.status, 403, 'blocked pair cannot open a thread');

  const unblock = await api(`/api/moderation/block/${b.id}`, { method: 'DELETE', token: a.token });
  assert.equal(unblock.status, 200);
  assert.equal(unblock.json.ok, true);

  const listAfter = await api('/api/moderation/blocked', { token: a.token });
  assert.ok(!listAfter.json.blocked.includes(b.id), 'block row removed');
  const thread = await api('/api/messages/threads', { method: 'POST', token: a.token, body: { withUserId: b.id } });
  assert.equal(thread.status, 200, 'thread opens after unblock');
  assert.ok(thread.json.thread?.id, 'thread returned');
});
