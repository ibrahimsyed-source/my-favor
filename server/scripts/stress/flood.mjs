// My Favor — API flood / stress harness.
//
// Simulates ~100 concurrent users hammering the backend through every favor
// lifecycle path plus a battery of deliberate race conditions, then audits
// database invariants directly against the DB the server is using.
//
// Run from server/ with the stress-schema DATABASE_URL/DIRECT_URL exported and
// the stress server listening on BASE. NEVER point BASE/DATABASE_URL at prod.
//
//   BASE=http://localhost:4001 MEMBERS=60 PALS=40 node scripts/stress/flood.mjs
//
// Writes a JSON report to scripts/stress/last-run.json and prints a summary.

import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4001';
const N_MEMBERS = Number(process.env.MEMBERS || 60);
const N_PALS = Number(process.env.PALS || 40);
const PROVISION_CONC = Number(process.env.PROVISION_CONC || 16);
const SCEN_CONC = Number(process.env.SCEN_CONC || 24);
const RACE_ROUNDS = Number(process.env.RACE_ROUNDS || 8);
const CENTER = { lat: 25.7617, lng: -80.1918 }; // Miami

// ---------------------------------------------------------------------------
// Instrumentation
// ---------------------------------------------------------------------------
const anomalies = []; // { sev, area, msg, extra }
const latencies = new Map(); // "METHOD /path" -> number[]
let reqCount = 0;
let serverErrors = 0;
let networkErrors = 0;

const SEV = { CRIT: 'CRITICAL', HIGH: 'HIGH', MED: 'MEDIUM', LOW: 'LOW', INFO: 'INFO' };
function flag(sev, area, msg, extra) {
  anomalies.push({ sev, area, msg, ...(extra ? { extra } : {}) });
}

function bucket(method, path) {
  // Collapse ids in the path so latencies group by route shape.
  const shape = path
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id')
    .replace(/\?.*$/, '');
  return `${method} ${shape}`;
}

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const started = performance.now();
  let status = 0;
  let json = null;
  try {
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    const text = await res.text();
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  } catch (err) {
    networkErrors++;
    flag(SEV.HIGH, 'transport', `${method} ${path} threw: ${err.message}`);
    return { status: 0, json: null, ms: performance.now() - started, ok: false };
  }
  const ms = performance.now() - started;
  reqCount++;
  const key = bucket(method, path);
  if (!latencies.has(key)) latencies.set(key, []);
  latencies.get(key).push(ms);
  if (status >= 500) {
    serverErrors++;
    flag(SEV.CRIT, 'server-5xx', `${method} ${path} -> ${status}`, json?.error || json);
  }
  return { status, json, ms, ok: status >= 200 && status < 300 };
}

// Bounded-concurrency map.
async function pool(items, conc, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(conc, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); }
      catch (err) { out[idx] = { _threw: err.message }; flag(SEV.MED, 'harness', `scenario threw: ${err.message}`); }
    }
  });
  await Promise.all(workers);
  return out;
}

const rid = () => Math.random().toString(36).slice(2, 10);
function jitter(center, miles = 3) {
  const d = miles / 69; // ~deg per mile
  return { lat: center.lat + (Math.random() - 0.5) * d * 2, lng: center.lng + (Math.random() - 0.5) * d * 2 };
}

// ---------------------------------------------------------------------------
// User provisioning
// ---------------------------------------------------------------------------
let phoneSeq = 2000000;
async function provision(idx, role) {
  const email = `flood_${role}_${idx}_${rid()}@stress.local`;
  // Unique across roles: members and pals share idx ranges, so key the phone off
  // a global sequence, not idx (duplicate phones 409 at signup).
  const phone = `555${String(phoneSeq++).slice(-7)}`;
  const su = await req('POST', '/api/auth/signup', {
    body: { firstName: `${role === 'pal' ? 'Pal' : 'Mem'}${idx}`, lastName: 'Stress', email, phone, password: 'Password123!', ageAffirmed: true, acceptedTerms: true },
  });
  if (!su.ok) { flag(SEV.HIGH, 'provision', `signup failed ${su.status}`, su.json?.error); return null; }
  const destination = su.json.destination;
  const code = su.json.devCode;
  if (!code) { flag(SEV.CRIT, 'provision', 'signup did not return devCode (OTP unverifiable)'); return null; }
  const v = await req('POST', '/api/auth/verify-otp', { body: { destination, code } });
  if (!v.ok) { flag(SEV.HIGH, 'provision', `verify-otp failed ${v.status}`, v.json?.error); return null; }
  const token = v.json.accessToken || v.json.session?.accessToken;
  const refreshToken = v.json.refreshToken || v.json.session?.refreshToken;
  const id = v.json.user?.id;
  if (!token || !id) { flag(SEV.CRIT, 'provision', 'verify-otp missing token/user'); return null; }
  const u = { id, email, token, refreshToken, role };
  if (role === 'pal') {
    await req('POST', '/api/profile/role', { token, body: { role: 'pal' } });
    await req('POST', '/api/profile/accept-pal-agreement', { token, body: { version: '1.0' } });
    const vp = await req('POST', '/api/profile/verify-pal', { token, body: { legalFirstName: `Pal${idx}`, legalLastName: 'Stress', dateOfBirth: '1990-06-15', consent: true } });
    if (!vp.ok || vp.json?.user?.palVerified !== true) {
      flag(SEV.HIGH, 'provision', `pal verify failed ${vp.status}`, vp.json?.error);
    }
  }
  return u;
}

// ---------------------------------------------------------------------------
// Favor helpers
// ---------------------------------------------------------------------------
const TIERS = ['tiny', 'small', 'big', 'huge'];
async function createFavor(member, opts = {}) {
  const loc = jitter(CENTER);
  const tier = opts.tier || TIERS[Math.floor(Math.random() * TIERS.length)];
  const body = { tier, description: `Flood favor ${rid()}`, location: { lat: loc.lat, lng: loc.lng, address: `${Math.floor(Math.random() * 999)} Stress Ave, Miami FL` } };
  if (opts.price != null) body.price = opts.price;
  if (opts.tier === 'custom' || opts.tier === 'negotiate') body.price = opts.price ?? 42;
  const r = await req('POST', '/api/favors', { token: member.token, body });
  return r;
}

// Pal requests at list price; returns the offer id.
async function palAccept(pal, favorId) {
  return req('POST', `/api/favors/${favorId}/accept`, { token: pal.token });
}
async function memberOffers(member, favorId) {
  return req('GET', `/api/favors/${favorId}/offers`, { token: member.token });
}
async function memberAcceptOffer(member, favorId, offerId, price) {
  return req('POST', `/api/favors/${favorId}/offers/${offerId}/accept`, { token: member.token, body: { price } });
}

// Drive a favor from open to `matched` with the given pal via the real
// accept-offer path. Returns the matched favor or null.
async function matchViaOffer(member, pal, favorId) {
  const acc = await palAccept(pal, favorId);
  if (!acc.ok) return { ok: false, where: 'palAccept', r: acc };
  const offerId = acc.json.offer?.id;
  const price = acc.json.offer?.price;
  const m = await memberAcceptOffer(member, favorId, offerId, price);
  if (!m.ok) return { ok: false, where: 'memberAcceptOffer', r: m };
  if (m.json.favor?.status !== 'matched' || m.json.favor?.palId !== pal.id) {
    flag(SEV.HIGH, 'match', `matched favor has wrong status/pal`, { status: m.json.favor?.status, palId: m.json.favor?.palId, expected: pal.id });
  }
  return { ok: true, favor: m.json.favor, offerId, price };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------
async function happyPath(member, pal) {
  const c = await createFavor(member);
  if (!c.ok) { flag(SEV.HIGH, 'happy', `create failed ${c.status}`, c.json?.error); return; }
  const favorId = c.json.favor.id;

  const m = await matchViaOffer(member, pal, favorId);
  if (!m.ok) { flag(SEV.HIGH, 'happy', `match failed at ${m.where} (${m.r.status})`, m.r.json?.error); return; }

  // Pal advances + streams GPS.
  await req('POST', `/api/favors/${favorId}/advance`, { token: pal.token, body: { status: 'enroute' } });
  for (let k = 0; k < 4; k++) {
    const loc = jitter(CENTER, 1);
    await req('POST', `/api/favors/${favorId}/location`, { token: pal.token, body: { lat: loc.lat, lng: loc.lng } });
  }
  const arr = await req('POST', `/api/favors/${favorId}/advance`, { token: pal.token, body: { status: 'arrived' } });
  if (!arr.ok) flag(SEV.MED, 'happy', `advance->arrived failed ${arr.status}`, arr.json?.error);

  const fin = await req('POST', `/api/favors/${favorId}/finish`, { token: pal.token });
  if (!fin.ok || fin.json.favor?.status !== 'pending_release') flag(SEV.HIGH, 'happy', `finish wrong`, { status: fin.status, favStatus: fin.json?.favor?.status });

  const rel = await req('POST', `/api/favors/${favorId}/release`, { token: member.token });
  if (!rel.ok || rel.json.favor?.status !== 'completed') { flag(SEV.HIGH, 'happy', `release wrong`, { status: rel.status, favStatus: rel.json?.favor?.status }); return; }
  if (typeof rel.json.payout !== 'number' || rel.json.payout <= 0) flag(SEV.MED, 'happy', `release payout invalid`, { payout: rel.json.payout });

  // Ratings both directions (+ sometimes a tip).
  const tip = Math.random() < 0.4 ? 5 : undefined;
  const rt = await req('POST', `/api/favors/${favorId}/rate`, { token: member.token, body: { rating: 5, feedback: 'Great', ...(tip ? { tip } : {}) } });
  if (!rt.ok) flag(SEV.MED, 'happy', `member rate failed ${rt.status}`, rt.json?.error);
  const rm = await req('POST', `/api/favors/${favorId}/rate-member`, { token: pal.token, body: { rating: 5, feedback: 'Smooth' } });
  if (!rm.ok) flag(SEV.MED, 'happy', `rate-member failed ${rm.status}`, rm.json?.error);
  return favorId;
}

async function negotiate(member, pal) {
  const c = await createFavor(member, { tier: 'negotiate', price: 60 });
  if (!c.ok) { flag(SEV.MED, 'negotiate', `create failed ${c.status}`, c.json?.error); return; }
  const favorId = c.json.favor.id;
  // Pal offers a different price.
  const off = await req('POST', `/api/favors/${favorId}/offers`, { token: pal.token, body: { price: 75 } });
  if (!off.ok) { flag(SEV.MED, 'negotiate', `pal offer failed ${off.status}`, off.json?.error); return; }
  const offerId = off.json.offer.id;
  // Member counters down.
  const cnt = await req('POST', `/api/favors/${favorId}/offers/${offerId}/counter`, { token: member.token, body: { price: 68 } });
  if (!cnt.ok) { flag(SEV.MED, 'negotiate', `member counter failed ${cnt.status}`, cnt.json?.error); return; }
  // Pal accepts member's counter.
  const acc = await req('POST', `/api/favors/${favorId}/offers/${offerId}/accept`, { token: pal.token, body: { price: 68 } });
  if (!acc.ok) { flag(SEV.MED, 'negotiate', `pal accept counter failed ${acc.status}`, acc.json?.error); return; }
  if (acc.json.favor?.price !== 68 || acc.json.favor?.status !== 'matched') {
    flag(SEV.HIGH, 'negotiate', `negotiated match wrong price/status`, { price: acc.json.favor?.price, status: acc.json.favor?.status });
  }
  // Clean up so the pal/member aren't left blocked for later scenarios.
  await req('POST', `/api/favors/${favorId}/abandon`, { token: pal.token });
  await req('POST', `/api/favors/${favorId}/cancel`, { token: member.token });
}

async function cancelAtStage(member, pal, stage) {
  const c = await createFavor(member);
  if (!c.ok) return;
  const favorId = c.json.favor.id;
  if (stage !== 'requested') {
    const m = await matchViaOffer(member, pal, favorId);
    if (!m.ok) { await req('POST', `/api/favors/${favorId}/cancel`, { token: member.token }); return; }
    if (stage === 'arrived') {
      await req('POST', `/api/favors/${favorId}/advance`, { token: pal.token, body: { status: 'arrived' } });
    }
  }
  const can = await req('POST', `/api/favors/${favorId}/cancel`, { token: member.token });
  if (!can.ok) { flag(SEV.MED, 'cancel', `cancel@${stage} failed ${can.status}`, can.json?.error); return; }
  const { fee, refund } = can.json.cancellation || {};
  if (fee == null || refund == null || fee < 0 || refund < 0) flag(SEV.MED, 'cancel', `bad cancellation math @${stage}`, can.json.cancellation);
  if (stage === 'requested' && fee !== 0) flag(SEV.MED, 'cancel', `requested-stage cancel charged a fee`, can.json.cancellation);
}

async function abandonFlow(member, pal) {
  const c = await createFavor(member);
  if (!c.ok) return;
  const favorId = c.json.favor.id;
  const m = await matchViaOffer(member, pal, favorId);
  if (!m.ok) { await req('POST', `/api/favors/${favorId}/cancel`, { token: member.token }); return; }
  await req('POST', `/api/favors/${favorId}/location`, { token: pal.token, body: jitter(CENTER, 1) });
  const ab = await req('POST', `/api/favors/${favorId}/abandon`, { token: pal.token });
  if (!ab.ok) flag(SEV.MED, 'abandon', `abandon failed ${ab.status}`, ab.json?.error);
  // Favor should be back open at list price with pal GPS cleared.
  const f = await req('GET', `/api/favors/${favorId}`, { token: member.token });
  if (f.ok) {
    if (f.json.favor.status !== 'requested') flag(SEV.HIGH, 'abandon', `favor not reopened`, { status: f.json.favor.status });
    if (f.json.favor.palLocation || f.json.favor.palLat) flag(SEV.CRIT, 'abandon', `pal GPS survived abandon (leak)`, f.json.favor.palLocation);
  }
  await req('POST', `/api/favors/${favorId}/cancel`, { token: member.token });
}

async function declineFlow(member, pal) {
  const c = await createFavor(member);
  if (!c.ok) return;
  const favorId = c.json.favor.id;
  const d = await req('POST', `/api/favors/${favorId}/decline`, { token: pal.token });
  if (!d.ok) flag(SEV.LOW, 'decline', `decline failed ${d.status}`, d.json?.error);
  const inc = await req('GET', '/api/favors/incoming', { token: pal.token });
  if (inc.ok && inc.json.favors.some((f) => f.id === favorId)) flag(SEV.MED, 'decline', `declined favor still in pal feed`);
  await req('POST', `/api/favors/${favorId}/cancel`, { token: member.token });
}

async function messaging(member, pal) {
  const c = await createFavor(member);
  if (!c.ok) return;
  const favorId = c.json.favor.id;
  const m = await matchViaOffer(member, pal, favorId);
  if (!m.ok) { await req('POST', `/api/favors/${favorId}/cancel`, { token: member.token }); return; }
  const th = await req('POST', '/api/messages/threads', { token: member.token, body: { withUserId: pal.id } });
  if (!th.ok) { flag(SEV.MED, 'chat', `create thread failed ${th.status}`, th.json?.error); await req('POST', `/api/favors/${favorId}/cancel`, { token: member.token }); return; }
  const threadId = th.json.thread.id;
  for (let k = 0; k < 3; k++) {
    await req('POST', `/api/messages/threads/${threadId}/messages`, { token: member.token, body: { text: `hi ${k}` } });
    await req('POST', `/api/messages/threads/${threadId}/messages`, { token: pal.token, body: { text: `yo ${k}` } });
  }
  const msgs = await req('GET', `/api/messages/threads/${threadId}/messages`, { token: pal.token });
  if (msgs.ok && msgs.json.messages.length < 6) flag(SEV.MED, 'chat', `thread lost messages`, { got: msgs.json.messages.length });
  await req('POST', `/api/favors/${favorId}/cancel`, { token: member.token });
}

// ---------------------------------------------------------------------------
// Adversarial races
// ---------------------------------------------------------------------------
async function raceDoubleRelease(member, pal) {
  const c = await createFavor(member);
  if (!c.ok) return;
  const favorId = c.json.favor.id;
  const m = await matchViaOffer(member, pal, favorId);
  if (!m.ok) { await req('POST', `/api/favors/${favorId}/cancel`, { token: member.token }); return; }
  await req('POST', `/api/favors/${favorId}/advance`, { token: pal.token, body: { status: 'arrived' } });
  await req('POST', `/api/favors/${favorId}/finish`, { token: pal.token });
  const results = await Promise.all([
    req('POST', `/api/favors/${favorId}/release`, { token: member.token }),
    req('POST', `/api/favors/${favorId}/release`, { token: member.token }),
    req('POST', `/api/favors/${favorId}/release`, { token: member.token }),
  ]);
  const okCount = results.filter((r) => r.ok).length;
  if (okCount !== 1) flag(SEV.CRIT, 'race-release', `concurrent release: ${okCount} succeeded (expected exactly 1 — double-payout risk)`);
  return favorId;
}

async function raceDoubleFinish(member, pal) {
  const c = await createFavor(member);
  if (!c.ok) return;
  const favorId = c.json.favor.id;
  const m = await matchViaOffer(member, pal, favorId);
  if (!m.ok) { await req('POST', `/api/favors/${favorId}/cancel`, { token: member.token }); return; }
  await req('POST', `/api/favors/${favorId}/advance`, { token: pal.token, body: { status: 'arrived' } });
  const results = await Promise.all([
    req('POST', `/api/favors/${favorId}/finish`, { token: pal.token }),
    req('POST', `/api/favors/${favorId}/finish`, { token: pal.token }),
  ]);
  const okCount = results.filter((r) => r.ok).length;
  if (okCount !== 1) flag(SEV.HIGH, 'race-finish', `concurrent finish: ${okCount} succeeded (expected 1)`);
  await req('POST', `/api/favors/${favorId}/release`, { token: member.token });
}

async function raceCancelVsFinish(member, pal) {
  const c = await createFavor(member);
  if (!c.ok) return;
  const favorId = c.json.favor.id;
  const m = await matchViaOffer(member, pal, favorId);
  if (!m.ok) { await req('POST', `/api/favors/${favorId}/cancel`, { token: member.token }); return; }
  await req('POST', `/api/favors/${favorId}/advance`, { token: pal.token, body: { status: 'arrived' } });
  const [can, fin] = await Promise.all([
    req('POST', `/api/favors/${favorId}/cancel`, { token: member.token }),
    req('POST', `/api/favors/${favorId}/finish`, { token: pal.token }),
  ]);
  if (can.ok && fin.ok) flag(SEV.CRIT, 'race-cancel-finish', `favor both cancelled AND finished`);
  // settle up whichever won
  const f = await req('GET', `/api/favors/${favorId}`, { token: member.token });
  if (f.ok && f.json.favor.status === 'pending_release') await req('POST', `/api/favors/${favorId}/release`, { token: member.token });
}

async function raceTwoPalsOneFavor(member, palA, palB) {
  const c = await createFavor(member);
  if (!c.ok) return;
  const favorId = c.json.favor.id;
  // Both pals request at list price (both allowed — pending offers).
  const [oa, ob] = await Promise.all([palAccept(palA, favorId), palAccept(palB, favorId)]);
  if (!oa.ok || !ob.ok) { await req('POST', `/api/favors/${favorId}/cancel`, { token: member.token }); return; }
  // Member accepts BOTH offers concurrently — exactly one may match.
  const [ra, rb] = await Promise.all([
    memberAcceptOffer(member, favorId, oa.json.offer.id, oa.json.offer.price),
    memberAcceptOffer(member, favorId, ob.json.offer.id, ob.json.offer.price),
  ]);
  const winners = [ra, rb].filter((r) => r.ok);
  if (winners.length !== 1) flag(SEV.CRIT, 'race-double-match', `member matched ${winners.length} pals to one favor (expected 1)`);
  const f = await req('GET', `/api/favors/${favorId}`, { token: member.token });
  if (f.ok && ![palA.id, palB.id].includes(f.json.favor.palId)) flag(SEV.HIGH, 'race-double-match', `favor palId is neither contender`, f.json.favor.palId);
  // cleanup
  await req('POST', `/api/favors/${favorId}/abandon`, { token: palA.token });
  await req('POST', `/api/favors/${favorId}/abandon`, { token: palB.token });
  await req('POST', `/api/favors/${favorId}/cancel`, { token: member.token });
}

async function raceOnePalTwoFavors(memberA, memberB, pal) {
  // Pal has pending offers on two different favors; both members accept at once.
  const [ca, cb] = await Promise.all([createFavor(memberA), createFavor(memberB)]);
  if (!ca.ok || !cb.ok) return;
  const fa = ca.json.favor.id, fb = cb.json.favor.id;
  const [oa, ob] = await Promise.all([palAccept(pal, fa), palAccept(pal, fb)]);
  if (!oa.ok || !ob.ok) { await req('POST', `/api/favors/${fa}/cancel`, { token: memberA.token }); await req('POST', `/api/favors/${fb}/cancel`, { token: memberB.token }); return; }
  const [ra, rb] = await Promise.all([
    memberAcceptOffer(memberA, fa, oa.json.offer.id, oa.json.offer.price),
    memberAcceptOffer(memberB, fb, ob.json.offer.id, ob.json.offer.price),
  ]);
  const winners = [ra, rb].filter((r) => r.ok).length;
  if (winners !== 1) flag(SEV.CRIT, 'race-pal-double-book', `one pal booked onto ${winners} simultaneous favors (expected 1)`);
  // cleanup both
  for (const [mm, ff] of [[memberA, fa], [memberB, fb]]) {
    await req('POST', `/api/favors/${ff}/abandon`, { token: pal.token });
    await req('POST', `/api/favors/${ff}/cancel`, { token: mm.token });
  }
}

async function raceMemberDoubleCreate(member) {
  // One member fires three creates at once — the one-active-request cap must hold.
  // Clear any pre-existing slot first so we're testing the cap, not prior state.
  const act = await req('GET', '/api/favors/active', { token: member.token });
  if (act.ok && act.json.memberFavor && act.json.memberFavor.status !== 'pending_release') {
    await req('POST', `/api/favors/${act.json.memberFavor.id}/cancel`, { token: member.token });
  } else if (act.ok && act.json.memberFavor) {
    return; // stuck in pending_release; skip this round rather than emit a false signal
  }
  const results = await Promise.all([createFavor(member), createFavor(member), createFavor(member)]);
  const created = results.filter((r) => r.status === 201);
  if (created.length !== 1) flag(SEV.CRIT, 'race-double-create', `member created ${created.length} concurrent active favors (cap should allow 1)`);
  for (const r of created) await req('POST', `/api/favors/${r.json.favor.id}/cancel`, { token: member.token });
}

async function raceLocationAfterFinish(member, pal) {
  const c = await createFavor(member);
  if (!c.ok) return;
  const favorId = c.json.favor.id;
  const m = await matchViaOffer(member, pal, favorId);
  if (!m.ok) { await req('POST', `/api/favors/${favorId}/cancel`, { token: member.token }); return; }
  await req('POST', `/api/favors/${favorId}/advance`, { token: pal.token, body: { status: 'arrived' } });
  await req('POST', `/api/favors/${favorId}/finish`, { token: pal.token });
  const loc = await req('POST', `/api/favors/${favorId}/location`, { token: pal.token, body: jitter(CENTER, 1) });
  if (loc.ok) flag(SEV.HIGH, 'loc-after-finish', `location accepted after finish (GPS on non-live favor)`);
  await req('POST', `/api/favors/${favorId}/release`, { token: member.token });
}

async function negativeChecks(member, pal, unverifiedPal) {
  // Validation checks first, on a clean member slot (invalid creates must 400 on
  // their own merits, not get masked by the one-active-request 409).
  const g2 = await req('POST', '/api/favors', { token: member.token, body: { tier: 'tiny', description: '', location: { lat: 999, lng: 0, address: 'x' } } });
  if (g2.status !== 400) flag(SEV.MED, 'validation', `invalid create (empty desc, lat 999) -> ${g2.status} (expected 400)`);
  const g3 = await req('POST', '/api/favors', { token: member.token, body: { tier: 'custom', description: 'no price', location: { lat: CENTER.lat, lng: CENTER.lng, address: 'x' } } });
  if (g3.status !== 400) flag(SEV.MED, 'validation', `custom favor with no price -> ${g3.status} (expected 400)`);
  const g4 = await req('POST', '/api/favors', { token: member.token, body: { tier: 'custom', price: -50, description: 'neg', location: { lat: CENTER.lat, lng: CENTER.lng, address: 'x' } } });
  if (g4.status !== 400) flag(SEV.MED, 'validation', `negative custom price -> ${g4.status} (expected 400)`);
  const g1 = await req('GET', '/api/favors/not-a-uuid', { token: member.token });
  if (g1.status !== 400 && g1.status !== 404) flag(SEV.LOW, 'validation', `bad uuid favor id -> ${g1.status}`);
  const g5 = await req('GET', '/api/favors/active');
  if (g5.status !== 401) flag(SEV.HIGH, 'authz', `no-token active -> ${g5.status} (expected 401)`);

  // Now a real favor for the authz/gate checks.
  const c = await createFavor(member);
  if (!c.ok) return;
  const favorId = c.json.favor.id;
  const uacc = await palAccept(unverifiedPal, favorId);
  if (uacc.status !== 403) flag(SEV.HIGH, 'gate', `unverified pal accept returned ${uacc.status} (expected 403)`, uacc.json?.error);
  const own = await palAccept(member, favorId);
  if (own.status !== 403) flag(SEV.MED, 'gate', `member accepted own favor (${own.status}, expected 403)`);
  const peek = await req('GET', `/api/favors/${favorId}`, { token: unverifiedPal.token });
  if (peek.ok) flag(SEV.HIGH, 'authz', `non-participant read a favor they don't own`);
  await req('POST', `/api/favors/${favorId}/cancel`, { token: member.token });
}

// ---------------------------------------------------------------------------
// Throughput burst
// ---------------------------------------------------------------------------
async function throughputBurst(users, perUser = 6) {
  const calls = [];
  for (const u of users) {
    for (let k = 0; k < perUser; k++) {
      const pick = k % 3;
      if (pick === 0) calls.push(() => req('GET', '/api/favors/active', { token: u.token }));
      else if (pick === 1) calls.push(() => req('GET', '/api/favors/incoming', { token: u.token }));
      else calls.push(() => req('GET', '/api/notifications', { token: u.token }));
    }
  }
  // Shuffle so reads interleave across users.
  for (let i = calls.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [calls[i], calls[j]] = [calls[j], calls[i]]; }
  const started = performance.now();
  await pool(calls, 64, (fn) => fn());
  return { count: calls.length, ms: performance.now() - started };
}

// ---------------------------------------------------------------------------
// DB invariant audit (ground truth)
// ---------------------------------------------------------------------------
async function auditDb() {
  const prisma = new PrismaClient();
  const audit = {};
  try {
    const favors = await prisma.favor.findMany({ select: { id: true, status: true, palId: true, palLat: true, listPrice: true, price: true } });
    audit.totalFavors = favors.length;
    audit.byStatus = favors.reduce((a, f) => { a[f.status] = (a[f.status] || 0) + 1; return a; }, {});

    // No completed/cancelled/requested favor should carry a live pal GPS fix.
    const leaked = favors.filter((f) => f.palLat != null && !['matched', 'enroute', 'arrived', 'in_progress'].includes(f.status));
    if (leaked.length) flag(SEV.CRIT, 'db-gps-leak', `${leaked.length} non-live favors still hold a pal GPS fix`, leaked.slice(0, 5).map((f) => ({ id: f.id, status: f.status })));

    // Earnings: a favor must never have more than one 'earning' payment transaction
    // from the main settle (tip/cancel compensation are separate titles, so group by title prefix).
    const txns = await prisma.transaction.groupBy({ by: ['favorId', 'kind'], _count: { _all: true }, where: { kind: 'earning' } });
    const doubleEarn = txns.filter((t) => t._count._all > 1);
    // More than one earning per favor is legitimate ONLY if a tip was added (tip is a second earning).
    // Flag favors with >2 earnings (base + tip is the max expected).
    const over = doubleEarn.filter((t) => t._count._all > 2);
    if (over.length) flag(SEV.CRIT, 'db-double-earn', `${over.length} favors have >2 earning rows (double-credit)`, over.slice(0, 5));

    // A 'requested' favor must have palId null.
    const ghostPal = favors.filter((f) => f.status === 'requested' && f.palId != null);
    if (ghostPal.length) flag(SEV.CRIT, 'db-ghost-pal', `${ghostPal.length} 'requested' favors still have a palId`, ghostPal.slice(0, 5));

    // A pal must never be in >1 live favor simultaneously.
    const live = favors.filter((f) => ['matched', 'enroute', 'arrived', 'in_progress'].includes(f.status) && f.palId);
    const palLiveCount = live.reduce((a, f) => { a[f.palId] = (a[f.palId] || 0) + 1; return a; }, {});
    const overbooked = Object.entries(palLiveCount).filter(([, n]) => n > 1);
    if (overbooked.length) flag(SEV.CRIT, 'db-overbook', `${overbooked.length} pals are live on >1 favor at once`, overbooked.slice(0, 5));

    // A member must never have >1 active (requested..in_progress) favor.
    const memActive = favors.filter((f) => ['requested', 'matched', 'enroute', 'arrived', 'in_progress'].includes(f.status));
    const favFull = await prisma.favor.findMany({ where: { id: { in: memActive.map((f) => f.id) } }, select: { memberId: true, status: true } });
    const memCount = favFull.reduce((a, f) => { a[f.memberId] = (a[f.memberId] || 0) + 1; return a; }, {});
    const memOver = Object.entries(memCount).filter(([, n]) => n > 1);
    if (memOver.length) flag(SEV.CRIT, 'db-member-multi-active', `${memOver.length} members hold >1 active favor (cap breach)`, memOver.slice(0, 5));

    // Orphan pending offers on non-open favors.
    const badOffers = await prisma.favorOffer.findMany({ where: { status: 'pending', favor: { status: { not: 'requested' } } }, select: { id: true, favorId: true } });
    if (badOffers.length) flag(SEV.HIGH, 'db-orphan-offer', `${badOffers.length} pending offers on non-open favors`, badOffers.slice(0, 5));

    audit.earningRows = await prisma.transaction.count({ where: { kind: 'earning' } });
    audit.paymentRows = await prisma.transaction.count({ where: { kind: 'payment' } });
    audit.users = await prisma.user.count();
    audit.offers = await prisma.favorOffer.count();
    audit.messages = await prisma.message.count();
    audit.notifications = await prisma.notification.count();
  } catch (err) {
    flag(SEV.HIGH, 'db-audit', `audit failed: ${err.message}`);
  } finally {
    await prisma.$disconnect();
  }
  return audit;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function pct(arr, p) { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return Math.round(s[Math.floor((p / 100) * (s.length - 1))] * 10) / 10; }

async function main() {
  const t0 = performance.now();
  console.log(`== My Favor flood == BASE=${BASE} members=${N_MEMBERS} pals=${N_PALS}`);

  const h = await req('GET', '/health');
  if (!h.ok) { console.error('server not healthy, aborting'); process.exit(1); }

  // Provision.
  console.log('provisioning users...');
  const memberSpecs = Array.from({ length: N_MEMBERS }, (_, i) => ({ i, role: 'member' }));
  const palSpecs = Array.from({ length: N_PALS }, (_, i) => ({ i, role: 'pal' }));
  const [members, pals] = await Promise.all([
    pool(memberSpecs, PROVISION_CONC, (s) => provision(s.i, 'member')).then((a) => a.filter(Boolean)),
    pool(palSpecs, PROVISION_CONC, (s) => provision(s.i, 'pal')).then((a) => a.filter(Boolean)),
  ]);
  // One deliberately-unverified pal for gate checks.
  const unverifiedPal = await provision(9001, 'member'); // a member acting as would-be pal
  console.log(`provisioned ${members.length} members, ${pals.length} pals`);
  if (members.length < 5 || pals.length < 5) { flag(SEV.CRIT, 'provision', 'too few users provisioned to stress-test'); }

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // Phase 1: concurrent mixed lifecycle scenarios.
  console.log('phase 1: mixed lifecycle load...');
  const jobs = [];
  const nLife = Math.min(members.length, 40);
  for (let i = 0; i < nLife; i++) jobs.push(() => happyPath(members[i % members.length], pick(pals)));
  for (let i = 0; i < 12; i++) jobs.push(() => negotiate(pick(members), pick(pals)));
  for (const stage of ['requested', 'matched', 'arrived']) for (let i = 0; i < 6; i++) jobs.push(() => cancelAtStage(pick(members), pick(pals), stage));
  for (let i = 0; i < 10; i++) jobs.push(() => abandonFlow(pick(members), pick(pals)));
  for (let i = 0; i < 10; i++) jobs.push(() => declineFlow(pick(members), pick(pals)));
  for (let i = 0; i < 10; i++) jobs.push(() => messaging(pick(members), pick(pals)));
  // Shuffle the job list so scenario types interleave under load.
  for (let i = jobs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [jobs[i], jobs[j]] = [jobs[j], jobs[i]]; }
  await pool(jobs, SCEN_CONC, (fn) => fn());

  // Phase 2: adversarial races (several rounds for timing coverage).
  console.log('phase 2: adversarial races...');
  for (let r = 0; r < RACE_ROUNDS; r++) {
    const m1 = pick(members), m2 = pick(members.filter((x) => x !== m1) || members);
    const p1 = pick(pals), p2 = pick(pals.filter((x) => x !== p1) || pals);
    await Promise.all([
      raceDoubleRelease(m1, p1),
      raceDoubleFinish(pick(members), pick(pals)),
      raceCancelVsFinish(pick(members), pick(pals)),
      raceTwoPalsOneFavor(pick(members), p1, p2),
      raceOnePalTwoFavors(m1, m2, pick(pals)),
      raceMemberDoubleCreate(pick(members)),
      raceLocationAfterFinish(pick(members), pick(pals)),
    ]);
  }
  if (unverifiedPal) await negativeChecks(pick(members), pick(pals), unverifiedPal);

  // Phase 3: throughput burst.
  console.log('phase 3: throughput burst...');
  const burst = await throughputBurst([...members, ...pals], 6);

  // Phase 4: DB invariant audit.
  console.log('phase 4: db invariant audit...');
  const audit = await auditDb();

  // Report.
  const totalMs = performance.now() - t0;
  const latTable = [...latencies.entries()].map(([k, arr]) => ({ route: k, n: arr.length, p50: pct(arr, 50), p95: pct(arr, 95), p99: pct(arr, 99), max: Math.round(Math.max(...arr) * 10) / 10 }))
    .sort((a, b) => b.p95 - a.p95);
  const bySev = anomalies.reduce((a, x) => { a[x.sev] = (a[x.sev] || 0) + 1; return a; }, {});
  const report = { base: BASE, durationSec: Math.round(totalMs / 100) / 10, totalRequests: reqCount, serverErrors, networkErrors, throughput: burst, anomalyCountBySeverity: bySev, anomalies, latencyByRoute: latTable, dbAudit: audit };

  writeFileSync(new URL('./last-run.json', import.meta.url), JSON.stringify(report, null, 2));

  console.log('\n================ FLOOD REPORT ================');
  console.log(`requests: ${reqCount}  dur: ${report.durationSec}s  5xx: ${serverErrors}  net-errs: ${networkErrors}`);
  console.log(`burst: ${burst.count} reads in ${Math.round(burst.ms)}ms (${Math.round(burst.count / (burst.ms / 1000))} rps)`);
  console.log(`DB: ${JSON.stringify(audit.byStatus)}  users=${audit.users} earnings=${audit.earningRows} payments=${audit.paymentRows}`);
  console.log(`anomalies: ${JSON.stringify(bySev)}`);
  const order = [SEV.CRIT, SEV.HIGH, SEV.MED, SEV.LOW, SEV.INFO];
  for (const sev of order) {
    const list = anomalies.filter((a) => a.sev === sev);
    if (!list.length) continue;
    console.log(`\n--- ${sev} (${list.length}) ---`);
    const seen = new Map();
    for (const a of list) { const k = `${a.area}: ${a.msg}`; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const [k, n] of seen) console.log(`  [${n}x] ${k}`);
  }
  console.log('\nfull report -> scripts/stress/last-run.json');
}

main().then(() => process.exit(0)).catch((e) => { console.error('flood crashed:', e); process.exit(1); });
