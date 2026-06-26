import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet, ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, TopBar, Txt, Button, Field } from '../components';
import { useTheme, tokens, fonts } from '../theme';
import { useStore } from '../store';

const logo = require('../../assets/img/logo.png');

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

  const onLogin = async () => {
    await s.login(email, password);
    navigation.navigate('Tabs');
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

        <Button title="LOGIN" variant="primary" onPress={onLogin} style={{ marginTop: tokens.spacing.base }} />

        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: tokens.spacing.xl }}>
          <Txt variant="body" color={theme.textSecondary}>Don't have an account? </Txt>
          <TouchableOpacity onPress={() => navigation.navigate('Signup')} hitSlop={8}>
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
export const Signup = ({ navigation }: any) => {
  const { theme } = useTheme();
  const s = useStore();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);

  const onSignup = async () => {
    await s.signup({ firstName, lastName, email, phone, password });
    navigation.navigate('OtpVerify');
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

        {/* Terms checkbox */}
        <TouchableOpacity
          onPress={() => setAgree((v) => !v)}
          activeOpacity={0.7}
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
            I agree to <Text style={{ fontFamily: fonts.bodyBold, color: theme.text }}>Terms &amp; Conditions</Text>
          </Txt>
        </TouchableOpacity>

        <Button title="SIGNUP" variant="primary" onPress={onSignup} />
      </ScrollView>
    </Screen>
  );
};

// ---------------------------------------------------------------------------
// 5. OtpVerify — centered white modal card over a dim background. Four
//    auto-advancing single-digit boxes, Resend, black VERIFY.
// ---------------------------------------------------------------------------
export const OtpVerify = ({ navigation }: any) => {
  const { theme } = useTheme();
  const s = useStore();
  const [code, setCode] = useState(['', '', '', '']);
  const inputs = useRef<Array<TextInput | null>>([]);

  const setDigit = (i: number, v: string) => {
    const ch = v.replace(/[^0-9]/g, '').slice(-1);
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

  const onVerify = async () => {
    await s.verifyOtp(code.join(''));
    navigation.navigate('Tabs');
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.modalCard}>
        <Txt variant="h1" center style={{ marginBottom: tokens.spacing.base }}>Verification</Txt>
        <Txt variant="body" center color={theme.textSecondary}>
          Please enter 4 digit code to verify your account.
        </Txt>
        <Txt variant="body" center style={{ marginTop: tokens.spacing.base }}>
          Code expires in 00:43
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
              style={[styles.otpBox, { backgroundColor: theme.inputBg, color: theme.text }]}
            />
          ))}
        </View>

        <Txt variant="body" center color={theme.textSecondary} style={{ marginTop: tokens.spacing.xl }}>
          Didn't receive a code?
        </Txt>
        <TouchableOpacity onPress={() => setCode(['', '', '', ''])} hitSlop={8} style={{ alignSelf: 'center', marginTop: 4 }}>
          <Txt variant="body" style={{ fontFamily: fonts.bodyBold }}>Resend</Txt>
        </TouchableOpacity>

        <Button title="VERIFY" variant="primary" onPress={onVerify} style={{ marginTop: tokens.spacing.lg }} />
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
