// Verifies the bug-2 /assign fix (booked pal's own offer -> accepted, not
// declined) and the bug-1 favorId payload on lifecycle notifications.
const BASE = process.env.BASE || 'http://localhost:4001';
const rid = () => Math.random().toString(36).slice(2, 9);
let seq = 7000000;
async function j(method, path, token, body) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = { raw: t }; }
  return { status: r.status, d };
}
async function mkUser(role) {
  const email = `va_${role}_${rid()}@stress.local`;
  const su = await j('POST', '/api/auth/signup', null, { firstName: role, lastName: 'V', email, phone: `555${String(seq++).slice(-7)}`, password: 'Password123!', ageAffirmed: true, acceptedTerms: true });
  const v = await j('POST', '/api/auth/verify-otp', null, { destination: su.d.destination, code: su.d.devCode });
  const token = v.d.accessToken, id = v.d.user.id;
  if (role === 'pal') {
    await j('POST', '/api/profile/role', token, { role: 'pal' });
    await j('POST', '/api/profile/accept-pal-agreement', token, { version: '1.0' });
    await j('POST', '/api/profile/verify-pal', token, { legalFirstName: 'P', legalLastName: 'V', dateOfBirth: '1990-01-01', consent: true });
  }
  return { id, token };
}
(async () => {
  const member = await mkUser('member');
  const pal = await mkUser('pal');
  const c = await j('POST', '/api/favors', member.token, { tier: 'small', description: 'assign test', location: { lat: 25.76, lng: -80.19, address: '1 Test St, Miami FL' } });
  const favorId = c.d.favor.id;
  // Pal requests at list price (pending offer).
  const acc = await j('POST', `/api/favors/${favorId}/accept`, pal.token);
  console.log('pal accept ->', acc.status, 'offer status:', acc.d.offer?.status);
  // Member books the pal directly via /assign.
  const asg = await j('POST', `/api/favors/${favorId}/assign`, member.token, { palId: pal.id });
  console.log('assign ->', asg.status, 'favor status:', asg.d.favor?.status, 'palId match:', asg.d.favor?.palId === pal.id);
  // The pal's own offer must now be ACCEPTED (bug-2 fix), not declined.
  const offers = await j('GET', `/api/favors/${favorId}/offers`, pal.token);
  const mine = offers.d.offers?.[0];
  console.log('pal offer after assign ->', mine?.status, mine?.status === 'accepted' ? 'PASS (booked pal not shown "taken")' : 'FAIL');
  // The match notification row must carry favorId (bug-1 fix).
  const notifs = await j('GET', '/api/notifications', pal.token);
  const match = notifs.d.notifications?.find((n) => n.type === 'match');
  console.log('match notif favorId ->', match?.favorId, match?.favorId === favorId ? 'PASS (deep-linkable)' : 'FAIL');
  // cleanup
  await j('POST', `/api/favors/${favorId}/cancel`, member.token);
})().catch((e) => { console.error(e); process.exit(1); });
