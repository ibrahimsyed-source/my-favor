import React from 'react';
import { ScrollView, Text, TextStyle, View, ViewStyle } from 'react-native';
import { Screen, TopBar, Txt } from '../components';
import { fonts, useTheme } from '../theme';

// ===========================================================================
// Legal — Terms & Conditions (#125:8639) + Privacy Policy (#125:8663),
// rebuilt to match the "User App v.2" Figma frames exactly.
//
// v.2 visual anatomy (both frames, 414px mocks; values measured in Figma):
//   • TopBar — arrow-back + centered title ("Terms & Conditions" / "Privacy
//     Policy") — the shared <TopBar /> matches the frames.
//   • Blue masthead #0452A5 — doc title, Montserrat SemiBold 24/29 white,
//     19px side margins (Poppins SemiBold is the app's loaded equivalent).
//   • Navy strip #253246, 51px tall, holding a #334055 "English" chip
//     (78x33, Inter Bold 16 white → Open Sans Bold here; square corners).
//   • Document heading — Montserrat SemiBold 40/49 black.
//   • "Last updated: …" + intro — Inter Regular 16/19 (terms) / mixed (privacy).
//   • Section headings — SemiBold 40 (H1 "Interpretation and Definitions")
//     and 34 (H2 "Interpretation", "Definitions").
//   • Body — Inter Regular 16/28 (terms) · 17/26 (privacy) → Open Sans here
//     (Montserrat/Inter are not bundled; Poppins/Open Sans are the app's
//     loaded look-alikes per the v.2 foundation).
//
// The frames are clipped at 936px, so only the top of each document is
// designed. Everything visible in the frame is reproduced verbatim; below
// the clip the app's real legal copy continues (per module notes). The
// same text must be published at a stable public URL before store review
// (App Store 5.1.1 / Play Store) — see previous revision notes.
// ===========================================================================

const CONTACT_EMAIL = 'support@myfavor.app';
const COMPANY = 'My Favor';

// LEGAL: The bracketed placeholder below MUST be replaced with the registered
// company legal entity, its business address, and the governing-law
// jurisdiction before publication. These Terms and this Privacy Policy are a
// good-faith plain-English draft and still require review and sign-off by
// qualified legal counsel prior to launch (App Store 5.1.1 / Play Store).
const LEGAL_ENTITY = '[Company legal entity, address, and governing-law jurisdiction — confirm with counsel]';

// Figma fills (fixed brand hexes — not themed).
const BLUE = '#0452A5'; // masthead
const STRIP = '#253246'; // language strip
const CHIP = '#334055'; // "English" chip
const INK = '#000000'; // document text (frames use pure black)
const WHITE = '#FFFFFF';

type Block =
  | { h1: string } // top-level section heading (40px)
  | { h: string } // section heading (34px)
  | { p: string } // paragraph
  | { li: string } // bullet item
  | { intro: string }; // small intro line under "Last updated" (terms)

// --- Terms and Conditions -------------------------------------------------
// Top section verbatim from frame #125:8639; app-specific terms follow the
// clipped "Definitions" section.
const TERMS: Block[] = [
  { intro: 'Please read these Terms and Conditions carefully before using Our Service. They are a binding agreement between You and My Favor.' },
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

// --- Privacy Policy ---------------------------------------------------------
// Top section verbatim from frame #125:8663 ("Definitions" directly follows
// "Interpretation" in the frame); app-specific policy follows the clip.
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

// --- Type styles (Figma: Montserrat/Inter → loaded Poppins/Open Sans) -------
const bannerTitle: TextStyle = { fontFamily: fonts.displayMedium, fontSize: 24, lineHeight: 29, color: WHITE };
const chipText: TextStyle = { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 19, color: WHITE };
const heading40: TextStyle = { fontFamily: fonts.displayMedium, fontSize: 40, lineHeight: 49, color: INK };
const heading34: TextStyle = { fontFamily: fonts.displayMedium, fontSize: 34, lineHeight: 41, color: INK };
const small16: TextStyle = { fontFamily: fonts.bodyRegular, fontSize: 16, lineHeight: 19, color: INK };

const stripStyle: ViewStyle = { backgroundColor: STRIP, height: 51, justifyContent: 'center', paddingHorizontal: 19 };
const chipStyle: ViewStyle = { backgroundColor: CHIP, height: 33, paddingHorizontal: 8, alignSelf: 'flex-start', justifyContent: 'center' };

type BlockKind = 'h1' | 'h' | 'p' | 'li' | 'intro';
const kindOf = (b: Block): BlockKind =>
  'h1' in b ? 'h1' : 'h' in b ? 'h' : 'p' in b ? 'p' : 'li' in b ? 'li' : 'intro';

// Vertical rhythm measured off the frames (gaps between element boxes).
const topMargin = (kind: BlockKind, prev: BlockKind | null, isTerms: boolean): number => {
  switch (kind) {
    case 'intro':
      return 19; // one blank 16/19 line under "Last updated" (terms)
    case 'h1':
      return 40; // intro block → "Interpretation and Definitions"
    case 'h':
      if (prev === 'h1') return isTerms ? 29 : 26; // H1 → "Interpretation"
      if (prev === 'h') return 31; // "Interpretation" → "Definitions" (privacy)
      return 44; // body → next section heading
    case 'p':
      if (prev === 'h1' || prev === 'h') return 18; // heading → first paragraph
      if (prev === 'p') return isTerms ? 28 : 26; // blank-line paragraph gap
      if (prev === 'li') return 16;
      return 26; // first paragraph (privacy, under "Last updated")
    case 'li':
      if (prev === 'li') return 8;
      if (prev === 'p') return 12;
      return 18;
  }
};

export const Legal = ({ navigation, route }: any) => {
  const { theme } = useTheme();
  const doc: 'privacy' | 'terms' = route?.params?.doc === 'terms' ? 'terms' : 'privacy';
  const isTerms = doc === 'terms';

  const cfg = isTerms
    ? {
        topTitle: 'Terms & Conditions',
        banner: 'Terms and Conditions for MyFavor App',
        bannerPadBottom: 20, // masthead 101px tall w/ 2-line title
        docTitle: 'Terms and Conditions',
        titleTop: 28,
        updated: 'Last updated: July 1, 2026',
        updatedTop: 44,
        body: { fontSize: 16, lineHeight: 28 },
        blocks: TERMS,
      }
    : {
        topTitle: 'Privacy Policy',
        // Frame text contains a double space after "Policy" — kept verbatim.
        banner: 'Privacy Policy  for MyFavor App',
        bannerPadBottom: 24, // masthead 76px tall w/ 1-line title
        docTitle: 'Privacy Policy',
        titleTop: 25,
        updated: 'Last updated: July 1, 2026',
        updatedTop: 17,
        body: { fontSize: 17, lineHeight: 26 },
        blocks: PRIVACY,
      };

  const bodyStyle: TextStyle = { fontFamily: fonts.bodyRegular, color: INK, ...cfg.body };

  let prev: BlockKind | null = null;

  return (
    <Screen padded={false}>
      <TopBar title={cfg.topTitle} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        {/* Blue masthead */}
        <View style={{ backgroundColor: BLUE, paddingHorizontal: 19, paddingTop: 23, paddingBottom: cfg.bannerPadBottom }}>
          <Text style={bannerTitle}>{cfg.banner}</Text>
        </View>

        {/* Language strip + "English" chip */}
        <View style={stripStyle}>
          <View style={chipStyle}>
            <Text style={chipText}>English</Text>
          </View>
        </View>

        {/* Document */}
        <View style={{ paddingHorizontal: 19 }}>
          <Text style={[heading40, { marginTop: cfg.titleTop }]}>{cfg.docTitle}</Text>
          <Text style={[small16, { marginTop: cfg.updatedTop }]}>{cfg.updated}</Text>

          {cfg.blocks.map((b, i) => {
            const kind = kindOf(b);
            const mt = topMargin(kind, prev, isTerms);
            prev = kind;

            if ('h1' in b) {
              return (
                <Text key={i} style={[heading40, { marginTop: mt }]}>
                  {b.h1}
                </Text>
              );
            }
            if ('h' in b) {
              return (
                <Text key={i} style={[heading34, { marginTop: mt }]}>
                  {b.h}
                </Text>
              );
            }
            if ('intro' in b) {
              return (
                <Text key={i} style={[small16, { marginTop: mt }]}>
                  {b.intro}
                </Text>
              );
            }
            if ('li' in b) {
              return (
                <View key={i} style={{ flexDirection: 'row', marginTop: mt, paddingRight: 4 }}>
                  <Text style={[bodyStyle, { marginRight: 10 }]}>•</Text>
                  <Text style={[bodyStyle, { flex: 1 }]}>{b.li}</Text>
                </View>
              );
            }
            return (
              <Text key={i} style={[bodyStyle, { marginTop: mt }]}>
                {b.p}
              </Text>
            );
          })}

          <Txt variant="caption" color={theme.textTertiary} style={{ marginTop: 32 }}>
            This document is provided in-app and is also available at our public website. © 2026 {COMPANY}.
          </Txt>
        </View>
      </ScrollView>
    </Screen>
  );
};
