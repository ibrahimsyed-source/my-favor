import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet, ViewStyle,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Screen, TopBar, Txt, Button } from '../components';
import { useTheme, tokens, fonts } from '../theme';
import { useStore } from '../store';
import { verifyOtpApi, resendOtpApi, forgotPasswordApi, resetPasswordApi } from '../api/endpoints';

// ---------------------------------------------------------------------------
// User App v.2 auth flow.
//
// Frames: Login #125:11391 (+ Filled #125:11413), Sign Up - Empty #125:8421
// (+ Filled #125:8550, Terms Filled #125:8593), Sign Up - Verification Code
// #125:8471 (+ Success #125:8517), Forgot Password #125:11435 (+ filled
// #125:11445), Enter Code #125:11525 (+ Filled #125:11542), New Password
// #125:11455 (+ Filled #125:11490), Reset Password Success #125:11567.
//
// The v.2 form language (measured off the frame renders — the #125 frames are
// verified same-named duplicates of the rendered #100 canvas frames): back-arrow
// top bar with a centered title, a centered ~18pt Poppins heading, ~14pt Poppins
// field labels over filled light-gray rounded inputs (#EFEFEF, ~8 radius, 48
// tall, ~17pt text), and a black 48pt / 6-radius CTA anchored at the bottom.
// The CTA is BLACK even on the empty frames (forgot-password / new-password /
// signup renders all show a solid black button over placeholder-only fields),
// so buttons stay enabled and validation happens on press with inline errors.
// ---------------------------------------------------------------------------

// Poppins Medium is registered in App.tsx but not yet exposed on the theme's
// `fonts` map (see foundationRequests) — literal until then.
const P_MEDIUM = 'Poppins_500Medium';

const PX = 24; // v.2 screen gutter (frame boxes sit 23–24 from each edge)
const INPUT_FONT = { fontFamily: P_MEDIUM, fontSize: 17 } as const; // input/placeholder ≈17pt in the frames
// v.2 CTA: 48pt tall, 6pt corner radius (measured on SUBMIT/SIGNUP/VERIFY and
// confirmed by the onboarding module's node data).
const BTN = { height: 48, borderRadius: 6 } as const;

// ---------------------------------------------------------------------------
// Shared v.2 form building blocks
// ---------------------------------------------------------------------------

// Centered screen heading, e.g. "Enter Email to reset password" — ~18pt
// (cap-height-matched to the renders; same size as the top-bar title), sitting
// ~48 below the top-bar divider with ~44 to the first field label.
const FormHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Txt center style={{ fontFamily: P_MEDIUM, fontSize: 18, lineHeight: 28, marginTop: 48, marginBottom: 44 }}>
    {children}
  </Txt>
);

// Poppins label over a filled light-gray rounded box.
const FieldShell: React.FC<{ label?: string; children: React.ReactNode; style?: ViewStyle }> = ({
  label, children, style,
}) => {
  const { theme } = useTheme();
  return (
    <View style={{ marginBottom: tokens.spacing.lg }}>
      {label ? (
        <Txt style={{ fontFamily: P_MEDIUM, fontSize: 14, lineHeight: 20, marginBottom: 8 }}>{label}</Txt>
      ) : null}
      <View style={[styles.inputBox, { backgroundColor: theme.inputBg }, style]}>{children}</View>
    </View>
  );
};

// Plain labelled text input.
const LabeledInput: React.FC<{
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: any;
  autoCapitalize?: any;
}> = ({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize }) => {
  const { theme } = useTheme();
  return (
    <FieldShell label={label}>
      <TextInput
        style={[{ flex: 1, color: theme.text, paddingVertical: 0 }, INPUT_FONT]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
      />
    </FieldShell>
  );
};

// Labelled password input with the right-aligned eye toggle from the frames.
const PasswordField: React.FC<{
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}> = ({ label, value, onChangeText, placeholder }) => {
  const { theme } = useTheme();
  const [show, setShow] = useState(false);
  return (
    <FieldShell label={label}>
      <TextInput
        style={[{ flex: 1, color: theme.text, paddingVertical: 0 }, INPUT_FONT]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        onPress={() => setShow((v) => !v)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={show ? 'Hide password' : 'Show password'}
      >
        <Ionicons name={show ? 'eye-off' : 'eye'} size={20} color={theme.text} />
      </TouchableOpacity>
    </FieldShell>
  );
};

// Static US flag (stripes + canton) — the phone prefix in the Sign Up frame
// shows the actual flag raster; drawn with views so it's crisp on every DPI
// (the regional-indicator emoji renders as bare letters on Windows/web).
const UsFlag: React.FC = () => (
  <View
    accessibilityElementsHidden
    importantForAccessibility="no"
    style={{
      width: 28, height: 18, borderRadius: 2, overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth, borderColor: '#C8C8C8',
    }}
  >
    {[0, 1, 2, 3, 4, 5, 6].map((i) => (
      <View key={i} style={{ flex: 1, backgroundColor: i % 2 === 0 ? '#B22234' : '#FFFFFF' }} />
    ))}
    <View style={{ position: 'absolute', top: 0, left: 0, width: 12, height: 10, backgroundColor: '#3C3B6E' }} />
  </View>
);

// v.2 square checkbox: 2px dark outline, ~5 radius; filled black w/ white check
// when selected (Signup - Terms Filled frame).
const CheckBox: React.FC<{ checked: boolean }> = ({ checked }) => {
  const { theme } = useTheme();
  return (
    <View
      style={{
        width: 24, height: 24, borderRadius: 5, borderWidth: 2, borderColor: theme.cta,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: checked ? theme.cta : 'transparent',
      }}
    >
      {checked ? <Ionicons name="checkmark" size={16} color={theme.ctaText} /> : null}
    </View>
  );
};

// Row of four single-digit code boxes (v.2 frames 125:8471 / 125:11525 show a
// 4-digit code; the server issues 4-digit OTPs to match).
const CodeBoxes: React.FC<{
  code: string[];
  inputs: React.MutableRefObject<Array<TextInput | null>>;
  onDigit: (i: number, v: string) => void;
  onKeyPress: (i: number, e: any) => void;
  size?: number;
  error?: boolean;
}> = ({ code, inputs, onDigit, onKeyPress, size = 43, error }) => {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: tokens.spacing.sm }}>
      {[0, 1, 2, 3].map((i) => (
        <TextInput
          key={i}
          ref={(el) => { inputs.current[i] = el; }}
          value={code[i]}
          onChangeText={(v) => onDigit(i, v)}
          onKeyPress={(e) => onKeyPress(i, e)}
          keyboardType="number-pad"
          maxLength={1}
          accessibilityLabel={`Code digit ${i + 1}`}
          style={[
            styles.codeBox,
            {
              // Near-square boxes: the frame's boxes measure 70w x 75.5h (8 gap).
              width: size, height: Math.round(size * 1.08),
              backgroundColor: theme.inputBg, color: theme.text,
            },
            error ? { borderWidth: 1, borderColor: theme.danger } : null,
          ]}
        />
      ))}
    </View>
  );
};

// ---------------------------------------------------------------------------
// 1. Login (#125:11391 / Filled #125:11413) — centered heading, Email Address +
//    Password fields, right-aligned "Forgot Password?", black LOGIN pill at the
//    bottom (gray/disabled until both fields are filled, per the empty frame).
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
        // to OTP. The password rides along so the success step can complete
        // the login after the code is confirmed.
        navigation.navigate('OtpVerify', { destination: email.trim().toLowerCase(), password });
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
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: PX, paddingBottom: PX }}
        keyboardShouldPersistTaps="handled"
      >
        <FormHeading>Login to your account</FormHeading>

        <LabeledInput
          label="Email Address"
          value={email}
          onChangeText={(t) => { setEmail(t); setError(''); }}
          placeholder="Email Address"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <PasswordField
          label="Password"
          value={password}
          onChangeText={(t) => { setPassword(t); setError(''); }}
          placeholder="Password"
        />

        <TouchableOpacity
          onPress={() => navigation.navigate('ForgotPassword')}
          style={{ alignSelf: 'flex-end', marginTop: 2 }}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel="Forgot Password"
        >
          <Txt style={{ fontFamily: fonts.displayMedium, fontSize: 15 }}>Forgot Password?</Txt>
        </TouchableOpacity>

        {error ? (
          <Txt variant="bodySm" color={theme.danger} style={{ marginTop: tokens.spacing.md }}>
            {error}
          </Txt>
        ) : null}

        <View style={{ flex: 1 }} />
        <Button
          title="LOGIN"
          variant="primary"
          onPress={onLogin}
          loading={submitting}
          disabled={!email.trim() || !password}
          style={{ height: 50, marginTop: tokens.spacing.xl }}
        />
      </ScrollView>
    </Screen>
  );
};

// ---------------------------------------------------------------------------
// 2. Forgot Password (#125:11435 / filled #125:11445) — "Enter Email to reset
//    password", single Email Address field, black SUBMIT anchored bottom.
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
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: PX, paddingBottom: PX }}
        keyboardShouldPersistTaps="handled"
      >
        <FormHeading>Enter Email to reset password</FormHeading>
        <LabeledInput
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
        <Button
          title="SUBMIT"
          variant="primary"
          onPress={onSubmit}
          loading={busy}
          disabled={!email.trim()}
          style={{ height: 50 }}
        />
      </ScrollView>
    </Screen>
  );
};

// ---------------------------------------------------------------------------
// 3. New Password (#125:11455 / Filled #125:11490) + Reset Password Success
//    (#125:11567) — new + confirm password with eye toggles, black SUBMIT;
//    success raises the white "Password Reset" card whose LOGIN button returns
//    to the Login screen.
// ---------------------------------------------------------------------------
export const NewPassword = ({ navigation, route }: any) => {
  const { theme } = useTheme();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const email: string | undefined = route?.params?.email;
  const code: string | undefined = route?.params?.code;

  // Verify the reset code + set the new password on the server (min length 8 to
  // match the API), then show the Reset Password Success card.
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
      setDone(true);
    } catch (e: any) {
      setError(e?.message || 'Could not reset your password. The code may have expired.');
    } finally {
      setBusy(false);
    }
  };

  const toLogin = () => {
    setDone(false);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  // Reset Password Success (#125:11567) — a full SCREEN, not a modal: big green
  // check, "You've successfully updated your password.", black LOGIN TO YOUR
  // ACCOUNT button at the bottom.
  if (done) {
    return (
      <Screen padded={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: PX }}>
          <Ionicons name="checkmark-circle" size={96} color="#4CAF50" />
          <Txt
            variant="h1"
            center
            style={{ marginTop: tokens.spacing.xl, paddingHorizontal: tokens.spacing.lg }}
          >
            You’ve successfully updated your password.
          </Txt>
        </View>
        <View style={{ paddingHorizontal: PX, paddingBottom: PX }}>
          <Button title="LOGIN TO YOUR ACCOUNT" variant="primary" onPress={toLogin} style={{ height: 50 }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <TopBar title="New Password" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: PX, paddingBottom: PX }}
        keyboardShouldPersistTaps="handled"
      >
        <FormHeading>Enter your new password</FormHeading>
        <PasswordField
          label="New Password"
          value={pw}
          onChangeText={(t) => { setPw(t); setError(''); }}
          placeholder="Enter New Password"
        />
        <PasswordField
          label="Confirm New Password"
          value={confirm}
          onChangeText={(t) => { setConfirm(t); setError(''); }}
          placeholder="Confirm New Password"
        />
        {error ? (
          <Txt variant="bodySm" color={theme.danger} style={{ marginTop: tokens.spacing.sm }}>
            {error}
          </Txt>
        ) : null}
        <View style={{ flex: 1 }} />
        <Button
          title="SUBMIT"
          variant="primary"
          onPress={onSubmit}
          loading={busy}
          disabled={!pw || !confirm}
          style={{ height: 50 }}
        />
      </ScrollView>

    </Screen>
  );
};

// ---------------------------------------------------------------------------
// 4. Signup (#125:8421 Empty / #125:8550 Filled / #125:8593 Terms Filled) —
//    avatar-upload circle with the red "+" badge, First/Last Name side by side,
//    Email, Phone (US flag + +1 prefix), Set Password, the Liability-Waiver and
//    SMS-consent checkboxes, black SIGNUP.
// ---------------------------------------------------------------------------
export const Signup = ({ navigation, route }: any) => {
  const { theme } = useTheme();
  const s = useStore();
  // Role chosen on the preceding Welcome screen (member vs pal), carried through
  // so the account is created with the role the user actually picked.
  const role = route?.params?.role;
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeSms, setAgreeSms] = useState(false); // consent kept client-side; no API field yet
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Avatar upload — same picker pattern as EditProfile. The picked image only
  // previews locally (the signup API has no avatar field yet).
  const pickAvatar = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.8 });
      if (!res.canceled && res.assets && res.assets[0]) setAvatar(res.assets[0].uri);
    } catch {
      /* picker unavailable — non-fatal */
    }
  };

  // The SIGNUP button stays black (per the empty frame); agreement is enforced
  // here with an inline message. Also blocks double-taps from firing signup()
  // + navigate twice. The verification code goes to the email; the password
  // rides along so the OTP success step can finish the login.
  const onSignup = async () => {
    if (submitting) return;
    if (!agreeTerms) {
      setError('Please agree to MyFavor’s Liability Waiver, Privacy Policy, and Terms & Conditions to continue.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await s.signup({
        firstName, lastName, email, phone, password,
        ...(avatar ? { avatar } : {}),
        ...(role ? { role } : {}),
      });
      navigation.navigate('OtpVerify', { destination: email.trim().toLowerCase(), password });
    } catch (e: any) {
      setError(e?.message || 'Could not sign up. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const legalLink = (label: string, doc: 'terms' | 'privacy') => (
    <Text
      style={{ fontFamily: fonts.displayMedium, color: theme.text }}
      onPress={(e) => { e.stopPropagation?.(); navigation.navigate('Legal', { doc }); }}
      accessibilityRole="link"
      accessibilityLabel={`View ${label}`}
    >
      {label}
    </Text>
  );

  return (
    <Screen padded={false}>
      <TopBar title="Signup" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: PX, paddingBottom: tokens.spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar upload circle with the red "+" badge (bottom-right). */}
        <View style={{ alignItems: 'center', marginTop: tokens.spacing.lg, marginBottom: tokens.spacing.xl }}>
          <TouchableOpacity
            onPress={pickAvatar}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Add profile photo"
            style={{ width: 132, height: 132 }}
          >
            <View
              style={{
                width: 132, height: 132, borderRadius: 66, backgroundColor: theme.inputBg,
                alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              }}
            >
              {avatar ? (
                <Image source={{ uri: avatar }} style={{ width: 132, height: 132 }} />
              ) : (
                <Ionicons name="person-outline" size={60} color="#ABABAB" />
              )}
            </View>
            <View
              style={{
                position: 'absolute', right: 2, bottom: 2, width: 38, height: 38, borderRadius: 19,
                backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="add" size={26} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View>

        {/* First + Last name side by side */}
        <View style={{ flexDirection: 'row', gap: tokens.spacing.base }}>
          <View style={{ flex: 1 }}>
            <LabeledInput label="First Name" value={firstName} onChangeText={setFirstName} placeholder="First Name" autoCapitalize="words" />
          </View>
          <View style={{ flex: 1 }}>
            <LabeledInput label="Last Name" value={lastName} onChangeText={setLastName} placeholder="Last Name" autoCapitalize="words" />
          </View>
        </View>

        <LabeledInput
          label="Email Address"
          value={email}
          onChangeText={setEmail}
          placeholder="Email Address"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        {/* Phone with the static US-flag +1 prefix (no country picker). */}
        <FieldShell label="Phone Number">
          <View
            style={{ flexDirection: 'row', alignItems: 'center' }}
            accessibilityLabel="Country code, United States, plus 1"
          >
            <UsFlag />
            <Txt style={{ ...INPUT_FONT, marginLeft: 10 }}>+1</Txt>
            <Ionicons name="caret-down" size={12} color={theme.text} style={{ marginLeft: 6 }} />
          </View>
          <TextInput
            style={[{ flex: 1, color: theme.text, paddingVertical: 0, marginLeft: 14 }, INPUT_FONT]}
            value={phone}
            onChangeText={setPhone}
            placeholder="0000 - 000 - 000"
            placeholderTextColor={theme.textTertiary}
            keyboardType="phone-pad"
          />
        </FieldShell>

        <PasswordField label="Set Password" value={password} onChangeText={setPassword} placeholder="Set Password" />

        {/* Liability Waiver / Privacy Policy / Terms & Conditions agreement.
            Copy (incl. the space before the comma) matches the frame exactly. */}
        <TouchableOpacity
          onPress={() => { setAgreeTerms((v) => !v); setError(''); }}
          activeOpacity={0.7}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreeTerms }}
          accessibilityLabel="I agree to MyFavor's Liability Waiver, Privacy Policy, and Terms and Conditions"
          style={styles.checkRow}
        >
          <CheckBox checked={agreeTerms} />
          <Txt style={{ flex: 1, fontFamily: P_MEDIUM, fontSize: 15, lineHeight: 22 }}>
            {'I agree to MyFavor’s '}
            {legalLink('Liability Waiver', 'terms')}
            {', '}
            {legalLink('Privacy Policy', 'privacy')}
            {' , and '}
            {legalLink('Terms & Conditions', 'terms')}
            {'.'}
          </Txt>
        </TouchableOpacity>

        {/* SMS notifications consent. */}
        <TouchableOpacity
          onPress={() => setAgreeSms((v) => !v)}
          activeOpacity={0.7}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreeSms }}
          accessibilityLabel="I agree to allow MyFavor app to send me SMS notifications"
          style={styles.checkRow}
        >
          <CheckBox checked={agreeSms} />
          <Txt style={{ flex: 1, fontFamily: P_MEDIUM, fontSize: 15, lineHeight: 22 }}>
            I agree to allow MyFavor app to send me SMS notifications.
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
          style={{ height: 50, marginTop: tokens.spacing.sm }}
        />
      </ScrollView>
    </Screen>
  );
};

// ---------------------------------------------------------------------------
// 5. OtpVerify — two v.2 layouts in one route:
//    • signup (default): the centered white "Verification" card over a dim
//      scrim (#125:8471), flipping to the Success card (#125:8517) once the
//      code checks out; CONTINUE completes the login.
//    • reset: the full-screen "Enter Code" step of the password-reset flow
//      (#125:11525 / Filled #125:11542), whose SUBMIT moves to New Password.
// ---------------------------------------------------------------------------
const OTP_SECONDS = 43;

export const OtpVerify = ({ navigation, route }: any) => {
  const { theme } = useTheme();
  const s = useStore();
  const [code, setCode] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [seconds, setSeconds] = useState(OTP_SECONDS);
  const inputs = useRef<Array<TextInput | null>>([]);
  const dest: string | undefined = route?.params?.destination;
  // Password from Signup/Login so the Success step can complete the login
  // after verification (held in memory only, never persisted).
  const password: string | undefined = route?.params?.password;
  const isReset = route?.params?.context === 'reset';

  // Live "Code expires in 00:43" countdown; Resend unlocks at zero.
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

  const full = code.join('');

  const onVerify = async () => {
    if (submitting) return;
    if (full.length < 4) {
      setError('Please enter the full 4-digit code.');
      return;
    }
    // Password reset: the code is verified server-side by reset-password (with
    // the new password), so here we just carry the code forward.
    if (isReset) {
      navigation.navigate('NewPassword', { email: dest, code: full });
      return;
    }
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      if (dest && password) {
        // Verify the code first so the Success card can show before the login
        // flips the navigator into the app.
        await verifyOtpApi(dest, full);
        setVerified(true);
      } else {
        // No password on hand (defensive fallback) — verify and enter directly.
        const ok = await s.verifyOtp(full);
        if (!ok) setError('Incorrect or expired code. Please enter the full 4-digit code.');
      }
    } catch (e: any) {
      setError(e?.message || 'Incorrect or expired code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Success card CONTINUE: the account is verified — log in to enter the app
  // (the store flip swaps the navigator to Tabs).
  const onContinue = async () => {
    if (continuing) return;
    if (!dest || !password) {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      return;
    }
    setContinuing(true);
    try {
      const r = await s.login(dest, password);
      if (r !== 'ok') navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } finally {
      setContinuing(false);
    }
  };

  // Working Resend: requests a fresh code from the backend (so an expired code
  // is replaced), clears the boxes, restarts the countdown, and confirms.
  // Disabled until the current code expires.
  const onResend = async () => {
    if (seconds > 0 || resending) return;
    setResending(true);
    setError('');
    setNotice('');
    try {
      if (dest) await (isReset ? forgotPasswordApi(dest) : resendOtpApi(dest, 'signup'));
      setCode(['', '', '', '']);
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

  const resendBlocked = seconds > 0 || resending;

  // ----- reset context: full-screen "Enter Code" (#125:11525) -----
  if (isReset) {
    return (
      <Screen padded={false}>
        <TopBar title="Enter Code" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: PX, paddingBottom: PX }}
          keyboardShouldPersistTaps="handled"
        >
          {/* #125:11525 copy */}
          <FormHeading>Please enter 4 digit code to reset password</FormHeading>

          <CodeBoxes code={code} inputs={inputs} onDigit={setDigit} onKeyPress={onKeyPress} size={48} error={!!error} />

          {error ? (
            <Txt variant="bodySm" center color={theme.danger} style={{ marginTop: tokens.spacing.md }}>
              {error}
            </Txt>
          ) : null}

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: tokens.spacing.xl }}>
            <Txt style={{ fontFamily: P_MEDIUM, fontSize: 15 }}>Didn’t receive a code? </Txt>
            <TouchableOpacity
              onPress={onResend}
              disabled={resendBlocked}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Resend code"
              accessibilityState={{ disabled: resendBlocked }}
            >
              <Txt
                color={resendBlocked ? theme.textTertiary : theme.text}
                style={{ fontFamily: fonts.displayMedium, fontSize: 15 }}
              >
                {resending ? 'Sending…' : seconds > 0 ? `Resend in ${fmt(seconds)}` : 'Resend'}
              </Txt>
            </TouchableOpacity>
          </View>

          {notice ? (
            <Txt variant="bodySm" center color={theme.success} style={{ marginTop: tokens.spacing.sm }}>
              {notice}
            </Txt>
          ) : null}

          <View style={{ flex: 1 }} />
          <Button
            title="SUBMIT"
            variant="primary"
            onPress={onVerify}
            disabled={full.length < 4}
            style={{ height: 50 }}
          />
        </ScrollView>
      </Screen>
    );
  }

  // ----- signup context: "Verification" modal card (#125:8471) + Success (#125:8517) -----
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
          {/* Tap outside the card to dismiss (no explicit close in the frame);
              locked once the account is verified. */}
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={verified ? undefined : onClose}
            accessibilityRole="button"
            accessibilityLabel="Dismiss verification"
            disabled={verified}
          />

          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            {verified ? (
              <>
                {/* Success (#125:8517) */}
                <Ionicons
                  name="checkmark-circle"
                  size={72}
                  color={theme.success}
                  style={{ alignSelf: 'center', marginBottom: tokens.spacing.md }}
                />
                {/* #125:8517: green check + "Account Verified" heading, no body copy. */}
                <Txt variant="h1" center style={{ marginBottom: tokens.spacing.base }}>Account Verified</Txt>
                <Button
                  title="CONTINUE"
                  variant="primary"
                  onPress={onContinue}
                  loading={continuing}
                  style={{ height: 50, marginTop: tokens.spacing.xl }}
                />
              </>
            ) : (
              <>
                <Txt variant="h1" center style={{ marginBottom: tokens.spacing.base }}>Verification</Txt>
                <Txt center style={{ fontFamily: P_MEDIUM, fontSize: 16, lineHeight: 24 }}>
                  Please enter 4 digit code to verify your account.
                </Txt>
                <Txt center style={{ fontFamily: P_MEDIUM, fontSize: 15, marginTop: tokens.spacing.base }}>
                  {seconds > 0 ? `Code expires in ${fmt(seconds)}` : 'Code expired'}
                </Txt>

                <View style={{ marginTop: tokens.spacing.xl }}>
                  <CodeBoxes code={code} inputs={inputs} onDigit={setDigit} onKeyPress={onKeyPress} error={!!error} />
                </View>

                {error ? (
                  <Txt variant="bodySm" center color={theme.danger} style={{ marginTop: tokens.spacing.md }}>
                    {error}
                  </Txt>
                ) : null}

                <Txt center style={{ fontFamily: P_MEDIUM, fontSize: 15, marginTop: tokens.spacing.xl }}>
                  Didn’t receive a code?
                </Txt>
                <TouchableOpacity
                  onPress={onResend}
                  disabled={resendBlocked}
                  hitSlop={8}
                  style={{ alignSelf: 'center', marginTop: tokens.spacing.sm }}
                  accessibilityRole="button"
                  accessibilityLabel="Resend code"
                  accessibilityState={{ disabled: resendBlocked }}
                >
                  <Txt
                    color={resendBlocked ? theme.textTertiary : theme.text}
                    style={{ fontFamily: fonts.displayMedium, fontSize: 16 }}
                  >
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
                  style={{ height: 50, marginTop: tokens.spacing.lg }}
                />
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: tokens.radius.md,
    paddingHorizontal: 16,
    minHeight: 50,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
    marginBottom: tokens.spacing.base,
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
  codeBox: {
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 22,
    fontFamily: fonts.displayMedium,
  },
});
