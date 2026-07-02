import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Share, ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Txt, Button, TopBar, InfoModal } from '../components';
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
// Buttons in all three frames: 48pt tall, 6pt corner radius.
const BTN = { height: 48, borderRadius: 6 } as const;

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

// 1. Launch (v.2 #125:8371) — page 1 of the carousel: red "f" logo card top-center,
//    two illustrated people mid, "My Favor" wordmark near the bottom, dots ●○○.
//    Auto-advances to page 2 after a beat; tap anywhere to skip the wait.
export function Launch({ navigation }: any) {
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
        style={{ flex: 1, alignItems: 'center', paddingBottom: 73 }}
      >
        <Image source={logo} style={{ width: 156, height: 156, marginTop: 68 }} resizeMode="contain" />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' }}>
          {/* Woman (thumbs-up) + man, feet aligned, 15pt apart (no overlap in the frame). */}
          <Image source={personLeft} style={{ width: 131, height: 341 }} resizeMode="contain" />
          <Image source={personRight} style={{ width: 160, height: 355, marginLeft: 15 }} resizeMode="contain" />
        </View>
        <Txt center style={{ ...WORDMARK, marginTop: 44 }}>My Favor</Txt>
        <Dots active={0} navigation={navigation} style={{ marginTop: 44 }} />
      </TouchableOpacity>
    </Screen>
  );
}

// 2. Welcome (v.2 #125:8386) — page 2: lawn-mowing illustration, the value-prop
//    headline (bold "$$"), and the two paths side by side. Dots ○●○.
export function Welcome({ navigation }: any) {
  return (
    <Screen padded={false}>
      <View style={{ flex: 1, paddingHorizontal: 23, paddingBottom: 73 }}>
        <Image
          source={welcomeMower}
          style={{ width: '100%', height: 349, marginTop: 46.5 }}
          resizeMode="contain"
        />
        {/* Line breaks mirror the frame's 4-line rag; "$$" is the only bold run.
            Poppins_500Medium is registered in App.tsx but not yet exposed on the
            `fonts` token map (see foundationRequests) — literal until then. */}
        <Txt center style={{ fontFamily: 'Poppins_500Medium', fontSize: 34, lineHeight: 48, color: INK, marginTop: 42 }}>
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
        <Dots active={1} navigation={navigation} style={{ marginTop: 39 }} />
      </View>
    </Screen>
  );
}

// 3. SignupLogin (v.2 #125:8404) — page 3: logo card + wordmark up top, then the
//    stacked SHARE THIS APP / SIGNUP / LOGIN buttons anchored at the bottom. Dots ○○●.
export function SignupLogin({ navigation }: any) {
  const onShare = () => {
    Share.share({
      message: 'Join me on My Favor — ask for all the favors you need, or earn $$ doing favors for others!',
    }).catch(() => {});
  };
  return (
    <Screen padded={false}>
      <View style={{ flex: 1, paddingHorizontal: 23, paddingBottom: 73 }}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Image source={logo} style={{ width: 156, height: 156, marginTop: 85 }} resizeMode="contain" />
          <Txt center style={{ ...WORDMARK, fontSize: 48, lineHeight: 63, marginTop: 43 }}>My Favor</Txt>
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
// 4. Vetting — pal identity + background verification gate.
//
// A real launch wires ID + selfie + background-check vendors here; this is a
// faithful MOCK of that gate. Strangers enter members' homes, so a pal must
// clear all three checks before they can go online to earn. Completing the gate
// flips the user into pal mode + online (the "go online" commitment).
//
// REACHABILITY: this is the informational verification step for pal sign-ups —
// Welcome routes pals here once the navigator exposes it. True gating, though,
// can't be enforced from the client alone: it needs a persisted server-side
// `palVerified` flag checked in the favor accept/assign routes (and honored by
// the post-auth SetStatus "go online" path) so it can't be bypassed. That flag
// and the post-auth routing hop are DEFERRED (backend / cross-file).
// ---------------------------------------------------------------------------
type Phase = 'todo' | 'pending' | 'done';

export function Vetting({ navigation }: any) {
  const { theme } = useTheme();
  const s = useStore();

  const [idPhase, setIdPhase] = useState<Phase>('todo');
  const [selfiePhase, setSelfiePhase] = useState<Phase>('todo');
  const [bgPhase, setBgPhase] = useState<Phase>('todo');
  const [consent, setConsent] = useState(false);
  const [verified, setVerified] = useState(false);

  // Mock async checks — keep handles so we don't setState after unmount.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const runStep = (setPhase: (p: Phase) => void, ms: number) => {
    setPhase('pending');
    timers.current.push(setTimeout(() => setPhase('done'), ms));
  };

  const onId = () => idPhase === 'todo' && runStep(setIdPhase, 1200);
  const onSelfie = () => idPhase === 'done' && selfiePhase === 'todo' && runStep(setSelfiePhase, 1200);
  const onBackground = () =>
    selfiePhase === 'done' && consent && bgPhase === 'todo' && runStep(setBgPhase, 1600);

  const steps = [
    {
      key: 'id',
      icon: 'card-outline' as const,
      title: 'Verify your ID',
      phase: idPhase,
      locked: false,
      onPress: onId,
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
      phase: selfiePhase,
      locked: idPhase !== 'done',
      onPress: onSelfie,
      body: {
        todo: 'Snap a selfie so we can match it to your ID.',
        pending: 'Matching your face to your ID…',
        done: 'Selfie matched to your ID.',
      },
    },
    {
      key: 'bg',
      icon: 'shield-checkmark-outline' as const,
      title: 'Background check',
      phase: bgPhase,
      locked: selfiePhase !== 'done',
      onPress: onBackground,
      body: {
        todo: consent
          ? 'Run a standard criminal background screening.'
          : 'Give consent below, then run the screening.',
        pending: 'Running your background check…',
        done: 'Background check cleared.',
      },
    },
  ];

  const doneCount = steps.filter((st) => st.phase === 'done').length;
  const allCleared = doneCount === steps.length;

  const goOnline = () => {
    // Completing the gate persists the pal role + online status (post-auth) and
    // puts them ready to receive favors. NOTE: with no persisted `palVerified`
    // flag yet, the online state alone doesn't prove vetting was cleared —
    // enforcing that is deferred to the backend (see the header note above).
    s.setRole('pal');
    s.setStatus('online');
    setVerified(true);
  };

  const finish = () => {
    setVerified(false);
    navigation.navigate('Tabs');
  };

  return (
    <Screen padded={false}>
      <TopBar title="Get Verified" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <View style={{ flex: 1, paddingHorizontal: tokens.spacing.lg, paddingTop: tokens.spacing.base }}>
        <Txt variant="h2">Get verified to earn</Txt>
        <Txt variant="body" color={theme.textSecondary} style={{ marginTop: 8 }}>
          Favor Pals are identity-verified and background-checked before going online. It's how members
          can trust letting someone into their home.
        </Txt>
        <Txt variant="caption" color={theme.textTertiary} style={{ marginTop: 14, marginBottom: 4 }}>
          {doneCount} of {steps.length} steps complete
        </Txt>

        {steps.map((st) => {
          const needConsent = st.key === 'bg' && !consent;
          const blocked = st.locked || needConsent;
          const interactive = !blocked && st.phase === 'todo';
          const statusWord =
            st.phase === 'done'
              ? 'Completed'
              : st.phase === 'pending'
              ? 'In progress'
              : blocked
              ? 'Locked'
              : 'Ready, tap to start';
          const iconColor = blocked ? theme.textTertiary : st.phase === 'done' ? theme.success : theme.primary;
          return (
            <TouchableOpacity
              key={st.key}
              activeOpacity={interactive ? 0.7 : 1}
              disabled={!interactive}
              onPress={st.onPress}
              accessibilityRole="button"
              accessibilityLabel={`${st.title}. ${statusWord}`}
              accessibilityState={{ disabled: !interactive, busy: st.phase === 'pending', checked: st.phase === 'done' }}
              style={[styles.stepRow, { borderBottomColor: theme.divider }]}
            >
              <View
                style={[
                  styles.stepIcon,
                  { backgroundColor: st.phase === 'done' ? '#E6F9E6' : theme.surfaceAlt },
                ]}
              >
                <Ionicons name={st.icon} size={24} color={iconColor} />
              </View>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Txt variant="label">{st.title}</Txt>
                <Txt variant="bodySm" color={theme.textSecondary}>{st.body[st.phase]}</Txt>
              </View>
              {st.phase === 'done' ? (
                <Ionicons name="checkmark-circle" size={24} color={theme.success} />
              ) : st.phase === 'pending' ? (
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
          accessibilityLabel="I consent to identity verification and a background check"
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
            I consent to identity verification and a background check. This is a demo, no real data is collected.
          </Txt>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <Txt variant="caption" color={theme.textSecondary} center style={{ marginBottom: 12 }}>
          {allCleared
            ? "All checks passed, you're ready to earn."
            : "You can't receive favors until every check passes."}
        </Txt>
        <Button
          title="Go online to earn"
          uppercase={false}
          disabled={!allCleared}
          onPress={goOnline}
        />
      </View>

      <InfoModal
        visible={verified}
        title="You're verified!"
        message="Identity confirmed and background check cleared. You're now online and ready to start earning favors."
        buttonLabel="Start earning"
        onClose={finish}
      />
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
});
