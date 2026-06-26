import React from 'react';
import { ScrollView, View } from 'react-native';
import { Screen, Txt, TopBar } from '../components';
import { useTheme } from '../theme';

// ===========================================================================
// Legal — Privacy Policy + Terms of Service.
//
// App Store Review (5.1.1) and Google Play both require a publicly hosted
// privacy policy URL AND in-app access to these documents. This screen serves
// the in-app copy. Before submission the SAME text must be published at a
// stable public URL (e.g. https://myfavor.app/privacy, /terms) and entered in
// App Store Connect ▸ App Privacy and the Play Console ▸ Store listing.
//
// NOTE: This is a structured template written for the prototype. Have it
// reviewed by counsel and fill in the [bracketed] business details before you
// publish or submit to the stores.
// ===========================================================================

const EFFECTIVE_DATE = 'June 2026';
const CONTACT_EMAIL = 'support@myfavor.app';
const COMPANY = 'My Favor';

type Block =
  | { h: string }            // section heading
  | { p: string }            // paragraph
  | { li: string };          // bullet item

const PRIVACY: Block[] = [
  { p: `Effective ${EFFECTIVE_DATE}. This Privacy Policy explains how ${COMPANY} ("we", "us") collects, uses, and shares information when you use the My Favor mobile app and related services (the "Service").` },

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

const TERMS: Block[] = [
  { p: `Effective ${EFFECTIVE_DATE}. These Terms of Service ("Terms") are a binding agreement between you and ${COMPANY} governing your use of the My Favor app and services (the "Service"). By creating an account you agree to these Terms.` },

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

export const Legal = ({ navigation, route }: any) => {
  const { theme } = useTheme();
  const doc: 'privacy' | 'terms' = route?.params?.doc === 'terms' ? 'terms' : 'privacy';
  const title = doc === 'terms' ? 'Terms of Service' : 'Privacy Policy';
  const blocks = doc === 'terms' ? TERMS : PRIVACY;

  return (
    <Screen padded={false}>
      <TopBar title={title} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
        <Txt variant="h2" style={{ marginBottom: 16 }}>{title}</Txt>
        {blocks.map((b, i) => {
          if ('h' in b) {
            return (
              <Txt key={i} variant="h4" style={{ marginTop: 22, marginBottom: 8 }}>
                {b.h}
              </Txt>
            );
          }
          if ('li' in b) {
            return (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 8, paddingRight: 4 }}>
                <Txt variant="body" color={theme.textSecondary} style={{ marginRight: 8 }}>•</Txt>
                <Txt variant="body" color={theme.textSecondary} style={{ flex: 1 }}>{b.li}</Txt>
              </View>
            );
          }
          return (
            <Txt key={i} variant="body" color={theme.textSecondary} style={{ marginBottom: 10 }}>
              {b.p}
            </Txt>
          );
        })}
        <Txt variant="caption" color={theme.textTertiary} style={{ marginTop: 28 }}>
          This document is provided in-app and is also available at our public website. © {EFFECTIVE_DATE} {COMPANY}.
        </Txt>
      </ScrollView>
    </Screen>
  );
};
