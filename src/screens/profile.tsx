import React, { useState } from 'react';
import {
  View, TextInput, TouchableOpacity, Pressable, ScrollView, Switch,
  StyleSheet, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Screen, Txt, Button, Row, TopBar, InfoModal, ConfirmModal } from '../components';
import { useTheme, fonts } from '../theme';
import { useStore } from '../store';

// ---------------------------------------------------------------------------
// Module palette — all screens follow the app's light theme; only the brand
// red accent and the rating-star amber are kept as fixed literals.
// ---------------------------------------------------------------------------
const RED = '#ED1C24';
const STAR = '#FFBD00';

// ---------------------------------------------------------------------------
// Shared dark-surface building blocks
// ---------------------------------------------------------------------------
function DarkHeader({ title, onBack, rightIcon, onRight }: any) {
  const { theme } = useTheme();
  return (
    <View style={[st.darkHeader, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
      {/* Root tab screens (Profile) pass no onBack, so no back chevron renders. */}
      <View style={{ width: 40 }}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={26} color={theme.text} />
          </TouchableOpacity>
        ) : null}
      </View>
      <Txt variant="h6" color={theme.text}>{title}</Txt>
      <View style={{ width: 40, alignItems: 'flex-end' }}>
        {rightIcon ? (
          <TouchableOpacity onPress={onRight} hitSlop={10} accessibilityRole="button" accessibilityLabel="Edit profile">
            <Ionicons name={rightIcon} size={22} color={theme.text} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function DarkField({
  label, value, onChangeText, placeholder, secureTextEntry, keyboardType,
  multiline, maxLength, autoCapitalize,
}: any) {
  const { theme } = useTheme();
  const [hide, setHide] = useState(!!secureTextEntry);
  return (
    <View style={{ flex: 1 }}>
      {label ? <Txt variant="label" style={{ marginBottom: 8 }}>{label}</Txt> : null}
      <View style={[st.darkInput, { backgroundColor: theme.inputBg }, multiline && { height: 120, alignItems: 'flex-start' }]}>
        <TextInput
          style={{ flex: 1, color: theme.text, fontSize: 16, paddingVertical: multiline ? 10 : 0 }}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textTertiary}
          secureTextEntry={hide}
          keyboardType={keyboardType}
          multiline={multiline}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          textAlignVertical={multiline ? 'top' : 'center'}
        />
        {secureTextEntry ? (
          <TouchableOpacity onPress={() => setHide((h) => !h)} hitSlop={8}>
            <Ionicons name={hide ? 'eye-off' : 'eye'} size={20} color={theme.textTertiary} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function PhoneField({ value, onChangeText }: any) {
  const { theme } = useTheme();
  return (
    <View>
      <Txt variant="label" style={{ marginBottom: 8 }}>Phone Number</Txt>
      <View style={[st.darkInput, { backgroundColor: theme.inputBg }]} accessibilityLabel="Country code, United States, plus 1">
        {/* Plain text rather than the regional-indicator flag emoji, which degrades
            to bare letters on Windows/web and to tofu boxes on some Android builds. */}
        <Txt color={theme.text} style={{ fontSize: 13, fontFamily: fonts.bodyBold }}>US</Txt>
        <Txt color={theme.text} style={{ fontSize: 16, marginLeft: 8, marginRight: 4 }}>+1</Txt>
        <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
        <View style={{ width: 1, height: 24, backgroundColor: theme.divider, marginHorizontal: 12 }} />
        <TextInput
          style={{ flex: 1, color: theme.text, fontSize: 16 }}
          value={value}
          onChangeText={onChangeText}
          placeholder="8000 - 000 - 000"
          placeholderTextColor={theme.textTertiary}
          keyboardType="phone-pad"
        />
      </View>
    </View>
  );
}

// ===========================================================================
// 1. Profile — dark self-profile (figma 100:13030)
// ===========================================================================
export const Profile = ({ navigation }: any) => {
  const { theme } = useTheme();
  const s = useStore();
  const user = s.user;
  if (!user) return null;

  const isPal = user.role === 'pal';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Profile is a root tab, not a pushed screen, so no back chevron. */}
      <DarkHeader
        title="Profile"
        rightIcon="pencil"
        onRight={() => navigation.navigate('EditProfile')}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        {/* Avatar + identity */}
        <Image source={{ uri: user.avatar }} style={[st.profileAvatar, { backgroundColor: theme.surfaceAlt }]} />
        <Txt variant="h3" color={theme.text} center style={{ marginTop: 16 }}>{user.firstName}</Txt>
        <TouchableOpacity onPress={() => navigation.navigate('SetStatus')} style={st.setStatus} activeOpacity={0.7}>
          <View style={st.statusDot} />
          <Txt color={RED} style={{ fontSize: 15, fontFamily: fonts.bodyBold }}>Set Status</Txt>
        </TouchableOpacity>

        {/* Bio */}
        <Txt variant="body" color={theme.textSecondary} center style={{ marginTop: 18, paddingHorizontal: 4 }}>
          {user.bio}
        </Txt>

        {/* Stats */}
        <View style={[st.statsRow, { borderColor: theme.divider }]}>
          <Stat value={String(user.totalFavors)} label="Total Favors" />
          <Stat value={user.rating.toFixed(1)} label="Rating" star />
          <Stat value={String(user.yearsActive)} label="Years" />
        </View>

        {/* Info rows */}
        <InfoRow icon="mail" title="Email" subtitle={user.email} onPress={() => navigation.navigate('EditProfile')} />
        <InfoRow icon="call" title="Phone" subtitle={user.phone} onPress={() => navigation.navigate('EditProfile')} />
        <InfoRow icon="home" title="Home" subtitle={user.homeAddress} onPress={() => navigation.navigate('EditProfile')} />
        <InfoRow icon="lock-closed" title="Password" subtitle="Change Password" onPress={() => navigation.navigate('EditProfile')} />

        {/* Account hub — the SideDrawer only opens from Home, so the Profile tab is
            the only reliable path to these account controls. */}
        <Txt variant="caption" color={theme.textTertiary} style={{ marginTop: 24, marginBottom: 2, letterSpacing: 0.8, textTransform: 'uppercase' }}>Account</Txt>
        <NavRow icon="time" label="Favor History" onPress={() => navigation.navigate('History')} />
        <NavRow icon="card" label="Payment Methods" onPress={() => navigation.navigate('Payment')} />
        {isPal && (
          <NavRow icon="wallet" label="Payouts & Bank" onPress={() => navigation.navigate('StripeOnboarding')} />
        )}
        <NavRow icon="settings" label="Settings" onPress={() => navigation.navigate('Settings')} />
        <NavRow icon="help-circle" label="Help" onPress={() => navigation.navigate('Help')} />
        <NavRow icon="log-out" label="Log Out" onPress={() => s.logout()} danger />
      </ScrollView>
    </SafeAreaView>
  );
};

function NavRow({ icon, label, onPress, danger }: any) {
  const { theme } = useTheme();
  const tint = danger ? RED : theme.text;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[st.infoRow, { borderBottomColor: theme.divider }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={22} color={tint} style={{ width: 32 }} />
      <Txt variant="label" color={tint} style={{ flex: 1 }}>{label}</Txt>
      {danger ? null : <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />}
    </TouchableOpacity>
  );
}

function Stat({ value, label, star }: any) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Txt color={theme.text} style={{ fontSize: 34, fontFamily: fonts.display }}>{value}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
        {star ? <Ionicons name="star" size={14} color={STAR} /> : null}
        <Txt color={theme.textSecondary} style={{ fontSize: 14 }}>{label}</Txt>
      </View>
    </View>
  );
}

function InfoRow({ icon, title, subtitle, onPress }: any) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[st.infoRow, { borderBottomColor: theme.divider }]}>
      <Ionicons name={icon} size={22} color={theme.text} style={{ width: 32 }} />
      <View style={{ flex: 1 }}>
        <Txt variant="label" color={theme.text}>{title}</Txt>
        <Txt variant="bodySm" color={theme.textSecondary} numberOfLines={1} style={{ marginTop: 2 }}>{subtitle}</Txt>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
    </TouchableOpacity>
  );
}

// ===========================================================================
// 2. EditProfile — dark form (figma 97:4909)
// ===========================================================================
export const EditProfile = ({ navigation }: any) => {
  const { theme } = useTheme();
  const s = useStore();
  const u = s.user;
  const [firstName, setFirstName] = useState(u?.firstName ?? '');
  const [lastName, setLastName] = useState(u?.lastName ?? '');
  const [bio, setBio] = useState(u?.bio ?? '');
  const [email, setEmail] = useState(u?.email ?? '');
  const [phone, setPhone] = useState(u?.phone ?? '');
  const [homeAddress, setHomeAddress] = useState(u?.homeAddress ?? '');
  const [city, setCity] = useState(u?.city ?? '');
  const [stateName, setStateName] = useState(u?.state ?? '');
  const [zip, setZip] = useState(u?.zip ?? '');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [avatar, setAvatar] = useState(u?.avatar);
  const [modal, setModal] = useState<{ title: string; message: string; success?: boolean } | null>(null);

  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.8 });
      if (!res.canceled && res.assets && res.assets[0]) setAvatar(res.assets[0].uri);
    } catch {
      /* picker unavailable — non-fatal */
    }
  };

  const onSave = async () => {
    // A new/current password entry means the user wants to change it — actually
    // submit it via changePassword instead of silently dropping the fields.
    const wantsPwChange = !!(newPw.trim() || currentPw.trim());
    if (wantsPwChange) {
      const ok = await s.changePassword(currentPw, newPw);
      if (!ok) {
        setModal({
          title: 'Password Not Changed',
          message: 'Enter your current password and a new password of at least 6 characters.',
        });
        return;
      }
    }

    try {
      await s.updateProfile({
        firstName, lastName, bio, email, phone,
        homeAddress, city, state: stateName, zip, avatar,
      });
    } catch {
      // updateProfile can reject on a network error — surface it instead of
      // leaving the SAVE button looking dead.
      setModal({
        title: "Couldn't Save Changes",
        message: 'Something went wrong while saving your profile. Please check your connection and try again.',
      });
      return;
    }

    if (wantsPwChange) {
      setCurrentPw('');
      setNewPw('');
    }
    // Always confirm a successful save (closeModal navigates back on success).
    setModal({
      title: 'Profile Updated',
      message: wantsPwChange
        ? 'Your changes were saved and your password was updated.'
        : 'Your changes were saved.',
      success: true,
    });
  };

  const closeModal = () => {
    const wasSuccess = modal?.success;
    setModal(null);
    if (wasSuccess) navigation.goBack();
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      <DarkHeader title="Edit Profile" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Avatar with red edit badge */}
          <View style={{ alignSelf: 'center', marginBottom: 24 }}>
            <Image source={avatar ? { uri: avatar } : undefined} style={[st.editAvatar, { backgroundColor: theme.surfaceAlt }]} />
            <TouchableOpacity onPress={pickImage} style={[st.editBadge, { borderColor: theme.background }]} activeOpacity={0.85}>
              <Ionicons name="pencil" size={15} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={st.fieldRow}>
            <DarkField label="First Name" value={firstName} onChangeText={setFirstName} />
            <DarkField label="Last Name" value={lastName} onChangeText={setLastName} />
          </View>

          <View style={st.fieldWrap}>
            <DarkField label="Bio" value={bio} onChangeText={setBio} multiline maxLength={300} />
          </View>

          <View style={st.fieldWrap}>
            <DarkField label="Email Address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          </View>

          <View style={st.fieldWrap}>
            <PhoneField value={phone} onChangeText={setPhone} />
          </View>

          <View style={st.fieldWrap}>
            <DarkField label="Home Address" value={homeAddress} onChangeText={setHomeAddress} />
          </View>

          <View style={st.fieldRow}>
            <DarkField label="City" value={city} onChangeText={setCity} />
            <DarkField label="State" value={stateName} onChangeText={setStateName} />
          </View>

          <View style={st.fieldWrap}>
            <DarkField label="Zip Code" value={zip} onChangeText={setZip} keyboardType="number-pad" />
          </View>

          <View style={[st.fieldWrap, { marginTop: 12 }]}>
            <DarkField label="Current Password" value={currentPw} onChangeText={setCurrentPw} secureTextEntry />
          </View>

          <View style={st.fieldWrap}>
            <DarkField label="New Password" value={newPw} onChangeText={setNewPw} secureTextEntry />
          </View>

          <Button title="SAVE" variant="primary" onPress={onSave} style={{ marginTop: 16 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      <InfoModal
        visible={!!modal}
        title={modal?.title ?? ''}
        message={modal?.message ?? ''}
        buttonLabel="OK"
        onClose={closeModal}
      />
    </SafeAreaView>
  );
};

// ===========================================================================
// 3. Settings — light list (figma 97:4297)
// ===========================================================================
export const Settings = ({ navigation }: any) => {
  const { theme } = useTheme();
  const s = useStore();
  const [push, setPush] = useState(true);
  const [emailN, setEmailN] = useState(false);
  const [loc, setLoc] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const track = { false: '#D1D5DB', true: theme.primary };

  // App Store guideline 5.1.1(v): account deletion must be initiated and
  // completed in-app. ConfirmModal works on web + native (Alert.alert no-ops on web).
  const runDelete = async () => {
    setConfirmingDelete(false);
    setDeleting(true);
    await s.deleteAccount();
    // store wipes the session + signs out; the auth navigator unmounts this screen.
  };

  return (
    <Screen padded={false}>
      <TopBar title="Settings" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        <SectionLabel>Account</SectionLabel>
        <Row icon="person-outline" title="Edit Profile" onPress={() => navigation.navigate('EditProfile')} />
        <Row icon="lock-closed-outline" title="Change Password" onPress={() => navigation.navigate('EditProfile')} />

        <SectionLabel>Notifications</SectionLabel>
        <Row icon="notifications-outline" title="Push Notifications" right={<Switch value={push} onValueChange={setPush} trackColor={track} />} />
        <Row icon="mail-outline" title="Email Notifications" right={<Switch value={emailN} onValueChange={setEmailN} trackColor={track} />} />

        <SectionLabel>Preferences</SectionLabel>
        <Row icon="location-outline" title="Location Services" right={<Switch value={loc} onValueChange={setLoc} trackColor={track} />} />

        <SectionLabel>Support</SectionLabel>
        <Row icon="help-circle-outline" title="Help Center" onPress={() => navigation.navigate('Help')} />
        <Row icon="document-text-outline" title="Privacy Policy" onPress={() => navigation.navigate('Legal', { doc: 'privacy' })} />
        <Row icon="shield-checkmark-outline" title="Terms of Service" onPress={() => navigation.navigate('Legal', { doc: 'terms' })} />

        <SectionLabel>Account Actions</SectionLabel>
        <TouchableOpacity
          onPress={() => setConfirmingDelete(true)}
          disabled={deleting}
          activeOpacity={0.7}
          style={[st.lightRow, { borderBottomColor: theme.divider, opacity: deleting ? 0.5 : 1 }]}
        >
          <Ionicons name="trash-outline" size={22} color={theme.danger} style={{ marginRight: 14 }} />
          <Txt variant="label" color={theme.danger} style={{ flex: 1 }}>
            {deleting ? 'Deleting…' : 'Delete Account'}
          </Txt>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => s.logout()} activeOpacity={0.7} style={[st.lightRow, { borderBottomColor: theme.divider }]}>
          <Ionicons name="log-out-outline" size={22} color={theme.textSecondary} style={{ marginRight: 14 }} />
          <Txt variant="label" style={{ flex: 1 }}>Log Out</Txt>
        </TouchableOpacity>
      </ScrollView>
      <ConfirmModal
        visible={confirmingDelete}
        title="Delete Account?"
        message="This permanently deletes your account and all of your data — favors, messages, payment methods, and history. This cannot be undone."
        confirmLabel="Delete Account"
        cancelLabel="Cancel"
        destructive
        onConfirm={runDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </Screen>
  );
};

function SectionLabel({ children }: any) {
  const { theme } = useTheme();
  return (
    <Txt variant="caption" color={theme.textTertiary} style={{ marginTop: 22, marginBottom: 4, letterSpacing: 0.8, textTransform: 'uppercase' }}>
      {children}
    </Txt>
  );
}

// ===========================================================================
// 4. Help — light contact form (figma 2:4291)
// ===========================================================================
export const Help = ({ navigation }: any) => {
  const { theme } = useTheme();
  const [msg, setMsg] = useState('');
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <Screen padded={false}>
        <TopBar title="Help" onBack={() => navigation.goBack()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
          <Ionicons name="checkmark-circle" size={76} color={theme.success} />
          <Txt variant="h3" center>Message Sent</Txt>
          <Txt variant="body" color={theme.textSecondary} center>
            Thanks for reaching out! Our support team will get back to you shortly.
          </Txt>
          <Button title="Done" uppercase={false} onPress={() => navigation.goBack()} style={{ alignSelf: 'stretch', marginTop: 8 }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <TopBar title="Help" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
        <Txt variant="h2" color={theme.text}>Need help or have a{'\n'}question?</Txt>
        <Txt variant="body" color={theme.textSecondary} style={{ marginTop: 10, marginBottom: 20 }}>
          Send us a message.
        </Txt>

        <View style={[st.helpBox, { borderColor: theme.border }]}>
          <TextInput
            style={{ flex: 1, fontSize: 16, color: theme.text, textAlignVertical: 'top' }}
            value={msg}
            onChangeText={setMsg}
            multiline
            maxLength={700}
            placeholder="Tell us what's going on and how we can help."
            placeholderTextColor={theme.textTertiary}
          />
        </View>
        <Txt variant="caption" color={theme.textSecondary} style={{ textAlign: 'right', marginTop: 10 }}>
          700 characters max.
        </Txt>

        <Button
          title="Submit"
          uppercase={false}
          onPress={() => setSent(true)}
          disabled={!msg.trim()}
          style={{ marginTop: 28 }}
        />
      </ScrollView>
    </Screen>
  );
};

// ===========================================================================
// 5. SideDrawer — navy left panel over the map (figma 181:10620)
// ===========================================================================
export const SideDrawer = ({ navigation }: any) => {
  const { theme } = useTheme();
  const s = useStore();
  const u = s.user;
  const close = () => navigation.goBack();
  const go = (route: string, params?: any) => {
    navigation.goBack();
    navigation.navigate(route, params);
  };

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <SafeAreaView edges={['top', 'bottom']} style={[st.drawer, { backgroundColor: theme.card, borderRightColor: theme.border }]}>
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12 }}>
          {/* Identity */}
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <View style={{ width: 86, height: 86 }}>
              <Image source={{ uri: u?.avatar }} style={{ width: 86, height: 86, borderRadius: 43 }} />
              <TouchableOpacity onPress={() => go('EditProfile')} style={[st.drawerBadge, { borderColor: theme.card }]} activeOpacity={0.85}>
                <Ionicons name="pencil" size={13} color="#fff" />
              </TouchableOpacity>
            </View>
            <Txt variant="h4" color={theme.text} style={{ marginTop: 12 }}>{u?.firstName ?? 'Anton'}</Txt>
            <TouchableOpacity onPress={() => go('Tabs', { screen: 'Profile' })}>
              <Txt color={theme.textSecondary} style={{ fontSize: 14, marginTop: 4 }}>View Profile</Txt>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => go('SetStatus')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}
            >
              <View style={st.statusDot} />
              <Txt color={RED} style={{ fontSize: 14, fontFamily: fonts.bodyBold }}>Set Status</Txt>
            </TouchableOpacity>
          </View>

          <View style={[st.drawerDivider, { backgroundColor: theme.divider }]} />

          {/* Menu */}
          <DrawerRow icon="time-outline" label="Favor History" onPress={() => go('History')} />
          <DrawerRow icon="help-circle-outline" label="Help" onPress={() => go('Help')} />
          <DrawerRow icon="settings-outline" label="Settings" onPress={() => go('Settings')} />
          {u?.role === 'pal' && (
            <DrawerRow icon="cash-outline" label="Earnings" onPress={() => go('Earnings')} />
          )}
          {/* Two stable, distinctly-labeled rows instead of one role-retargeting
              "Account" row, so neither financial surface silently changes destination
              (or vanishes) when the role toggle flips on another screen. */}
          <DrawerRow icon="card-outline" label="Payment Methods" onPress={() => go('Payment')} />
          {u?.role === 'pal' && (
            <DrawerRow icon="wallet-outline" label="Payouts & Bank" onPress={() => go('StripeOnboarding')} />
          )}

          <View style={{ flex: 1 }} />

          <DrawerRow icon="log-out-outline" label="Logout" onPress={() => s.logout()} />
        </View>
      </SafeAreaView>

      <Pressable style={st.backdrop} onPress={close} />
    </View>
  );
};

function DrawerRow({ icon, label, onPress }: any) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 }}>
      <Ionicons name={icon} size={22} color={theme.text} />
      <Txt color={theme.text} style={{ fontSize: 16 }}>{label}</Txt>
    </TouchableOpacity>
  );
}

// ===========================================================================
// 6. SetStatus — availability picker modal (figma "Set Status")
// ===========================================================================
const STATUS_OPTIONS: { key: 'online' | 'invisible' | 'offline'; label: string; dot: string }[] = [
  { key: 'online', label: 'Online', dot: '#4B5563' },
  { key: 'invisible', label: 'Invisible', dot: 'transparent' },
  { key: 'offline', label: 'Offline', dot: '#B6BBC4' },
];

export const SetStatus = ({ navigation }: any) => {
  const { theme } = useTheme();
  const s = useStore();
  const current = s.user?.status ?? 'online';
  const choose = (status: 'online' | 'invisible' | 'offline') => {
    s.setStatus(status);
    navigation.goBack();
  };
  return (
    <Pressable style={st.statusScrim} onPress={() => navigation.goBack()}>
      <Pressable style={[st.statusCard, { backgroundColor: theme.card }]} onPress={() => {}}>
        <Txt variant="h2" center color={theme.text} style={{ marginBottom: 18 }}>Set Status</Txt>
        <View style={[st.statusDivider, { backgroundColor: theme.divider }]} />
        {STATUS_OPTIONS.map((opt) => {
          const sel = current === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              activeOpacity={0.7}
              onPress={() => choose(opt.key)}
              accessibilityRole="radio"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: sel, checked: sel }}
            >
              <View style={st.statusRow}>
                <View style={[st.statusRadio, { borderColor: opt.dot === 'transparent' ? theme.textTertiary : opt.dot, backgroundColor: opt.dot }]} />
                <Txt
                  color={sel ? theme.text : theme.textSecondary}
                  style={{ fontSize: 18, fontFamily: sel ? fonts.bodyBold : fonts.bodyRegular }}
                >
                  {opt.label}
                </Txt>
              </View>
              <View style={[st.statusDivider, { backgroundColor: theme.divider }]} />
            </TouchableOpacity>
          );
        })}
      </Pressable>
    </Pressable>
  );
};

// ---------------------------------------------------------------------------
const st = StyleSheet.create({
  darkHeader: {
    height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  darkInput: {
    borderRadius: 10, paddingHorizontal: 14, minHeight: 52,
    flexDirection: 'row', alignItems: 'center',
  },
  fieldWrap: { marginBottom: 16 },
  fieldRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },

  // Profile
  profileAvatar: { width: 140, height: 140, borderRadius: 70, alignSelf: 'center', marginTop: 16 },
  setStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', marginTop: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: RED },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 20, marginTop: 24, marginBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // EditProfile avatar
  editAvatar: { width: 96, height: 96, borderRadius: 48 },
  editBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15,
    backgroundColor: RED, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },

  // Settings
  lightRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },

  // Help
  helpBox: { borderWidth: 1, borderRadius: 12, padding: 16, height: 340 },

  // SideDrawer
  drawer: {
    width: '78%', borderRightWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 8,
  },
  drawerBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14,
    backgroundColor: RED, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  drawerDivider: { height: StyleSheet.hairlineWidth, marginVertical: 22 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },

  // SetStatus modal
  statusScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  statusCard: { width: '100%', borderRadius: 18, paddingVertical: 28, paddingHorizontal: 28 },
  statusDivider: { height: StyleSheet.hairlineWidth },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 20 },
  statusRadio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
});
