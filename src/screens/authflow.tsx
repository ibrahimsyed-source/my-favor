import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet, ViewStyle,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Screen, TopBar, Txt, Button, Field } from '../components';
import { useTheme, tokens, fonts } from '../theme';
import { useStore } from '../store';
import { resendOtpApi, forgotPasswordApi, resetPasswordApi } from '../api/endpoints';

const logo = require('../../assets/img/logo.png');

// Mask a phone/email destination so the OTP screen can show where the code went
// without exposing the full value (e.g. "j•••@gmail.com" / "••• ••• ••89").
const maskDestination = (d?: string): string => {
  if (!d) return '';
  if (d.includes('@')) {
    const [local, domain] = d.split('@');
    return `${local.slice(0, 1)}${'•'.repeat(Math.max(local.length - 1, 2))}@${domain}`;
  }
  const digits = d.replace(/\D/g, '');
  return digits.length >= 2 ? `••• ••• ••${digits.slice(-2)}` : '•••';
};

// ---------------------------------------------------------------------------
// Shared building blocks (match the auth-form language: bold label above a
// filled light-gray box with ~12px radius, gray placeholder text).
// ---------------------------------------------------------------------------
const FieldBox: React.FC<{ label?: string; children: React.ReactNode; style?: ViewStyle }> = ({
  label, children, style,
}) => {
  const { theme } = useTheme();
  return (
    <View style={{ marginBottom: tokens.spacing.base }}>
      {label ? <Txt variant="label" style={{ marginBottom: 8 }}>{label}</Txt> : null}
      <View style={[styles.box, { backgroundColor: theme.inputBg }, style]}>{children}</View>
    </View>
  );
};

// Filled field with an eye toggle on the right (password inputs).
const PasswordField: React.FC<{
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}> = ({ label, value, onChangeText, placeholder }) => {
  const { theme } = useTheme();
  const [show, setShow] = useState(false);
  return (
    <FieldBox label={label}>
      <TextInput
        style={{ flex: 1, color: theme.text, fontSize: 16 }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity onPress={() => setShow((v) => !v)} hitSlop={10}>
        <Ionicons name={show ? 'eye-off' : 'eye'} size={20} color={theme.text} />
      </TouchableOpacity>
    </FieldBox>
  );
};

// ---------------------------------------------------------------------------
// 1. Login — credential form reached from the onboarding "SignupLogin" screen.
//    (The figma "Login" frame duplicates the welcome splash; the real login
//    form is described by the spec: email + password + forgot-password link.)
// ---------------------------------------------------------------------------
export const Login = ({ navigation }: any) => {
  const { theme } = useTheme();
  const s = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Guard against double-taps. On success the store sets the user, which flips
  // isAuthenticated and swaps the navigator to Tabs automatically — so there's
  // no explicit navigate here. On failure we surface an inline error.
  const onLogin = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const r = await s.login(email, password);
      if (r === 'unverified') {
        // Correct password but the account was never verified — route the user
        // to OTP (same param shape the signup flow uses) instead of falsely
        // claiming bad credentials.
        navigation.navigate('OtpVerify', { destination: email.trim().toLowerCase() });
      } else if (r === 'invalid') {
        setError('Invalid email or password.');
      }
    } catch (e) {
      setError('Could not sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen padded={false}>
      <TopBar title="Login" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: tokens.spacing.lg, paddingBottom: tokens.spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: 'center', marginTop: tokens.spacing.sm, marginBottom: tokens.spacing.lg }}>
          <Image source={logo} style={{ width: 88, height: 88 }} resizeMode="contain" />
        </View>
        <Txt variant="h3" center style={{ marginBottom: tokens.spacing.xl }}>
          Login to your account
        </Txt>

        <Field
          label="Email Address"
          value={email}
          onChangeText={setEmail}
          placeholder="Email Address"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <PasswordField label="Password" value={password} onChangeText={setPassword} placeholder="Password" />

        <TouchableOpacity
          onPress={() => navigation.navigate('ForgotPassword')}
          style={{ alignSelf: 'flex-end', marginTop: 2, marginBottom: tokens.spacing.sm }}
          hitSlop={8}
        >
          <Txt variant="bodySm" color={theme.link} style={{ fontFamily: fonts.bodySemiBold }}>
            Forgot Password?
          </Txt>
        </TouchableOpacity>

        {error ? (
          <Txt variant="bodySm" color={theme.danger} style={{ marginTop: tokens.spacing.sm }}>
            {error}
          </Txt>
        ) : null}

        <Button title="LOGIN" variant="primary" onPress={onLogin} loading={submitting} disabled={submitting} style={{ marginTop: tokens.spacing.base }} />

        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: tokens.spacing.xl }}>
          <Txt variant="body" color={theme.textSecondary}>Don't have an account? </Txt>
          <TouchableOpacity onPress={() => navigation.navigate('Welcome')} hitSlop={8}>
            <Txt variant="body" color={theme.link} style={{ fontFamily: fonts.bodyBold }}>Sign Up</Txt>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Screen>
  );
};

// ---------------------------------------------------------------------------
// 2. Forgot Password — single email field, black SUBMIT.
// ---------------------------------------------------------------------------
export const ForgotPassword = ({ navigation }: any) => {
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setError('Please enter a valid email address.'); return; }
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      // Generic response either way (no account-enumeration). Move to the code step.
      await forgotPasswordApi(e);
      navigation.navigate('OtpVerify', { context: 'reset', destination: e });
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen padded={false}>
      <TopBar title="Forgot Password" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: tokens.spacing.lg, paddingBottom: tokens.spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <Txt variant="h4" center style={{ fontSize: 22, lineHeight: 30, marginTop: tokens.spacing.lg, marginBottom: tokens.spacing.md }}>
          Enter Email to reset password
        </Txt>
        <Txt variant="bodySm" color={theme.textSecondary} center style={{ marginBottom: tokens.spacing.xl }}>
          We'll send a 6-digit code to reset your password.
        </Txt>
        <Field
          label="Email Address"
          value={email}
          onChangeText={(t) => { setEmail(t); setError(''); }}
          placeholder="Email Address"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        {error ? (
          <Txt variant="bodySm" color={theme.danger} style={{ marginTop: tokens.spacing.sm }}>{error}</Txt>
        ) : null}
        <View style={{ flex: 1 }} />
        <Button title={busy ? 'SENDING…' : 'SUBMIT'} variant="primary" disabled={busy} onPress={onSubmit} />
      </ScrollView>
    </Screen>
  );
};

// ---------------------------------------------------------------------------
// 3. New Password — new + confirm password (eye toggles), black SUBMIT.
// ---------------------------------------------------------------------------
export const NewPassword = ({ navigation, route }: any) => {
  const { theme } = useTheme();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const email: string | undefined = route?.params?.email;
  const code: string | undefined = route?.params?.code;

  // Verify the reset code + set the new password on the server (min length 8 to
  // match the API). Previously SUBMIT navigated to Login without changing anything.
  const onSubmit = async () => {
    if (!pw || !confirm) { setError('Please enter and confirm your new password.'); return; }
    if (pw.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (pw !== confirm) { setError('Passwords do not match.'); return; }
    if (!email || !code) { setError('Your reset link expired. Please start over.'); return; }
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await resetPasswordApi(email, code, pw);
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch (e: any) {
      setError(e?.message || 'Could not reset your password. The code may have expired.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen padded={false}>
      <TopBar title="New Password" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: tokens.spacing.lg, paddingBottom: tokens.spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <Txt variant="h4" center style={{ fontSize: 22, lineHeight: 30, marginTop: tokens.spacing.lg, marginBottom: tokens.spacing.xxl }}>
          Enter your new password
        </Txt>
        <PasswordField label="New Password" value={pw} onChangeText={(t) => { setPw(t); setError(''); }} placeholder="Enter New Password" />
        <PasswordField label="Confirm New Password" value={confirm} onChangeText={(t) => { setConfirm(t); setError(''); }} placeholder="Confirm New Password" />
        {error ? (
          <Txt variant="bodySm" color={theme.danger} style={{ marginTop: tokens.spacing.sm }}>
            {error}
          </Txt>
        ) : null}
        <View style={{ flex: 1 }} />
        <Button title={busy ? 'SAVING…' : 'SUBMIT'} variant="primary" disabled={busy} onPress={onSubmit} />
      </ScrollView>
    </Screen>
  );
};

// ---------------------------------------------------------------------------
// 4. Signup — avatar w/ red plus badge, name row, email, phone, password,
//    terms checkbox, black SIGNUP.
// ---------------------------------------------------------------------------
export const Signup = ({ navigation, route }: any) => {
  const { theme } = useTheme();
  const s = useStore();
  // Role chosen on the preceding Welcome screen (member vs pal), carried through
  // so the account is created with the role the user actually picked.
  const role = route?.params?.role;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // SIGNUP is gated on `agree`; this guard also blocks double-taps from firing
  // signup() + navigate twice. The verification code is sent to the email, so
  // OtpVerify masks that destination. A failed signup (e.g. email already in
  // use) surfaces an inline error.
  const onSignup = async () => {
    if (submitting || !agree) return;
    setSubmitting(true);
    setError('');
    try {
      await s.signup({ firstName, lastName, email, phone, password, ...(role ? { role } : {}) });
      navigation.navigate('OtpVerify', { destination: email });
    } catch (e: any) {
      setError(e?.message || 'Could not sign up. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen padded={false}>
      <TopBar title="Signup" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <ScrollView
        contentContainerStyle={{ padding: tokens.spacing.lg, paddingBottom: tokens.spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar placeholder. Photo-at-signup is out of scope (no picker wired
            here), so we render a plain, non-interactive placeholder rather than a
            fake tappable "+" badge that did nothing. */}
        <View style={{ alignItems: 'center', marginTop: tokens.spacing.sm, marginBottom: tokens.spacing.xl }}>
          <View
            style={{
              width: 140, height: 140, borderRadius: 70, backgroundColor: theme.surfaceAlt,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="person" size={62} color="#B7B7B7" />
          </View>
        </View>

        {/* First + Last name side by side */}
        <View style={{ flexDirection: 'row', gap: tokens.spacing.base }}>
          <View style={{ flex: 1 }}>
            <Field label="First Name" value={firstName} onChangeText={setFirstName} placeholder="First Name" autoCapitalize="words" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Last Name" value={lastName} onChangeText={setLastName} placeholder="Last Name" autoCapitalize="words" />
          </View>
        </View>

        <Field
          label="Email Address"
          value={email}
          onChangeText={setEmail}
          placeholder="Email Address"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        {/* Phone with a fixed US +1 prefix. Non-interactive (there's no country
            picker), and uses plain "US" rather than the regional-indicator flag
            emoji, which degrades to bare letters on Windows/web and to tofu boxes
            on some Android builds — matching profile.tsx's PhoneField. */}
        <FieldBox label="Phone Number">
          <View
            style={{ flexDirection: 'row', alignItems: 'center' }}
            accessibilityLabel="Country code, United States, plus 1"
          >
            <Txt color={theme.text} style={{ fontSize: 13, fontFamily: fonts.bodyBold }}>US</Txt>
            <Txt color={theme.text} style={{ fontSize: 16, marginLeft: 8, marginRight: 4 }}>+1</Txt>
            <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
            <View style={{ width: 1, height: 24, backgroundColor: theme.divider, marginHorizontal: 12 }} />
          </View>
          <TextInput
            style={{ flex: 1, color: theme.text, fontSize: 16 }}
            value={phone}
            onChangeText={setPhone}
            placeholder="0000 - 000 - 000"
            placeholderTextColor={theme.textTertiary}
            keyboardType="phone-pad"
          />
        </FieldBox>

        <PasswordField label="Set Password" value={password} onChangeText={setPassword} placeholder="Set Password" />

        {/* Terms checkbox — SIGNUP is gated on this. The "Terms & Conditions"
            span itself opens a plain-language summary. */}
        <TouchableOpacity
          onPress={() => setAgree((v) => !v)}
          activeOpacity={0.7}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agree }}
          accessibilityLabel="I agree to Terms and Conditions"
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: tokens.spacing.sm, marginBottom: tokens.spacing.lg }}
        >
          <View
            style={{
              width: 24, height: 24, borderRadius: 5, borderWidth: 2, borderColor: theme.cta,
              alignItems: 'center', justifyContent: 'center', marginRight: tokens.spacing.md,
              backgroundColor: agree ? theme.cta : 'transparent',
            }}
          >
            {agree ? <Ionicons name="checkmark" size={16} color={theme.ctaText} /> : null}
          </View>
          <Txt variant="body">
            I agree to the{' '}
            <Text
              style={{ fontFamily: fonts.bodyBold, color: theme.text }}
              onPress={(e) => { e.stopPropagation?.(); navigation.navigate('Legal', { doc: 'terms' }); }}
              accessibilityRole="link"
              accessibilityLabel="View Terms of Service"
            >
              Terms
            </Text>
            {' '}&amp;{' '}
            <Text
              style={{ fontFamily: fonts.bodyBold, color: theme.text }}
              onPress={(e) => { e.stopPropagation?.(); navigation.navigate('Legal', { doc: 'privacy' }); }}
              accessibilityRole="link"
              accessibilityLabel="View Privacy Policy"
            >
              Privacy Policy
            </Text>
          </Txt>
        </TouchableOpacity>

        {error ? (
          <Txt variant="bodySm" color={theme.danger} style={{ marginBottom: tokens.spacing.sm }}>
            {error}
          </Txt>
        ) : null}

        <Button
          title="SIGNUP"
          variant="primary"
          onPress={onSignup}
          loading={submitting}
          disabled={!agree || submitting}
        />
      </ScrollView>
    </Screen>
  );
};

// ---------------------------------------------------------------------------
// 5. OtpVerify — centered white modal card over a dim background. Four
//    auto-advancing single-digit boxes, Resend, black VERIFY.
// ---------------------------------------------------------------------------
const OTP_SECONDS = 43;

export const OtpVerify = ({ navigation, route }: any) => {
  const { theme } = useTheme();
  const s = useStore();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(OTP_SECONDS);
  const inputs = useRef<Array<TextInput | null>>([]);
  const dest: string | undefined = route?.params?.destination;
  const isReset = route?.params?.context === 'reset';
  const maskedDest = maskDestination(dest);

  // Real countdown (was a frozen "00:43" string). Ticks down to 0, then stops
  // and unlocks Resend.
  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((sec) => sec - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const fmt = (sec: number) =>
    `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

  const setDigit = (i: number, v: string) => {
    const ch = v.replace(/[^0-9]/g, '').slice(-1);
    setError('');
    setNotice('');
    setCode((prev) => {
      const next = [...prev];
      next[i] = ch;
      return next;
    });
    if (ch && i < 5) inputs.current[i + 1]?.focus();
  };

  const onKeyPress = (i: number, e: any) => {
    if (e.nativeEvent.key === 'Backspace' && !code[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  // Branch on verifyOtp's boolean: a wrong/short code returns false -> inline
  // error (no dead-end). On success the store sets the user, which swaps the
  // navigator to Tabs automatically, so no explicit navigate is needed. Also
  // guards double-taps.
  const onVerify = async () => {
    if (submitting) return;
    const full = code.join('');
    if (full.length < 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }
    // Password reset: the code is verified server-side by reset-password (with the
    // new password), so here we just carry the code forward to the next step.
    if (isReset) {
      navigation.navigate('NewPassword', { email: dest, code: full });
      return;
    }
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const ok = await s.verifyOtp(full);
      if (!ok) {
        setError('Incorrect or expired code. Please enter the full 6-digit code.');
        return;
      }
    } catch (e) {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Working Resend: actually requests a fresh code from the backend (so an
  // expired code is replaced), then clears the boxes, restarts the countdown,
  // and surfaces a brief "code sent" confirmation. Disabled until the current
  // code expires.
  const onResend = async () => {
    if (seconds > 0 || resending) return;
    setResending(true);
    setError('');
    setNotice('');
    try {
      if (dest) await (isReset ? forgotPasswordApi(dest) : resendOtpApi(dest, 'signup'));
      setCode(['', '', '', '', '', '']);
      setSeconds(OTP_SECONDS);
      setNotice('A new code has been sent.');
      inputs.current[0]?.focus();
    } catch (e) {
      setError('Could not resend the code. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const onClose = () => {
    if (navigation.canGoBack()) navigation.goBack();
  };

  return (
    <KeyboardAvoidingView
      style={styles.overlay}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={{ flex: 1, width: '100%' }} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1, justifyContent: 'center', alignItems: 'center',
            paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.xl,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            {/* Close affordance so the screen isn't a dead-end. */}
        <TouchableOpacity
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close verification"
          style={{ position: 'absolute', top: tokens.spacing.md, right: tokens.spacing.md, zIndex: 1, padding: 4 }}
        >
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </TouchableOpacity>

        <Txt variant="h1" center style={{ marginBottom: tokens.spacing.base }}>Verification</Txt>
        <Txt variant="body" center color={theme.textSecondary}>
          {isReset
            ? 'Enter the 6-digit code we sent to reset your password.'
            : 'Please enter the 6 digit code to verify your account.'}
        </Txt>
        {maskedDest ? (
          <Txt variant="bodySm" center color={theme.textSecondary} style={{ marginTop: 4 }}>
            Sent to {maskedDest}
          </Txt>
        ) : null}
        <Txt variant="body" center style={{ marginTop: tokens.spacing.base }}>
          {seconds > 0 ? `You can resend a code in ${fmt(seconds)}` : 'You can resend a code now'}
        </Txt>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: tokens.spacing.sm, marginTop: tokens.spacing.xl }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <TextInput
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              value={code[i]}
              onChangeText={(v) => setDigit(i, v)}
              onKeyPress={(e) => onKeyPress(i, e)}
              keyboardType="number-pad"
              maxLength={1}
              accessibilityLabel={`Verification code digit ${i + 1}`}
              style={[
                styles.otpBox,
                { backgroundColor: theme.inputBg, color: theme.text },
                error ? { borderWidth: 1, borderColor: theme.danger } : null,
              ]}
            />
          ))}
        </View>

        {error ? (
          <Txt variant="bodySm" center color={theme.danger} style={{ marginTop: tokens.spacing.md }}>
            {error}
          </Txt>
        ) : null}

        <Txt variant="body" center color={theme.textSecondary} style={{ marginTop: tokens.spacing.xl }}>
          Didn't receive a code?
        </Txt>
        <TouchableOpacity
          onPress={onResend}
          disabled={seconds > 0 || resending}
          hitSlop={8}
          style={{ alignSelf: 'center', marginTop: 4 }}
          accessibilityRole="button"
          accessibilityLabel="Resend code"
          accessibilityState={{ disabled: seconds > 0 || resending }}
        >
          <Txt variant="body" color={seconds > 0 || resending ? theme.textTertiary : theme.text} style={{ fontFamily: fonts.bodyBold }}>
            {resending ? 'Sending…' : 'Resend'}
          </Txt>
        </TouchableOpacity>

        {notice ? (
          <Txt variant="bodySm" center color={theme.success} style={{ marginTop: tokens.spacing.sm }}>
            {notice}
          </Txt>
        ) : null}

            <Button
              title="VERIFY"
              variant="primary"
              onPress={onVerify}
              loading={submitting}
              disabled={submitting}
              style={{ marginTop: tokens.spacing.lg }}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: tokens.radius.md,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: tokens.radius.xl,
    paddingVertical: tokens.spacing.xl,
    paddingHorizontal: tokens.spacing.xl,
  },
  otpBox: {
    width: 48,
    height: 58,
    borderRadius: tokens.radius.md,
    textAlign: 'center',
    fontSize: 24,
    fontFamily: fonts.bodyBold,
  },
});
