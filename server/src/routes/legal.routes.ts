import { Router } from 'express';

// ===========================================================================
// Public legal pages — GET /privacy, /terms, /support.
//
// App Store (5.1.1) and Google Play both require a PUBLIC privacy-policy URL
// (and a support URL) on the store listing. These pages serve the SAME copy as
// the in-app legal screen (src/screens/legal.tsx) so the app and the hosted
// policy never disagree. If you edit the copy, edit BOTH files.
//
// Store listing URLs (until a marketing domain exists, the API origin works):
//   Privacy Policy: https://<api-host>/privacy
//   Terms of Service: https://<api-host>/terms
//   Support: https://<api-host>/support
// ===========================================================================

const CONTACT_EMAIL = 'support@myfavor.app';
const COMPANY = 'My Favor';
const LAST_UPDATED = 'July 1, 2026';

// LEGAL: must match src/screens/legal.tsx. Replace with the registered company
// legal entity, business address, and governing-law jurisdiction before launch.
const LEGAL_ENTITY = '[Company legal entity, address, and governing-law jurisdiction — confirm with counsel]';

type Block = { h1: string } | { h: string } | { p: string } | { li: string };

const TERMS: Block[] = [
  { p: 'Please read these Terms and Conditions carefully before using Our Service. They are a binding agreement between You and My Favor.' },
  { h1: 'Interpretation and Definitions' },
  { h: 'Interpretation' },
  { p: 'The words of which the initial letter is capitalized have meanings defined under the following conditions. The following definitions have the same meaning whether they appear in singular or in plural.' },
  { h: 'Definitions' },
  { p: 'For the purposes of these Terms and Conditions:' },
  { li: 'Application (or "App") means the My Favor software program that You download onto any electronic device.' },
  { li: `Company (referred to as "the Company", "We", "Us", or "Our") means ${LEGAL_ENTITY}, the operator of My Favor.` },
  { li: 'Service means the My Favor Application together with the marketplace, website, and related services We provide.' },
  { li: 'Account means the unique account created for You to access and use the Service.' },
  { li: 'User (or "You") means any individual who accesses or uses the Service, whether as a Favor Member, a Favor Pal, or both.' },
  { li: 'Favor Member (or "Member") means a User who requests a Favor through the Service.' },
  { li: 'Favor Pal (or "Pal") means an independent User who chooses to accept and perform a Favor in exchange for payment.' },
  { li: 'Favor means an errand, task, or service that a Member requests and a Pal agrees to perform through the Service.' },
  { li: 'Content means the text, photos, messages, and other material that Users submit to or through the Service.' },
  { li: 'Personal Data means any information that relates to an identified or identifiable individual, as further described in Our Privacy Policy.' },
  { p: `These Terms and Conditions ("Terms") are a binding agreement between You and ${COMPANY} governing Your use of the Service. By creating an Account or otherwise using the Service, You agree to these Terms. If You do not agree, do not use the Service.` },
  { h: 'The Service' },
  { p: 'My Favor is a marketplace that connects Members who request everyday favors and errands with Favor Pals who choose to perform them. My Favor provides the platform only; it is not a party to the agreement between a Member and a Pal and does not itself perform favors.' },
  { h: 'Eligibility & Accounts' },
  { li: 'You must be at least 18 years old and able to form a binding contract to use the Service.' },
  { li: 'You agree to provide accurate, current information and to keep your account credentials secure.' },
  { li: 'You are responsible for all activity that occurs under your account.' },
  { li: 'You may not use the Service if We have previously banned you or if the law prohibits you from doing so.' },
  { h: 'Independent-Contractor Relationship' },
  { p: 'Favor Pals are independent contractors, not employees, agents, partners, or joint venturers of My Favor. Pals decide whether, when, and how to accept and perform Favors, and they use their own judgment and means to do so. Nothing in these Terms creates an employment, agency, partnership, or franchise relationship between My Favor and any Pal. As independent contractors, Pals are solely responsible for their own taxes and for any licenses, permits, or insurance their Favors require.' },
  { h: 'Payments, Fees & Payouts' },
  { li: 'Members are charged the favor price plus a service fee and a transaction (processing) fee, shown before you confirm.' },
  { li: 'Favor Pals receive the favor price minus a platform commission.' },
  { li: 'Cancellations may incur a fee once a Pal is en route, as disclosed before you confirm.' },
  { li: 'Payments and payouts are handled by our third-party processor (Stripe). All amounts are in your local currency unless stated otherwise.' },
  { h: 'User Conduct' },
  { p: 'You agree not to:' },
  { li: 'Request or perform anything illegal, dangerous, or that violates these Terms.' },
  { li: 'Harass, threaten, defraud, or discriminate against other users.' },
  { li: 'Post objectionable content or misrepresent your identity or a favor.' },
  { li: 'Circumvent the platform to avoid fees, or scrape or abuse the Service.' },
  { p: 'We use a zero-tolerance approach to objectionable content and abusive behavior. You can report or block users in the app, and we may remove content or suspend accounts that violate these Terms.' },
  { h: 'Assumption of Risk' },
  { p: 'Favors take place in the real world and involve people We do not control. You understand and voluntarily accept the risks of requesting or performing Favors, including meeting other users, entering homes or vehicles, and handling goods or money. You are responsible for using good judgment, following local laws, and taking sensible safety precautions. My Favor does not supervise Favors and is not responsible for the conduct of any User.' },
  { h: 'Favors Are Between Users' },
  { p: 'Members and Pals are independent of My Favor and of each other. We do not guarantee the quality, safety, legality, or completion of any favor. Use good judgment and follow local laws.' },
  { h: 'Disclaimers & Limitation of Liability' },
  { p: 'The Service is provided "as is" and "as available" without warranties of any kind, whether express or implied, including any implied warranty of merchantability or fitness for a particular purpose. To the maximum extent permitted by law, My Favor is not liable for any indirect, incidental, special, consequential, or punitive damages, or for the acts or omissions of any User. Where our liability cannot be excluded, it is limited to the greater of the fees you paid to My Favor in the three months before the event giving rise to the claim, or USD 100.' },
  { h: 'Indemnification' },
  { p: 'You agree to indemnify and hold harmless My Favor and its officers, employees, and agents from any claim, damage, loss, or expense (including reasonable legal fees) arising out of your use of the Service, your Content, the Favors you request or perform, or your breach of these Terms or the law.' },
  { h: 'Governing Law' },
  { p: `These Terms are governed by the laws of ${LEGAL_ENTITY}, without regard to conflict-of-laws rules. Except where mandatory local consumer law provides otherwise, the courts of that jurisdiction have exclusive jurisdiction over any dispute arising from these Terms or the Service.` },
  { h: 'Dispute Resolution' },
  { p: `If a dispute arises, please contact Us first at ${CONTACT_EMAIL} so We can try to resolve it informally. If We cannot resolve it within 30 days, the dispute will be settled by binding arbitration or by the competent courts of the governing-law jurisdiction, to the extent permitted by law. Where required by local law, you keep the right to bring qualifying claims in small-claims court and any non-waivable right to participate in class or representative proceedings.` },
  { h: 'Termination' },
  { p: 'You may stop using the Service and delete your account at any time from Settings. We may suspend or terminate accounts that violate these Terms or the law. Provisions that by their nature should survive termination — including payment obligations, disclaimers, limitation of liability, indemnification, and governing law — will survive.' },
  { h: 'Changes to These Terms' },
  { p: 'We may update these Terms and will revise the effective date above. Material changes will be notified in the app. Continued use after changes means you accept the updated Terms.' },
  { h: 'Contact' },
  { p: `Questions about these Terms? Email us at ${CONTACT_EMAIL}, or write to ${LEGAL_ENTITY}.` },
];

const PRIVACY: Block[] = [
  { p: 'This Privacy Policy describes Our policies and procedures on the collection, use, and disclosure of Your information when You use the Service, and tells You about Your privacy rights and how the law protects You.' },
  { p: 'We use Your Personal Data to provide and improve the Service. By using the Service, You agree to the collection and use of information in accordance with this Privacy Policy.' },
  { h1: 'Interpretation and Definitions' },
  { h: 'Interpretation' },
  { p: 'The words of which the initial letter is capitalized have meanings defined under the following conditions. The following definitions have the same meaning whether they appear in singular or in plural.' },
  { h: 'Definitions' },
  { p: 'For the purposes of this Privacy Policy:' },
  { li: `Company (referred to as "We", "Us", or "Our") means ${LEGAL_ENTITY}, the operator of My Favor.` },
  { li: 'Service means the My Favor Application, marketplace, website, and related services.' },
  { li: 'User (or "You") means any individual who uses the Service, whether as a Favor Member, a Favor Pal, or both.' },
  { li: 'Favor Member (or "Member") means a User who requests a Favor through the Service.' },
  { li: 'Favor Pal (or "Pal") means an independent User who accepts and performs a Favor.' },
  { li: 'Personal Data means any information relating to an identified or identifiable individual, such as your name, email address, phone number, or location.' },
  { li: 'Usage Data means information collected automatically when You use the Service, such as device type, app version, and diagnostic logs.' },
  { h: 'Information We Collect' },
  { p: 'We collect information you provide and information generated as you use the Service:' },
  { li: 'Account details — name, email address, phone number, and password.' },
  { li: 'Profile content — profile photo and any details you add.' },
  { li: 'Favor activity — favor requests, descriptions, photos you attach, prices, addresses, and messages exchanged with other users.' },
  { li: 'Location — a delivery/service address you enter, and (with your permission) approximate device location to match nearby Favor Pals.' },
  { li: 'Payment information — processed by our payment provider (Stripe). We receive limited details such as the card brand and last four digits; we do not store full card numbers.' },
  { li: 'Device & usage data — app version, device type, and diagnostic logs used to keep the Service reliable.' },
  { h: 'How We Use Information' },
  { li: 'To create and manage your account and match Members with Favor Pals.' },
  { li: 'To process payments, payouts, fees, and refunds.' },
  { li: 'To enable messaging, notifications, and support.' },
  { li: 'To keep the Service safe — detecting fraud, abuse, and policy violations.' },
  { li: 'To comply with legal obligations.' },
  { h: 'How We Share Information' },
  { li: 'With other users as needed to complete a favor (e.g. a Member’s first name, request details, and address are shared with the assigned Pal).' },
  { li: 'With service providers that operate the Service on our behalf (payments, hosting, notifications, identity verification).' },
  { li: 'When required by law, or to protect the rights and safety of users and the public.' },
  { p: 'We do not sell your personal information.' },
  { h: 'Your Choices & Rights' },
  { li: 'Account deletion — you can permanently delete your account and associated data at any time from Settings ▸ Delete Account.' },
  { li: 'Permissions — you can grant or revoke camera, photo, location, and notification access in your device settings.' },
  { li: 'Access & correction — you may request a copy or correction of your data by contacting us.' },
  { p: 'Depending on where you live, you may have additional rights under laws such as the GDPR or CCPA. Contact us to exercise them.' },
  { h: 'Data Retention & Security' },
  { p: 'We retain information for as long as your account is active or as needed to provide the Service and meet legal obligations, then delete or anonymize it. We use administrative and technical safeguards to protect your data, though no method of transmission is completely secure.' },
  { h: 'Children' },
  { p: 'My Favor is intended for users 18 and older. We do not knowingly collect information from children.' },
  { h: 'Changes to This Policy' },
  { p: 'We may update this policy and will revise the effective date above. Material changes will be communicated in the app.' },
  { h: 'Contact' },
  { p: `Questions about privacy? Email us at ${CONTACT_EMAIL}.` },
];

// --- Minimal HTML rendering (no template engine; escaped where dynamic) -----

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderBlocks(blocks: Block[]): string {
  const out: string[] = [];
  let inList = false;
  for (const b of blocks) {
    if ('li' in b) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${esc(b.li)}</li>`);
      continue;
    }
    if (inList) { out.push('</ul>'); inList = false; }
    if ('h1' in b) out.push(`<h2>${esc(b.h1)}</h2>`);
    else if ('h' in b) out.push(`<h3>${esc(b.h)}</h3>`);
    else out.push(`<p>${esc(b.p)}</p>`);
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ${esc(COMPANY)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         max-width: 720px; margin: 0 auto; padding: 24px 20px 64px; color: #111; line-height: 1.6; }
  h1 { font-size: 2rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1.4rem; margin-top: 2rem; }
  h3 { font-size: 1.15rem; margin-top: 1.5rem; }
  .updated { color: #666; margin-bottom: 2rem; }
  .brand { color: #ED1C24; font-weight: 700; }
  footer { margin-top: 3rem; color: #888; font-size: 0.85rem; }
  a { color: #0452A5; }
</style>
</head>
<body>
<p class="brand">${esc(COMPANY)}</p>
<h1>${esc(title)}</h1>
<p class="updated">Last updated: ${esc(LAST_UPDATED)}</p>
${body}
<footer>© 2026 ${esc(COMPANY)} · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms &amp; Conditions</a> · <a href="/support">Support</a></footer>
</body>
</html>`;
}

// Rendered once at module load — these are static documents.
const PRIVACY_HTML = page('Privacy Policy', renderBlocks(PRIVACY));
const TERMS_HTML = page('Terms and Conditions', renderBlocks(TERMS));
const SUPPORT_HTML = page(
  'Support',
  `<p>Need help with ${esc(COMPANY)}? We're happy to assist with your account, favors, payments, or anything else.</p>
   <ul>
     <li>Email us at <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a> — we respond within 1–2 business days.</li>
     <li>In the app: Settings &#9656; Help &amp; Support.</li>
     <li>To delete your account and data: Settings &#9656; Delete Account (immediate, permanent).</li>
   </ul>`,
);

export const legalRouter = Router();
legalRouter.get('/privacy', (_req, res) => res.type('html').send(PRIVACY_HTML));
legalRouter.get('/terms', (_req, res) => res.type('html').send(TERMS_HTML));
legalRouter.get('/support', (_req, res) => res.type('html').send(SUPPORT_HTML));
