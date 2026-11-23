// Verifies feature 5 (min price), 6 (reviews + review notification) and
// 9 (almost-here proximity push) against the stress server.
const BASE = process.env.BASE || 'http://localhost:4001';
const rid = () => Math.random().toString(36).slice(2, 9);
let seq = 8000000;
let pass = 0, fail = 0;
const check = (name, ok, extra) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
async function j(method, path, token, body) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = { raw: t }; }
  return { status: r.status, d };
}
async function mkUser(role) {
  const email = `vf_${role}_${rid()}@stress.local`;
  const su = await j('POST', '/api/auth/signup', null, { firstName: role[0].toUpperCase() + role.slice(1), lastName: 'VF', email, phone: `555${String(seq++).slice(-7)}`, password: 'Password123!', ageAffirmed: true, acceptedTerms: true });
  const v = await j('POST', '/api/auth/verify-otp', null, { destination: su.d.destination, code: su.d.devCode });
  const u = { id: v.d.user.id, token: v.d.accessToken };
  if (role === 'pal') {
    await j('POST', '/api/profile/role', u.token, { role: 'pal' });
    await j('POST', '/api/profile/accept-pal-agreement', u.token, { version: '1.0' });
    await j('POST', '/api/profile/verify-pal', u.token, { legalFirstName: 'P', legalLastName: 'V', dateOfBirth: '1990-01-01', consent: true });
  }
  return u;
}
const DEST = { lat: 25.7617, lng: -80.1918 };
// ~0.4 mi north of DEST (inside NEAR_MILES=0.5) and ~2 mi away (outside).
const NEAR = { lat: 25.7617 + 0.4 / 69, lng: -80.1918 };
const FAR = { lat: 25.7617 + 2 / 69, lng: -80.1918 };

(async () => {
  const member = await mkUser('member');
  const pal = await mkUser('pal');

  // Feature 5: below-minimum custom price is rejected; $5 is accepted.
  const low = await j('POST', '/api/favors', member.token, { tier: 'custom', price: 2, description: 'too cheap', location: { ...DEST, address: '1 St, Miami FL' } });
  check('F5 custom price $2 rejected (min $5)', low.status === 400, `got ${low.status}`);
  const ok = await j('POST', '/api/favors', member.token, { tier: 'custom', price: 5, description: 'min ok', location: { ...DEST, address: '1 St, Miami FL' } });
  check('F5 custom price $5 accepted', ok.status === 201, `got ${ok.status}`);
  const favorId = ok.d.favor?.id;
  check('F5 custom price flows to favor.price', ok.d.favor?.price === 5, `price=${ok.d.favor?.price}`);

  // Match it (offer -> accept) so we can run the lifecycle.
  const acc = await j('POST', `/api/favors/${favorId}/accept`, pal.token);
  await j('POST', `/api/favors/${favorId}/offers/${acc.d.offer.id}/accept`, member.token, { price: acc.d.offer.price });

  // Feature 9: a FAR location fix should NOT notify; a NEAR fix should, once.
  await j('POST', `/api/favors/${favorId}/location`, pal.token, FAR);
  await new Promise((r) => setTimeout(r, 1200)); // let the fire-and-forget settle
  let n = await j('GET', '/api/notifications', member.token);
  const farCount = (n.d.notifications || []).filter((x) => x.type === 'almost_here').length;
  check('F9 far fix sends no almost_here', farCount === 0, `count=${farCount}`);
  await j('POST', `/api/favors/${favorId}/location`, pal.token, NEAR);
  await j('POST', `/api/favors/${favorId}/location`, pal.token, NEAR); // second near fix — must not double
  await new Promise((r) => setTimeout(r, 1500));
  n = await j('GET', '/api/notifications', member.token);
  const near = (n.d.notifications || []).filter((x) => x.type === 'almost_here');
  check('F9 near fix sends exactly one almost_here', near.length === 1, `count=${near.length}`);
  check('F9 almost_here carries favorId', near[0]?.favorId === favorId, `favorId=${near[0]?.favorId}`);

  // Finish + release + rate so a review exists.
  await j('POST', `/api/favors/${favorId}/advance`, pal.token, { status: 'arrived' });
  await j('POST', `/api/favors/${favorId}/finish`, pal.token);
  await j('POST', `/api/favors/${favorId}/release`, member.token);
  const rate = await j('POST', `/api/favors/${favorId}/rate`, member.token, { rating: 5, feedback: 'Excellent pal!' });
  check('F6 member can rate completed favor', rate.status === 200, `got ${rate.status}`);
  const palRevs = await j('GET', `/api/profile/pals/${pal.id}/reviews`, pal.token);
  const mine = (palRevs.d.reviews || []).find((r) => r.comment === 'Excellent pal!');
  check('F6 pal sees received review (comment + rating)', !!mine && mine.rating === 5, mine ? `rating=${mine.rating}` : 'not found');
  await new Promise((r) => setTimeout(r, 800));
  const palNotifs = await j('GET', '/api/notifications', pal.token);
  const rev = (palNotifs.d.notifications || []).find((x) => x.type === 'review');
  check('F6 review notification sent to pal with favorId', !!rev && rev.favorId === favorId, rev ? `favorId=${rev.favorId}` : 'not found');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
