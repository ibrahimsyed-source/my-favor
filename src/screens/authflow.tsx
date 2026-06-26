import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet, ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, TopBar, Txt, Button, Field, InfoModal } from '../components';
import { useTheme, tokens, fonts } from '../theme';
import { useStore } from '../store';

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

  // Guard against double-taps: a second tap while the (async) login is in
  // flight would fire login() + navigate twice and corrupt the stack.
  const onLogin = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await s.login(email, password);
      navigation.navigate('Tabs');
    } catch (e) {
      // Login failed — re-enable the button so the user can retry.
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
  const [email, setEmail] = useState('');
  return (
    <Screen padded={false}>
      <TopBar title="Forgot Password" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: tokens.spacing.lg, paddingBottom: tokens.spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <Txt variant="h4" center style={{ fontSize: 22, lineHeight: 30, marginTop: tokens.spacing.lg, marginBottom: tokens.spacing.xxl }}>
          Enter Email to reset password
        </Txt>
        <Field
          label="Email Address"
          value={email}
          onChangeText={setEmail}
          placeholder="Email Address"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <View style={{ flex: 1 }} />
        <Button title="SUBMIT" variant="primary" onPress={() => navigation.navigate('NewPassword')} />
      </ScrollView>
    </Screen>
  );
};

// ---------------------------------------------------------------------------
// 3. New Password — new + confirm password (eye toggles), black SUBMIT.
// ---------------------------------------------------------------------------
export const NewPassword = ({ navigation }: any) => {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
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
        <PasswordField label="New Password" value={pw} onChangeText={setPw} placeholder="Enter New Password" />
        <PasswordField label="Confirm New Password" value={confirm} onChangeText={setConfirm} placeholder="Confirm New Password" />
        <View style={{ flex: 1 }} />
        <Button title="SUBMIT" variant="primary" onPress={() => navigation.navigate('Login')} />
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
  const [termsVisible, setTermsVisible] = useState(false);

  // SIGNUP is gated on `agree`; this guard also blocks double-taps from firing
  // signup() + navigate twice. Pass the destination forward so OtpVerify can
  // tell the user (masked) where the code was sent.
  const onSignup = async () => {
    if (submitting || !agree) return;
    setSubmitting(true);
    try {
      await s.signup({ firstName, lastName, email, phone, password, ...(role ? { role } : {}) });
      navigation.navigate('OtpVerify', { destination: phone || email });
    } catch (e) {
      // Signup failed — re-enable the button so the user can retry.
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
        {/* Avatar with red plus badge */}
        <View style={{ alignItems: 'center', marginTop: tokens.spacing.sm, marginBottom: tokens.spacing.xl }}>
          <View style={{ width: 140, height: 140 }}>
            <View
              style={{
                width: 140, height: 140, borderRadius: 70, backgroundColor: theme.surfaceAlt,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="person" size={62} color="#B7B7B7" />
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              style={{
                position: 'absolute', bottom: 6, right: 2, width: 44, height: 44, borderRadius: 22,
                backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="add" size={26} color="#FFFFFF" />
            </TouchableOpacity>
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

        {/* Phone with US flag + +1 dropdown */}
        <FieldBox label="Phone Number">
          <TouchableOpacity activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 22 }}>🇺🇸</Text>
            <Txt variant="body" style={{ marginLeft: 6, marginRight: 4 }}>+1</Txt>
            <Ionicons name="chevron-down" size={16} color={theme.text} />
          </TouchableOpacity>
          <TextInput
            style={{ flex: 1, color: theme.text, fontSize: 16, marginLeft: 12 }}
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
              width: 24, height: 24, borderRadius: 5, borderWidth: 2, borderColor: theme.text,
              alignItems: 'center', justifyContent: 'center', marginRight: tokens.spacing.md,
              backgroundColor: agree ? theme.text : 'transparent',
            }}
          >
            {agree ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
          </View>
          <Txt variant="body">
            I agree to{' '}
            <Text
              style={{ fontFamily: fonts.bodyBold, color: theme.text }}
              onPress={() => setTermsVisible(true)}
              accessibilityRole="link"
              accessibilityLabel="View Terms and Conditions"
            >
              Terms &amp; Conditions
            </Text>
          </Txt>
        </TouchableOpacity>

        <Button
          title="SIGNUP"
          variant="primary"
          onPress={onSignup}
          loading={submitting}
          disabled={!agree || submitting}
        />
      </ScrollView>

      <InfoModal
        visible={termsVisible}
        title="Terms & Conditions"
        message={
          'By creating a My Favor account you agree that:\n\n' +
          '• My Favor connects Members who request favors with Favor Pals who perform them; it is not a party to that agreement.\n' +
          '• Payments are processed securely. Members are charged the favor price plus a service and transaction fee; Favor Pals are paid the favor price minus a platform commission.\n' +
          '• Cancellations may incur a fee once a Pal is on the way, as shown before you confirm.\n' +
          '• You must provide accurate information, be 18+, and treat other users respectfully.\n' +
          '• We handle your data per our Privacy Policy.\n\n' +
          'This is a summary for the prototype, not the full legal agreement.'
        }
        buttonLabel="Got it"
        onClose={() => setTermsVisible(false)}
      />
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
  const [code, setCode] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [seconds, setSeconds] = useState(OTP_SECONDS);
  const inputs = useRef<Array<TextInput | null>>([]);
  const maskedDest = maskDestination(route?.params?.destination);

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
    setCode((prev) => {
      const next = [...prev];
      next[i] = ch;
      return next;
    });
    if (ch && i < 3) inputs.current[i + 1]?.focus();
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
    setSubmitting(true);
    setError('');
    try {
      const ok = await s.verifyOtp(code.join(''));
      if (!ok) {
        setError('Incorrect code. Please enter the full 4-digit code.');
        return;
      }
    } catch (e) {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Working Resend: re-triggers the (mock) send by clearing the boxes and
  // resetting the countdown. Disabled until the current code expires.
  const onResend = () => {
    if (seconds > 0) return;
    setCode(['', '', '', '']);
    setError('');
    setSeconds(OTP_SECONDS);
    inputs.current[0]?.focus();
  };

  const onClose = () => {
    if (navigation.canGoBack()) navigation.goBack();
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.modalCard}>
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
          Please enter 4 digit code to verify your account.
        </Txt>
        {maskedDest ? (
          <Txt variant="bodySm" center color={theme.textSecondary} style={{ marginTop: 4 }}>
            Sent to {maskedDest}
          </Txt>
        ) : null}
        <Txt variant="body" center style={{ marginTop: tokens.spacing.base }}>
          {seconds > 0 ? `Code expires in ${fmt(seconds)}` : 'Code expired'}
        </Txt>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: tokens.spacing.md, marginTop: tokens.spacing.xl }}>
          {[0, 1, 2, 3].map((i) => (
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
          disabled={seconds > 0}
          hitSlop={8}
          style={{ alignSelf: 'center', marginTop: 4 }}
          accessibilityRole="button"
          accessibilityLabel="Resend code"
          accessibilityState={{ disabled: seconds > 0 }}
        >
          <Txt variant="body" color={seconds > 0 ? theme.textTertiary : theme.text} style={{ fontFamily: fonts.bodyBold }}>
            Resend
          </Txt>
        </TouchableOpacity>

        <Button
          title="VERIFY"
          variant="primary"
          onPress={onVerify}
          loading={submitting}
          disabled={submitting}
          style={{ marginTop: tokens.spacing.lg }}
        />
      </View>
    </View>
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
    backgroundColor: '#FFFFFF',
    borderRadius: tokens.radius.xl,
    paddingVertical: tokens.spacing.xl,
    paddingHorizontal: tokens.spacing.xl,
  },
  otpBox: {
    width: 64,
    height: 64,
    borderRadius: tokens.radius.md,
    textAlign: 'center',
    fontSize: 26,
    fontFamily: fonts.bodyBold,
  },
});
