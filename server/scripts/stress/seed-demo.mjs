// Seeds two known accounts on the stress server + one completed favor with
// cross-reviews, so the web UI can be driven with stable credentials.
//   member: demo-member@stress.local / Password123!
//   pal:    demo-pal@stress.local    / Password123!
const BASE = process.env.BASE || 'http://localhost:4001';
let seq = 9100000;
async function j(method, path, token, body) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = { raw: t }; }
  return { status: r.status, d };
}
async function ensureUser(email, role, first) {
  // Try login first (idempotent re-runs).
  let l = await j('POST', '/api/auth/login', null, { email, password: 'Password123!' });
  if (l.status === 200) return { id: l.d.user.id, token: l.d.accessToken };
  const su = await j('POST', '/api/auth/signup', null, { firstName: first, lastName: 'Demo', email, phone: `555${String(seq++).slice(-7)}`, password: 'Password123!', ageAffirmed: true, acceptedTerms: true });
  // handle "already exists but unverified"
  let dest = su.d?.destination, code = su.d?.devCode;
  if (!code && su.status === 409) { l = await j('POST', '/api/auth/login', null, { email, password: 'Password123!' }); code = l.d?.details?.devCode; dest = email; }
  const v = await j('POST', '/api/auth/verify-otp', null, { destination: dest, code });
  const u = { id: v.d.user.id, token: v.d.accessToken };
  if (role === 'pal') {
    await j('POST', '/api/profile/role', u.token, { role: 'pal' });
    await j('POST', '/api/profile/accept-pal-agreement', u.token, { version: '1.0' });
    await j('POST', '/api/profile/verify-pal', u.token, { legalFirstName: first, legalLastName: 'Demo', dateOfBirth: '1990-01-01', consent: true });
  }
  return u;
}
(async () => {
  const member = await ensureUser('demo-member@stress.local', 'member', 'Demo');
  const pal = await ensureUser('demo-pal@stress.local', 'pal', 'Pat');
  // A completed favor with reviews both directions, so My Reviews has content.
  const c = await j('POST', '/api/favors', member.token, { tier: 'small', description: 'Pick up groceries', location: { lat: 25.7617, lng: -80.1918, address: '100 Biscayne Blvd, Miami FL' } });
  if (c.status === 201) {
    const favorId = c.d.favor.id;
    const acc = await j('POST', `/api/favors/${favorId}/accept`, pal.token);
    await j('POST', `/api/favors/${favorId}/offers/${acc.d.offer.id}/accept`, member.token, { price: acc.d.offer.price });
    await j('POST', `/api/favors/${favorId}/advance`, pal.token, { status: 'arrived' });
    await j('POST', `/api/favors/${favorId}/finish`, pal.token);
    await j('POST', `/api/favors/${favorId}/release`, member.token);
    await j('POST', `/api/favors/${favorId}/rate`, member.token, { rating: 5, feedback: 'Fast and friendly — would book again!' });
    await j('POST', `/api/favors/${favorId}/rate-member`, pal.token, { rating: 5, feedback: 'Clear instructions, easy drop-off.' });
  }
  // A few open favors from OTHER members so the pal board has rows to filter.
  for (let i = 0; i < 4; i++) {
    const m = await ensureUser(`demo-opener${i}@stress.local`, 'member', `Open${i}`);
    const tiers = ['tiny', 'small', 'big', 'huge'];
    const jit = (d) => 25.7617 + (i - 2) * (d / 69);
    await j('POST', '/api/favors', m.token, { tier: tiers[i], description: `Open favor ${i}`, location: { lat: jit(i * 3), lng: -80.1918, address: `${i} Open Ave, Miami FL` } });
  }
  console.log('seeded: demo-member@stress.local / demo-pal@stress.local  (Password123!)');
})().catch((e) => { console.error(e); process.exit(1); });
