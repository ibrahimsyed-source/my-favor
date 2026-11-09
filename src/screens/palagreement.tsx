import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Poppins_400Regular } from '@expo-google-fonts/poppins';
import { useStore } from '../store';

// ===========================================================================
// PalAgreement — the independent-contractor "Favor Pal Agreement" signing gate.
//
// Reached from the Vetting checklist (onboarding.tsx): the 'agreement' step
// navigates here, and only marks done once acceptance is recorded server-side.
// This REPLACES the old 1-second mock-timer step with a real, auditable accept
// (store.acceptPalAgreement posts palAgreementAt + palAgreementVersion).
//
// DARK "Provider App v.2" design — the same fixed palette the pal screens pin
// (the app's shared useTheme() is LIGHT and only drives auth/onboarding):
//   page #0D0A0A · navy field #2E3442 · white primary button w/ black label.
//
// The agreement copy ships LOCALLY (the block list below) so the client always
// has the exact text it recorded acceptance of; a hosted /pal-agreement page
// (server legal.routes.ts) carries the same terms for the stores/legal.
// ===========================================================================

const PAGE_BG = '#0D0A0A';
const FIELD = '#2E3442';
const TEXT = '#FFFFFF';
const SUBTLE = '#B9B4B4';
const DIVIDER = 'rgba(255,255,255,0.10)';
const BORDER = 'rgba(255,255,255,0.10)';
const CTA_BG = '#FFFFFF';
const CTA_TEXT = '#0D0A0A';
const ACCENT = '#FF6B70'; // soft red (errors / accent on dark)

const P400 = 'Poppins_400Regular';
const P500 = 'Poppins_500Medium';
const P600 = 'Poppins_600SemiBold';

// Bump when the terms change materially — a pal whose recorded version no longer
// matches must re-accept (the Vetting gate compares against this).
export const PAL_AGREEMENT_VERSION = '2026-11-01';
export const PAL_AGREEMENT_TITLE = 'Favor Pal Agreement';
const LAST_UPDATED = 'Last updated: November 1, 2026';

type Block = { h: string } | { p: string } | { li: string };

// Concise independent-contractor terms — the IC language mirrors the Terms'
// "Independent-Contractor Relationship" section, scoped to a pal's commitments.
const AGREEMENT: Block[] = [
  { p: 'This Favor Pal Agreement ("Agreement") is between you and My Favor. It governs your participation as a Favor Pal and is separate from the Terms & Conditions you accepted at signup. By accepting below, you agree to the terms that follow.' },

  { h: '1. Independent-Contractor Status' },
  { p: 'You are an independent contractor, not an employee, agent, partner, or joint venturer of My Favor. You decide whether, when, where, and how to accept and perform favors, using your own judgment, skills, and means. Nothing in this Agreement creates an employment, agency, partnership, or franchise relationship.' },

  { h: '2. No Employee Benefits' },
  { p: 'Because you are not an employee, you are not entitled to employee benefits of any kind — including minimum wage, overtime, paid leave, health coverage, workers’ compensation, or unemployment insurance — and no payroll taxes are withheld on your behalf.' },

  { h: '3. Taxes, Licenses & Insurance' },
  { li: 'You are solely responsible for reporting and paying all taxes on amounts you earn, including self-employment taxes.' },
  { li: 'You are responsible for obtaining any licenses, permits, or registrations your favors require by law.' },
  { li: 'You are responsible for carrying any insurance appropriate to the favors you choose to perform.' },

  { h: '4. Your Commitments' },
  { li: 'Perform favors you accept honestly, safely, lawfully, and with reasonable care.' },
  { li: 'Communicate promptly and treat members and other users with respect — no harassment, discrimination, threats, or fraud.' },
  { li: 'Provide accurate information about yourself and never misrepresent your identity or a favor.' },
  { li: 'Decline or stop any favor that is unsafe, unlawful, or beyond what you can reasonably do.' },

  { h: '5. Background Check & Eligibility' },
  { p: 'You must be at least 18 years old and pass identity verification and a background check to earn as a Favor Pal. You agree to keep your information current, and My Favor may re-verify eligibility or suspend participation to protect the safety of the community.' },

  { h: '6. Payments & Platform Commission' },
  { p: 'For each completed favor you receive the favor price minus My Favor’s platform commission, as disclosed in the app before you accept. Payments and payouts are handled by our third-party processor. You are paid only for favors actually completed and released.' },

  { h: '7. Assumption of Risk & Responsibility' },
  { p: 'Favors happen in the real world and may involve entering homes or vehicles, meeting other people, and handling goods or money. You voluntarily accept these risks, agree to use good judgment and follow local laws, and remain responsible for your own acts and omissions while performing favors.' },

  { h: '8. Termination' },
  { p: 'You may stop performing favors at any time. My Favor may suspend or end your participation if you violate this Agreement, the Terms & Conditions, or the law. Provisions that by their nature should survive — including tax responsibility, assumption of risk, and payment terms for completed favors — survive termination.' },

  { h: '9. Acknowledgement' },
  { p: 'You acknowledge that you have read and understood this Agreement, that you are entering into it as an independent contractor, and that you agree to be bound by its terms.' },
];

function usePoppins() {
  // 500/600 are registered app-wide in App.tsx; load 400 locally (same pattern
  // the other v.2 dark screens use).
  const [loaded] = useFonts({ Poppins_400Regular });
  return loaded;
}

export const PalAgreement = ({ navigation }: any) => {
  const s = useStore();
  const fontsLoaded = usePoppins();
  // Pre-check when this pal already accepted THIS version — re-signing is still
  // explicit, but the box reflects the recorded state.
  const alreadyAccepted =
    !!s.user?.palAgreementAt && s.user?.palAgreementVersion === PAL_AGREEMENT_VERSION;
  const [checked, setChecked] = useState(alreadyAccepted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onAgree = async () => {
    if (!checked || busy) return;
    setBusy(true);
    setError('');
    // Honest result: only proceed once the server CONFIRMED acceptance — the
    // Vetting gate reads the stamped palAgreementAt/Version back off the user.
    const ok = await s.acceptPalAgreement(PAL_AGREEMENT_VERSION);
    setBusy(false);
    if (ok) navigation.goBack();
    else setError('We couldn’t record your acceptance. Please check your connection and try again.');
  };

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: PAGE_BG }} />;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: PAGE_BG }}>
      {/* Header — close + centered title */}
      <View style={st.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={28} color={TEXT} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>{PAL_AGREEMENT_TITLE}</Text>
        <View style={{ width: 28 }} />
      </View>
      <View style={st.divider} />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28 }}>
        <Text style={st.docTitle}>Favor Pal Independent-Contractor Agreement</Text>
        <Text style={st.updated}>{LAST_UPDATED} · Version {PAL_AGREEMENT_VERSION}</Text>

        {AGREEMENT.map((b, i) => {
          if ('h' in b) {
            return <Text key={i} style={st.sectionHeading}>{b.h}</Text>;
          }
          if ('li' in b) {
            return (
              <View key={i} style={st.bulletRow}>
                <Text style={st.bulletDot}>{'•'}</Text>
                <Text style={[st.body, { flex: 1 }]}>{b.li}</Text>
              </View>
            );
          }
          return <Text key={i} style={[st.body, { marginTop: 14 }]}>{b.p}</Text>;
        })}
      </ScrollView>

      {/* Footer — explicit checkbox + AGREE & CONTINUE */}
      <View style={st.footer}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setChecked((c) => !c)}
          accessibilityRole="checkbox"
          accessibilityLabel="I have read and agree to the Favor Pal Agreement"
          accessibilityState={{ checked }}
          style={st.checkRow}
        >
          <View style={[st.checkbox, checked && st.checkboxOn]}>
            {checked ? <Ionicons name="checkmark" size={16} color={CTA_TEXT} /> : null}
          </View>
          <Text style={st.checkLabel}>
            I have read and agree to the Favor Pal Agreement
          </Text>
        </TouchableOpacity>

        {error ? <Text style={st.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[st.whiteBtn, { opacity: checked && !busy ? 1 : 0.5 }]}
          disabled={!checked || busy}
          accessibilityRole="button"
          accessibilityLabel="Agree and continue"
          accessibilityState={{ disabled: !checked || busy, busy }}
          onPress={onAgree}
        >
          <Text style={st.whiteBtnTxt}>{busy ? 'SAVING…' : 'AGREE & CONTINUE'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const st = StyleSheet.create({
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerTitle: { color: TEXT, fontSize: 17, fontFamily: P600 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: DIVIDER },
  docTitle: { color: TEXT, fontSize: 24, lineHeight: 32, fontFamily: P600 },
  updated: { color: SUBTLE, fontSize: 13, fontFamily: P400, marginTop: 8 },
  sectionHeading: { color: TEXT, fontSize: 16, fontFamily: P500, marginTop: 24 },
  body: { color: SUBTLE, fontSize: 14, lineHeight: 22, fontFamily: P400 },
  bulletRow: { flexDirection: 'row', marginTop: 10, paddingRight: 4 },
  bulletDot: { color: SUBTLE, fontSize: 14, lineHeight: 22, fontFamily: P400, marginRight: 10 },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: DIVIDER,
    backgroundColor: PAGE_BG,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: FIELD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: CTA_BG, borderColor: CTA_BG },
  checkLabel: { color: TEXT, fontSize: 14, lineHeight: 20, fontFamily: P400, flex: 1 },
  error: { color: ACCENT, fontSize: 13, lineHeight: 19, fontFamily: P400, marginTop: 10 },
  whiteBtn: {
    backgroundColor: CTA_BG,
    borderRadius: 8,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  whiteBtnTxt: { color: CTA_TEXT, fontSize: 15, letterSpacing: 0.5, fontFamily: P500 },
});
