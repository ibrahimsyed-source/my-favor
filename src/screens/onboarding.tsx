import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Share, ViewStyle,
  ScrollView, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Txt, Button, Field } from '../components';
import { useTheme, fonts, tokens } from '../theme';
import { useStore } from '../store';

// Assets ----------------------------------------------------------------------
const logo = require('../../assets/img/logo.png');
const personLeft = require('../../assets/img/onboarding/launch-person-left.png');
const personRight = require('../../assets/img/onboarding/launch-person-right.png');
const welcomeMower = require('../../assets/img/onboarding/welcome-mower.png');

// ---------------------------------------------------------------------------
// v.2 onboarding carousel — Launch / Welcome / SignupLogin are three routes
// styled as one pager (white bg, page-dot row at the bottom of each page).
// Dots are tappable so every page (incl. LOGIN on page 3) stays reachable.
// ---------------------------------------------------------------------------
const PAGE_ROUTES = ['Launch', 'Welcome', 'SignupLogin'] as const;

// Frame-exact colors, measured from the color-calibrated #125 captures (the REST-
// exported logo asset matches the capture pixels exactly, so hexes are document-true).
const INK = '#0D0A0A'; // near-black used for text, black buttons, active dot
const GRAY_BTN = '#E5E5E5'; // gray button fill
const DOT_BORDER = '#838383'; // inactive page-dot ring
// Buttons in all three frames: 48pt tall, 8pt corner radius (shared v.2 r8 spec).
const BTN = { height: 48, borderRadius: 8 } as const;

function Dots({ active, navigation, style }: { active: number; navigation: any; style?: ViewStyle }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, style]}>
      {PAGE_ROUTES.map((route, i) => (
        <TouchableOpacity
          key={route}
          disabled={i === active}
          onPress={() => navigation.navigate(route)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Page ${i + 1} of 3`}
          accessibilityState={{ selected: i === active }}
        >
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: i === active ? INK : 'transparent',
              borderWidth: i === active ? 0 : 2,
              borderColor: DOT_BORDER,
            }}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Wordmark — Poppins SemiBold ("My Favor"): 52pt on Launch, 48pt on Sign Up / Login.
const WORDMARK = { fontFamily: fonts.displayMedium, fontSize: 52, lineHeight: 68, color: INK } as const;

// The frames are laid out for an 896pt-tall screen. On shorter viewports the
// fixed illustration heights pushed the page dots off-screen — scale the art
// and vertical gaps down (never up) so every page keeps its dots visible.
function useSqueeze() {
  const { height } = useWindowDimensions();
  return Math.min(1, Math.max(0.55, (height - 260) / (896 - 260)));
}

// 1. Launch (v.2 #125:8371) — page 1 of the carousel: red "f" logo card top-center,
//    two illustrated people mid, "My Favor" wordmark near the bottom, dots ●○○.
//    Auto-advances to page 2 after a beat; tap anywhere to skip the wait.
export function Launch({ navigation }: any) {
  const k = useSqueeze();
  useEffect(() => {
    const t = setTimeout(() => navigation.replace('Welcome'), 1400);
    return () => clearTimeout(t);
  }, [navigation]);
  return (
    <Screen padded={false}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => navigation.replace('Welcome')}
        accessibilityRole="button"
        accessibilityLabel="Continue"
        style={{ flex: 1, alignItems: 'center', paddingBottom: 73 * k }}
      >
        <Image source={logo} style={{ width: 156 * k, height: 156 * k, marginTop: 68 * k }} resizeMode="contain" />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' }}>
          {/* Woman (thumbs-up) + man, feet aligned, 15pt apart (no overlap in the frame). */}
          <Image source={personLeft} style={{ width: 131 * k, height: 341 * k }} resizeMode="contain" />
          <Image source={personRight} style={{ width: 160 * k, height: 355 * k, marginLeft: 15 }} resizeMode="contain" />
        </View>
        <Txt center style={{ ...WORDMARK, marginTop: 44 * k }}>My Favor</Txt>
        <Dots active={0} navigation={navigation} style={{ marginTop: 44 * k }} />
      </TouchableOpacity>
    </Screen>
  );
}

// 2. Welcome (v.2 #125:8386) — page 2: lawn-mowing illustration, the value-prop
//    headline (bold "$$"), and the two paths side by side. Dots ○●○.
export function Welcome({ navigation }: any) {
  const k = useSqueeze();
  return (
    <Screen padded={false}>
      <View style={{ flex: 1, paddingHorizontal: 23, paddingBottom: 73 * k }}>
        <Image
          source={welcomeMower}
          style={{ width: '100%', height: 349 * k, marginTop: 46.5 * k }}
          resizeMode="contain"
        />
        {/* Line breaks mirror the frame's 4-line rag; "$$" is the only bold run.
            Poppins_500Medium is registered in App.tsx but not yet exposed on the
            `fonts` token map (see foundationRequests) — literal until then. */}
        <Txt center style={{ fontFamily: 'Poppins_500Medium', fontSize: 34, lineHeight: 48, color: INK, marginTop: 42 * k }}>
          {'Ask for all the\nfavors you need, or\nearn '}
          <Text style={{ fontFamily: fonts.display }}>$$</Text>
          {' doing favors\nfor others.'}
        </Txt>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            title="ASK A FAVOR"
            variant="primary"
            onPress={() => navigation.navigate('Signup')}
            style={{ ...BTN, flex: 1, paddingHorizontal: 0, backgroundColor: INK }}
          />
          <Button
            title="BE A FAVOR PAL"
            variant="secondary"
            onPress={() => navigation.navigate('Signup')}
            style={{ ...BTN, flex: 1, paddingHorizontal: 0, backgroundColor: GRAY_BTN }}
          />
        </View>
        <Dots active={1} navigation={navigation} style={{ marginTop: 39 * k }} />
      </View>
    </Screen>
  );
}

// 3. SignupLogin (v.2 #125:8404) — page 3: logo card + wordmark up top, then the
//    stacked SHARE THIS APP / SIGNUP / LOGIN buttons anchored at the bottom. Dots ○○●.
export function SignupLogin({ navigation }: any) {
  const k = useSqueeze();
  const onShare = () => {
    Share.share({
      message: 'Join me on My Favor — ask for all the favors you need, or earn $$ doing favors for others!',
    }).catch(() => {});
  };
  return (
    <Screen padded={false}>
      <View style={{ flex: 1, paddingHorizontal: 23, paddingBottom: 73 * k }}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Image source={logo} style={{ width: 156 * k, height: 156 * k, marginTop: 85 * k }} resizeMode="contain" />
          <Txt center style={{ ...WORDMARK, fontSize: 48, lineHeight: 63, marginTop: 43 * k }}>My Favor</Txt>
        </View>
        <View style={{ gap: 8 }}>
          <Button
            title="SHARE THIS APP"
            variant="ghost"
            onPress={onShare}
            style={{ ...BTN, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: INK }}
          />
          <Button
            title="SIGNUP"
            variant="secondary"
            onPress={() => navigation.navigate('Signup')}
            style={{ ...BTN, backgroundColor: GRAY_BTN }}
          />
          <Button
            title="LOGIN"
            variant="primary"
            onPress={() => navigation.navigate('Login')}
            style={{ ...BTN, backgroundColor: INK }}
          />
        </View>
        <Dots active={2} navigation={navigation} style={{ marginTop: 23 }} />
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// 4. Vetting — "Driver Information" pal background-check gate.
//
// Favor Pals enter members' homes, so a pal must pass identity + background
// vetting before they can earn. This screen collects the applicant's legal
// Personal Information (name / SSN / DOB) and walks the 5 Driver Requirements;
// submitting "Finish applying" puts the application into an Approval-pending
// state (a reviewer clears it) rather than an instant self-serve go-online.
// The checks below are a faithful MOCK of the ID/selfie/background vendors.
//
// REACHABILITY / GATING: routing pal sign-ups here, plus a persisted server-side
// `palVerified` flag that gates the favor accept/assign + "go online" paths so
// pal home stays locked until approval, is DEFERRED (backend / cross-file).
// ---------------------------------------------------------------------------
type Phase = 'todo' | 'pending' | 'done';

export function Vetting({ navigation }: any) {
  const { theme } = useTheme();
  const s = useStore();

  // Personal Information — legal identity used for the background check.
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [ssn1, setSsn1] = useState('');
  const [ssn2, setSsn2] = useState('');
  const [ssn3, setSsn3] = useState('');
  const [dob, setDob] = useState('');

  // Driver Requirements checklist (5 items required) + background-check consent.
  const [phases, setPhases] = useState<Record<string, Phase>>({
    id: 'todo', selfie: 'todo', address: 'todo', background: 'todo', agreement: 'todo',
  });
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Mock async checks — keep handles so we don't setState after unmount.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const runStep = (key: string, ms: number) => {
    setPhases((p) => ({ ...p, [key]: 'pending' }));
    timers.current.push(setTimeout(() => setPhases((p) => ({ ...p, [key]: 'done' })), ms));
  };

  const steps = [
    {
      key: 'id',
      icon: 'card-outline' as const,
      title: 'Verify your ID',
      ms: 1200,
      body: {
        todo: 'Upload a government-issued photo ID.',
        pending: 'Checking your document…',
        done: 'Government ID verified.',
      },
    },
    {
      key: 'selfie',
      icon: 'camera-outline' as const,
      title: 'Take a selfie',
      ms: 1200,
      body: {
        todo: 'Snap a selfie so we can match it to your ID.',
        pending: 'Matching your face to your ID…',
        done: 'Selfie matched to your ID.',
      },
    },
    {
      key: 'address',
      icon: 'home-outline' as const,
      title: 'Proof of address',
      ms: 1200,
      body: {
        todo: 'Upload a utility bill or lease from the last 90 days.',
        pending: 'Reviewing your document…',
        done: 'Address confirmed.',
      },
    },
    {
      key: 'background',
      icon: 'shield-checkmark-outline' as const,
      title: 'Background check',
      ms: 1600,
      body: {
        todo: consent
          ? 'Run a standard criminal background screening.'
          : 'Give consent below, then run the screening.',
        pending: 'Running your background check…',
        done: 'Background check cleared.',
      },
    },
    {
      key: 'agreement',
      icon: 'document-text-outline' as const,
      title: 'Sign your pal agreement',
      ms: 1000,
      body: {
        todo: 'Review and accept the Favor Pal agreement.',
        pending: 'Recording your signature…',
        done: 'Pal agreement signed.',
      },
    },
  ];

  const phaseOf = (key: string) => phases[key] ?? 'todo';
  const doneCount = steps.filter((st) => phaseOf(st.key) === 'done').length;
  const allCleared = doneCount === steps.length;

  const ssnComplete = ssn1.length === 3 && ssn2.length === 2 && ssn3.length === 4;
  const infoComplete = !!firstName.trim() && !!lastName.trim() && ssnComplete && !!dob.trim();
  const canSubmit = allCleared && consent && infoComplete;

  const digits = (t: string) => t.replace(/[^0-9]/g, '');

  const onStep = (index: number) => {
    const st = steps[index];
    const prevDone = index === 0 || phaseOf(steps[index - 1].key) === 'done';
    const needConsent = st.key === 'background' && !consent;
    if (prevDone && !needConsent && phaseOf(st.key) === 'todo') runStep(st.key, st.ms);
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');
    // Submit the vetting application to the server, which records the identity
    // info and (mock vendors) approves it — setting the persisted `palVerified`
    // flag that gates favor acceptance. Only then do we flip to pal mode.
    const ok = await s.submitVetting({
      legalFirstName: firstName.trim(),
      legalLastName: lastName.trim(),
      ssn: `${ssn1}${ssn2}${ssn3}`,
      dateOfBirth: dob.trim(),
      consent,
    });
    setSubmitting(false);
    if (ok) {
      s.setRole('pal');
      setSubmitted(true);
    } else {
      setSubmitError('We couldn’t submit your application. Please check your details and try again.');
    }
  };

  // Approval-pending state (post-submission): pal home stays gated until a
  // reviewer clears the application (dashboard gating deferred to the backend).
  if (submitted) {
    return (
      <Screen padded={false}>
        <View style={styles.pendingWrap}>
          <View style={[styles.pendingIcon, { backgroundColor: theme.surfaceAlt }]}>
            <Ionicons name="hourglass-outline" size={40} color={theme.primary} />
          </View>
          <Txt variant="h2" center style={{ marginTop: 24 }}>Approval pending</Txt>
          <Txt variant="body" color={theme.textSecondary} center style={{ marginTop: 12, lineHeight: 24 }}>
            Thanks for applying! We're reviewing your information and background check. We'll let you know
            as soon as you're approved to start earning as a Favor Pal.
          </Txt>
          <Button
            title="Back to dashboard"
            uppercase={false}
            onPress={() => navigation.navigate('Tabs')}
            style={{ alignSelf: 'stretch', marginTop: 32 }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={navigation.goBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={28} color={theme.text} />
        </TouchableOpacity>
        <Txt variant="h6">Driver Information</Txt>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: tokens.spacing.lg,
          paddingTop: tokens.spacing.base,
          paddingBottom: tokens.spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Txt variant="h2">Driver Information</Txt>
        <Txt variant="body" color={theme.textSecondary} style={{ marginTop: 8 }}>
          Favor Pals are identity-verified and background-checked before earning. It's how members can
          trust letting someone into their home.
        </Txt>

        {/* ---- Personal Information ---- */}
        <Txt variant="h4" style={{ marginTop: 24, marginBottom: 12 }}>Personal Information</Txt>
        <Field label="Legal first name" value={firstName} onChangeText={setFirstName} placeholder="First name" autoCapitalize="words" />
        <Field label="Legal middle name" value={middleName} onChangeText={setMiddleName} placeholder="Middle name (optional)" autoCapitalize="words" />
        <Field label="Legal last name" value={lastName} onChangeText={setLastName} placeholder="Last name" autoCapitalize="words" />

        <Txt variant="label" style={{ marginBottom: 8 }}>Social Security Number</Txt>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 3 }}>
            <Field value={ssn1} onChangeText={(t) => setSsn1(digits(t))} placeholder="XXX" keyboardType="number-pad" maxLength={3} />
          </View>
          <View style={{ flex: 2 }}>
            <Field value={ssn2} onChangeText={(t) => setSsn2(digits(t))} placeholder="XX" keyboardType="number-pad" maxLength={2} />
          </View>
          <View style={{ flex: 4 }}>
            <Field value={ssn3} onChangeText={(t) => setSsn3(digits(t))} placeholder="XXXX" keyboardType="number-pad" maxLength={4} />
          </View>
        </View>

        <Field label="Date of birth" value={dob} onChangeText={setDob} placeholder="MM/DD/YYYY" keyboardType="numbers-and-punctuation" maxLength={10} />

        {/* ---- Driver Requirements ---- */}
        <Txt variant="h4" style={{ marginTop: 8 }}>Driver Requirements</Txt>
        <Txt variant="body" color={theme.textSecondary} style={{ marginTop: 4 }}>Finish applying</Txt>
        <Txt variant="caption" color={theme.textTertiary} style={{ marginTop: 4, marginBottom: 4 }}>
          {allCleared ? 'All items complete' : `${steps.length} items required · ${doneCount} of ${steps.length} done`}
        </Txt>

        {steps.map((st, index) => {
          const phase = phaseOf(st.key);
          const prevDone = index === 0 || phaseOf(steps[index - 1].key) === 'done';
          const needConsent = st.key === 'background' && !consent;
          const blocked = !prevDone || needConsent;
          const interactive = !blocked && phase === 'todo';
          const statusWord =
            phase === 'done'
              ? 'Completed'
              : phase === 'pending'
              ? 'In progress'
              : blocked
              ? 'Locked'
              : 'Ready, tap to start';
          const iconColor = blocked ? theme.textTertiary : phase === 'done' ? theme.success : theme.primary;
          return (
            <TouchableOpacity
              key={st.key}
              activeOpacity={interactive ? 0.7 : 1}
              disabled={!interactive}
              onPress={() => onStep(index)}
              accessibilityRole="button"
              accessibilityLabel={`${st.title}. ${statusWord}`}
              accessibilityState={{ disabled: !interactive, busy: phase === 'pending', checked: phase === 'done' }}
              style={[styles.stepRow, { borderBottomColor: theme.divider }]}
            >
              <View
                style={[
                  styles.stepIcon,
                  { backgroundColor: phase === 'done' ? '#E6F9E6' : theme.surfaceAlt },
                ]}
              >
                <Ionicons name={st.icon} size={24} color={iconColor} />
              </View>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Txt variant="label">{st.title}</Txt>
                <Txt variant="bodySm" color={theme.textSecondary}>{st.body[phase]}</Txt>
              </View>
              {phase === 'done' ? (
                <Ionicons name="checkmark-circle" size={24} color={theme.success} />
              ) : phase === 'pending' ? (
                <ActivityIndicator color={theme.primary} />
              ) : blocked ? (
                <Ionicons name="lock-closed-outline" size={18} color={theme.textTertiary} />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
              )}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setConsent((c) => !c)}
          accessibilityRole="checkbox"
          accessibilityLabel="I certify my information is accurate and consent to a background check"
          accessibilityState={{ checked: consent }}
          style={styles.consentRow}
        >
          <View
            style={[
              styles.checkbox,
              { borderColor: theme.text, backgroundColor: consent ? theme.cta : 'transparent' },
            ]}
          >
            {consent ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
          </View>
          <Txt variant="bodySm" color={theme.textSecondary} style={{ flex: 1 }}>
            I certify the information above is accurate and consent to identity verification and a background check. This is a demo, no real data is collected.
          </Txt>
        </TouchableOpacity>

        <Txt variant="caption" color={theme.textSecondary} center style={{ marginTop: 8, marginBottom: 12 }}>
          {canSubmit
            ? "All set — submit your application for review."
            : 'Complete all 5 requirements and your details to finish applying.'}
        </Txt>
        {submitError ? (
          <Txt variant="caption" color={theme.danger} center style={{ marginBottom: 10 }}>{submitError}</Txt>
        ) : null}
        <Button
          title="Finish applying"
          uppercase={false}
          disabled={!canSubmit || submitting}
          loading={submitting}
          onPress={submit}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stepIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 18,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pendingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.lg,
  },
  pendingIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
