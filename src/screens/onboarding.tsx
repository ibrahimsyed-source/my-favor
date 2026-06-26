import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Txt, Button, TopBar, InfoModal } from '../components';
import { useTheme, fonts, tokens } from '../theme';
import { useStore } from '../store';

// Assets ----------------------------------------------------------------------
const logo = require('../../assets/img/logo.png');
const launchPeople = require('../../assets/img/onboarding/launch-people.png');
const welcomeMower = require('../../assets/img/onboarding/welcome-mower.png');

// Shared 3-dot carousel indicator. Active dot = solid black, inactive = gray ring.
function PagerDots({ index }: { index: number }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Onboarding, step ${index + 1} of 3`}
      style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }}
    >
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          importantForAccessibility="no"
          style={{
            width: 11,
            height: 11,
            borderRadius: 6,
            backgroundColor: i === index ? '#141414' : 'transparent',
            borderWidth: i === index ? 0 : 1.5,
            borderColor: '#C7C7C7',
          }}
        />
      ))}
    </View>
  );
}

// 1. Launch — splash: logo, two characters, "My Favor" wordmark, dots (1st active).
export function Launch({ navigation }: any) {
  return (
    <Screen padded={false}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => navigation.navigate('Welcome')}
        accessibilityRole="button"
        accessibilityLabel="Get started"
        accessibilityHint="Opens the welcome screen"
        style={{ flex: 1, paddingHorizontal: 24, paddingBottom: 28, alignItems: 'center' }}
      >
        <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <Image source={logo} style={{ width: 150, height: 150, marginBottom: 28 }} resizeMode="contain" />
          <Image
            source={launchPeople}
            style={{ width: 250, height: 290, marginBottom: 20 }}
            resizeMode="contain"
          />
          <Txt variant="display" center style={{ fontSize: 44, lineHeight: 54 }}>
            My Favor
          </Txt>
        </View>
        <PagerDots index={0} />
      </TouchableOpacity>
    </Screen>
  );
}

// 2. Welcome — lawnmower hero, headline w/ green $$, two role buttons, dots (2nd active).
export function Welcome({ navigation }: any) {
  const { theme } = useTheme();
  const s = useStore();

  // Record the role the user wants. Pre-auth `setRole` is a no-op (there's no
  // user yet), so this only "sticks" once a user exists; the choice is honored
  // for real at the post-auth Vetting gate (pal) — see Vetting below. A fuller
  // fix would persist an intendedRole on the store and apply it in verifyOtp/login.
  const pick = (role: 'member' | 'pal') => {
    s.setRole(role);
    navigation.navigate('SignupLogin');
  };

  return (
    <Screen padded={false}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 28 }}>
        <Image
          source={welcomeMower}
          style={{ width: '100%', height: 300, marginTop: 8 }}
          resizeMode="contain"
        />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Txt variant="body" center style={{ fontSize: 28, lineHeight: 40 }}>
            Ask for all the favors you need, or earn{' '}
            <Text style={{ color: theme.success, fontFamily: fonts.bodyBold }}>$$</Text> doing favors for others.
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
          <Button
            title="ASK A FAVOR"
            variant="primary"
            onPress={() => pick('member')}
            style={{ flex: 1, paddingHorizontal: 8 }}
          />
          <Button
            title="BE A FAVOR PAL"
            variant="secondary"
            onPress={() => pick('pal')}
            style={{ flex: 1, paddingHorizontal: 8 }}
          />
        </View>
        <PagerDots index={1} />
      </View>
    </Screen>
  );
}

// 3. SignupLogin — logo + wordmark, stacked LOGIN/SIGNUP buttons, dots (3rd active).
export function SignupLogin({ navigation }: any) {
  return (
    <Screen padded={false}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingBottom: 28, alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <Image source={logo} style={{ width: 150, height: 150, marginBottom: 24 }} resizeMode="contain" />
          <Txt variant="display" center style={{ fontSize: 44, lineHeight: 54 }}>
            My Favor
          </Txt>
        </View>
        <View style={{ width: '100%', gap: 14, marginBottom: 24 }}>
          <Button title="LOGIN" variant="primary" onPress={() => navigation.navigate('Login')} />
          <Button title="SIGNUP" variant="secondary" onPress={() => navigation.navigate('Signup')} />
        </View>
        <PagerDots index={2} />
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
// also flips the user into pal mode + online (the "go online" commitment), which
// is where the Welcome "BE A FAVOR PAL" choice actually carries through, since
// the pre-auth role pick can't persist through the locked signup store.
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
    // The pal's role intent finally lands here (post-auth, so it persists), and
    // completing the gate is what puts them online and ready to receive favors.
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
