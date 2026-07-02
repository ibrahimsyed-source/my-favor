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
  { intro: 'Please read these terms and conditions carefully before using Our Service.' },
  { h1: 'Interpretation and Definitions' },
  { h: 'Interpretation' },
  { p: 'The words of which the initial letter is capitalized have meanings defined under the following conditions. The following definitions shall have the same meaning regardless of whether they appear in singular or in plural.' },
  { h: 'Definitions' },
  { p: 'For the purposes of these Terms and Conditions:' },
  { li: 'Application means the software program provided by the Company downloaded by You on any electronic device, named MyFavor App.' },

  { p: `These Terms and Conditions ("Terms") are a binding agreement between you and ${COMPANY} governing your use of the MyFavor App and services (the "Service"). By creating an account you agree to these Terms.` },

  { h: 'The Service' },
  { p: 'My Favor is a marketplace that connects Members who request everyday favors and errands with Favor Pals who choose to perform them. My Favor provides the platform; it is not a party to the agreement between a Member and a Pal and does not itself perform favors.' },

  { h: 'Eligibility & Accounts' },
  { li: 'You must be at least 18 years old and able to form a binding contract.' },
  { li: 'You agree to provide accurate information and to keep your account credentials secure.' },
  { li: 'You are responsible for activity that occurs under your account.' },

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

  { h: 'Favors Are Between Users' },
  { p: 'Members and Pals are independent of My Favor and of each other. We do not guarantee the quality, safety, legality, or completion of any favor. Use good judgment and follow local laws.' },

  { h: 'Disclaimers & Limitation of Liability' },
  { p: 'The Service is provided "as is" without warranties of any kind. To the maximum extent permitted by law, My Favor is not liable for indirect, incidental, or consequential damages, or for the acts or omissions of users.' },

  { h: 'Termination' },
  { p: 'You may stop using the Service and delete your account at any time from Settings. We may suspend or terminate accounts that violate these Terms or the law.' },

  { h: 'Changes to These Terms' },
  { p: 'We may update these Terms and will revise the effective date above. Continued use after changes means you accept the updated Terms.' },

  { h: 'Contact' },
  { p: `Questions about these Terms? Email us at ${CONTACT_EMAIL}.` },
];

// --- Privacy Policy ---------------------------------------------------------
// Top section verbatim from frame #125:8663 ("Definitions" directly follows
// "Interpretation" in the frame); app-specific policy follows the clip.
const PRIVACY: Block[] = [
  { p: 'This Privacy Policy describes Our policies and procedures on the collection, use and disclosure of Your information when You use the Service and tells You about Your privacy rights and how the law protects You.' },
  { p: 'We use Your Personal data to provide and improve the Service. By using the Service, You agree to the collection and use of information in accordance with this Privacy Policy. This Privacy Policy has been created with the help of the Privacy Policy Generator.' },
  { h1: 'Interpretation and Definitions' },
  { h: 'Interpretation' },
  { h: 'Definitions' },

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
        updated: 'Last updated: March 24, 2022',
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
        updated: 'Last updated: October 08, 2021',
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
