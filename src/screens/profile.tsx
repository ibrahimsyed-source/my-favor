import React, { useState } from 'react';
import {
  View, TextInput, TouchableOpacity, Pressable, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { Txt, Avatar } from '../components';
import { fonts } from '../theme';
import { useStore } from '../store';

// ---------------------------------------------------------------------------
// User App v.2 (Figma "Mockup" canvas, #125) — these account screens are LIGHT.
// Frames: Side Drawer #125:7342 · Edit Profile #125:7568 · Edit Profile -
// Success Modal #125:7632 · Settings - Revised #125:7465 · Settings - Delete
// account #1196:18885 · Help #125:7401 · Help - Success #125:7430.
// The shared <Button>/<Field>/<TopBar> render the v1 kit (54px pills etc.), so
// local v.2 building blocks below reproduce the exact frame metrics instead.
// ---------------------------------------------------------------------------
const L = {
  bg: '#FFFFFF',
  text: '#1A1A1A',
  sub: '#767676', // gray body / row subtitles
  placeholder: '#9A9A9A',
  divider: '#ECECEC',
  input: '#EFEFEF',
  cta: '#141414', // black CTA bars
  red: '#ED1C24',
  star: '#FFBD00',
  green: '#4CAF50', // Help-Success check
  toggleOff: '#E4E4E6',
} as const;

const POPPINS_MEDIUM = 'Poppins_500Medium'; // registered in App.tsx

// ---------------------------------------------------------------------------
// v.2 light building blocks
// ---------------------------------------------------------------------------
function LightHeader({ title, onBack, onEdit }: { title: string; onBack?: () => void; onEdit?: () => void }) {
  return (
    <View style={st.header}>
      <View style={{ width: 44 }}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={24} color={L.text} />
          </TouchableOpacity>
        ) : null}
      </View>
      <Txt style={st.headerTitle} center>{title}</Txt>
      <View style={{ width: 44, alignItems: 'flex-end' }}>
        {onEdit ? (
          <TouchableOpacity onPress={onEdit} hitSlop={12} accessibilityRole="button" accessibilityLabel="Edit profile">
            <Ionicons name="pencil" size={20} color={L.text} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// Black CTA bar (SAVE / SUBMIT / CONTINUE / DELETE MY ACCOUNT) — 46px, r10.
function Cta({ title, onPress, disabled, loading, style }: {
  title: string; onPress?: () => void; disabled?: boolean; loading?: boolean; style?: any;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={!!disabled || !!loading}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      style={[st.cta, disabled && { opacity: 0.4 }, style]}
    >
      {loading ? <ActivityIndicator color="#FFFFFF" /> : <Txt style={st.ctaText}>{title}</Txt>}
    </TouchableOpacity>
  );
}

// Centered white alert card (Edit Profile - Success Modal #125:7632).
function LightModal({ visible, title, message, buttonLabel, onClose }: {
  visible: boolean; title: string; message: string; buttonLabel: string; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.scrim} onPress={onClose}>
        <Pressable style={st.alertCard} onPress={() => {}}>
          <Txt style={st.alertTitle} center>{title}</Txt>
          <Txt style={st.alertMsg} center>{message}</Txt>
          <Cta title={buttonLabel} onPress={onClose} style={{ height: 40, marginTop: 18 }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Gray filled input with a light label above (Edit Profile #125:7568).
function LightField({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, multiline, maxLength, autoCapitalize }: any) {
  const [hide, setHide] = useState(!!secureTextEntry);
  return (
    <View style={{ flex: 1 }}>
      {label ? <Txt style={st.fieldLabel}>{label}</Txt> : null}
      <View style={[st.fieldBox, multiline && st.fieldBoxMulti]}>
        <TextInput
          style={[st.fieldInput, multiline && { paddingVertical: 0, height: '100%' }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={L.placeholder}
          secureTextEntry={hide}
          keyboardType={keyboardType}
          multiline={multiline}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          textAlignVertical={multiline ? 'top' : 'center'}
        />
        {secureTextEntry ? (
          <TouchableOpacity onPress={() => setHide((h: boolean) => !h)} hitSlop={8} accessibilityRole="button" accessibilityLabel={hide ? 'Show password' : 'Hide password'}>
            <Ionicons name={hide ? 'eye' : 'eye-off'} size={18} color={L.text} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// Tiny US flag (drawn — the emoji degrades on Windows/web and some Androids).
function USFlag() {
  return (
    <View style={st.flag}>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <View key={i} style={{ flex: 1, backgroundColor: i % 2 === 0 ? '#B22234' : '#FFFFFF' }} />
      ))}
      <View style={st.flagCanton} />
    </View>
  );
}

function PhoneField({ value, onChangeText }: any) {
  return (
    <View>
      <Txt style={st.fieldLabel}>Phone Number</Txt>
      <View style={st.fieldBox} accessibilityLabel="Country code, United States, plus 1">
        <USFlag />
        <Txt style={{ fontFamily: POPPINS_MEDIUM, fontSize: 14, color: L.text, marginLeft: 7, marginRight: 3 }}>+1</Txt>
        <Ionicons name="chevron-down" size={13} color={L.text} />
        <TextInput
          style={[st.fieldInput, { marginLeft: 14 }]}
          value={value}
          onChangeText={onChangeText}
          placeholder="8000 - 000 - 000"
          placeholderTextColor={L.placeholder}
          keyboardType="phone-pad"
        />
      </View>
    </View>
  );
}

// Small pill toggle used in "Switch to be a favor pal" (custom — RN Switch
// renders at platform-fixed sizes that don't match the 38x22 mock).
function TinyToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={[st.toggleTrack, { backgroundColor: value ? L.red : L.toggleOff }]}
    >
      <View style={[st.toggleKnob, value ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]} />
    </Pressable>
  );
}

// ===========================================================================
// Profile / Settings — one shared body: the "Settings - Revised" frame
// (#125:7465) is titled "Profile" in-app; the Profile tab renders the same
// design as a root (no back chevron) plus the red Set Status link, which no
// v.2 frame covers but keeps s.setStatus reachable.
// ===========================================================================
function ProfileBody({ navigation, onBack, showSetStatus }: { navigation: any; onBack?: () => void; showSetStatus?: boolean }) {
  const s = useStore();
  const user = s.user;
  const [confirming, setConfirming] = useState(false);
  const [agree, setAgree] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!user) return null;

  const isPal = user.role === 'pal';

  const runDelete = async () => {
    setDeleting(true);
    await s.deleteAccount();
    // store wipes the session + signs out; the auth navigator unmounts this screen.
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: L.bg }}>
      <LightHeader title="Profile" onBack={onBack} onEdit={() => navigation.navigate('EditProfile')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignSelf: 'center', marginTop: 18 }}>
          <Avatar uri={user.avatar} name={user.firstName} size={124} />
        </View>
        <Txt style={st.profileName} center>{user.firstName}</Txt>

        {showSetStatus ? (
          <TouchableOpacity
            onPress={() => navigation.navigate('SetStatus')}
            style={st.setStatus}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Set Status"
          >
            <View style={st.statusDot} />
            <Txt style={{ fontFamily: POPPINS_MEDIUM, fontSize: 13, color: L.red }}>Set Status</Txt>
          </TouchableOpacity>
        ) : null}

        <Txt style={st.profileBio} center>{user.bio}</Txt>

        {/* Role switch pill */}
        <View style={st.switchPill}>
          <Txt style={st.switchPillText}>{isPal ? 'Switch to request a favor' : 'Switch to be a favor pal'}</Txt>
          <TinyToggle value={isPal} onChange={() => s.setRole(isPal ? 'member' : 'pal')} />
        </View>

        {/* Stats */}
        <View style={st.statsRow}>
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <Txt style={st.statValue}>{String(user.totalFavors)}</Txt>
            <Txt style={st.statLabel}>Total Favors</Txt>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Txt style={st.statValue}>{user.rating.toFixed(1)}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <Ionicons name="star" size={12} color={L.star} />
              <Txt style={{ ...st.statLabel, marginTop: 0 }}>Rating</Txt>
            </View>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Txt style={st.statValue}>{String(user.yearsActive)}</Txt>
            <Txt style={st.statLabel}>Years</Txt>
          </View>
        </View>

        {/* Contact rows */}
        <View style={[st.divider, { marginTop: 22 }]} />
        <InfoRow icon="mail" title="Email" subtitle={user.email} onPress={() => navigation.navigate('EditProfile')} />
        <InfoRow icon="call" title="Phone" subtitle={user.phone} onPress={() => navigation.navigate('EditProfile')} />
        <InfoRow icon="home" title="Home" subtitle={user.homeAddress} onPress={() => navigation.navigate('EditProfile')} />
        <InfoRow icon="lock-closed" title="Password" subtitle="Change Password" onPress={() => navigation.navigate('EditProfile')} />

        <Cta
          title="DELETE MY ACCOUNT"
          onPress={() => { setAgree(false); setConfirming(true); }}
          style={{ marginTop: 30 }}
        />
      </ScrollView>

      {/* Settings - Delete account (#1196:18885) — checkbox confirm modal.
          Copy matches the frame verbatim (incl. its "within45days"/"cetain"
          spellings). App Store 5.1.1(v): deletion initiated + completed in-app. */}
      <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => !deleting && setConfirming(false)}>
        <Pressable style={st.scrim} onPress={() => !deleting && setConfirming(false)}>
          <Pressable style={st.deleteCard} onPress={() => {}}>
            <Txt style={st.deleteTitle} center>DELETE MY ACCOUNT</Txt>
            <Txt style={st.deleteBody}>
              Once your request is processed, your personal information will be permanently deleted within45days, with the exception of cetain information we are legally required or permitted to retain.{'\n'}
              Please consider your request as you will immediately be signed out of the app and this cannot be undone.
            </Txt>
            <TouchableOpacity
              style={st.checkRow}
              activeOpacity={0.7}
              onPress={() => setAgree((a) => !a)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agree }}
            >
              <View style={[st.checkbox, agree && { backgroundColor: L.text }]}>
                {agree ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
              </View>
              <Txt style={st.checkText}>
                Yes, I want to permanently delete my account.{'\n'}
                I understand I will be signed out of MyFavor app and no longer able to access the app or sign in
              </Txt>
            </TouchableOpacity>
            <Cta title="DELETE MY ACCOUNT" onPress={runDelete} disabled={!agree} loading={deleting} style={{ height: 42, marginTop: 18 }} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function InfoRow({ icon, title, subtitle, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={st.infoRow} accessibilityRole="button" accessibilityLabel={`${title}, ${subtitle}`}>
      <Ionicons name={icon} size={17} color={L.text} style={{ width: 34, marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Txt style={st.infoTitle}>{title}</Txt>
        <Txt style={st.infoSub} numberOfLines={1}>{subtitle}</Txt>
      </View>
    </TouchableOpacity>
  );
}

// 1. Profile — root tab (no back chevron), same v.2 design.
export const Profile = ({ navigation }: any) => (
  <ProfileBody navigation={navigation} showSetStatus />
);

// 2. Settings — "Settings - Revised" frame #125:7465 (in-app title "Profile").
export const Settings = ({ navigation }: any) => (
  <ProfileBody navigation={navigation} onBack={() => navigation.goBack()} />
);

// ===========================================================================
// 3. EditProfile — light form (#125:7568) + Success modal (#125:7632).
// ===========================================================================
export const EditProfile = ({ navigation }: any) => {
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

  // First SAVE (after Zip Code) — profile fields only.
  const saveProfile = async () => {
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
    setModal({ title: 'Success!', message: 'User Profile has been Successfully updated', success: true });
  };

  // Second SAVE (after New Password) — password change only.
  const savePassword = async () => {
    const ok = await s.changePassword(currentPw, newPw);
    if (!ok) {
      setModal({
        title: 'Password Not Changed',
        message: 'Enter your current password and a new password of at least 6 characters.',
      });
      return;
    }
    setCurrentPw('');
    setNewPw('');
    setModal({ title: 'Success!', message: 'User Profile has been Successfully updated', success: true });
  };

  const closeModal = () => {
    const wasSuccess = modal?.success;
    setModal(null);
    if (wasSuccess) navigation.goBack();
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: L.bg }}>
      <LightHeader title="Edit Profile" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Avatar with red edit badge */}
          <View style={{ alignSelf: 'center', marginTop: 6, marginBottom: 26 }}>
            <Avatar uri={avatar} name={firstName} size={124} />
            <TouchableOpacity onPress={pickImage} style={st.editBadge} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Change photo">
              <Ionicons name="pencil" size={15} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={st.fieldRow}>
            <LightField label="First Name" value={firstName} onChangeText={setFirstName} />
            <LightField label="Last Name" value={lastName} onChangeText={setLastName} />
          </View>

          <View style={st.fieldWrap}>
            <LightField label="Bio" value={bio} onChangeText={setBio} multiline maxLength={300} />
          </View>

          <View style={st.fieldWrap}>
            <LightField label="Email Address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          </View>

          <View style={st.fieldWrap}>
            <PhoneField value={phone} onChangeText={setPhone} />
          </View>

          <View style={st.fieldWrap}>
            <LightField label="Home Address" value={homeAddress} onChangeText={setHomeAddress} />
          </View>

          <View style={st.fieldRow}>
            <LightField label="City" value={city} onChangeText={setCity} />
            <LightField label="State" value={stateName} onChangeText={setStateName} />
          </View>

          <View style={st.fieldWrap}>
            <LightField label="Zip Code" value={zip} onChangeText={setZip} keyboardType="number-pad" />
          </View>

          <Cta title="SAVE" onPress={saveProfile} style={{ marginTop: 10 }} />

          <View style={[st.fieldWrap, { marginTop: 26 }]}>
            <LightField label="Current Password" value={currentPw} onChangeText={setCurrentPw} secureTextEntry />
          </View>

          <View style={st.fieldWrap}>
            <LightField label="New Password" value={newPw} onChangeText={setNewPw} secureTextEntry />
          </View>

          <Cta title="SAVE" onPress={savePassword} style={{ marginTop: 10 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      <LightModal
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
// 4. Help — light contact form (#125:7401) + full-screen success (#125:7430).
// ===========================================================================
function GreenCheck({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      <Circle cx={48} cy={48} r={41} stroke={L.green} strokeWidth={7} />
      <Path d="M31 49 L43.5 61.5 L66 37" stroke={L.green} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export const Help = ({ navigation }: any) => {
  const [msg, setMsg] = useState('');
  const [sent, setSent] = useState(false);

  if (sent) {
    // Help - Success frame has no header/back — just the check, copy, CONTINUE.
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: L.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <GreenCheck size={96} />
          <Txt style={st.successText} center>
            You’ve succesfully{'\n'}submitted your{'\n'}question!
          </Txt>
        </View>
        <View style={{ paddingHorizontal: 24, paddingBottom: 28 }}>
          <Cta title="CONTINUE" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: L.bg }}>
      <LightHeader title="Help" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24 }} keyboardShouldPersistTaps="handled">
          <Txt style={st.helpHeading}>Need help or have a question?</Txt>
          <Txt style={st.helpSub}>Send us a message</Txt>

          <View style={st.helpBox}>
            <TextInput
              style={st.helpInput}
              value={msg}
              onChangeText={setMsg}
              multiline
              maxLength={700}
              placeholder="Enter message here"
              placeholderTextColor={L.placeholder}
              textAlignVertical="top"
            />
          </View>
          <Txt style={st.helpMax}>700 characters max.</Txt>

          <View style={{ flex: 1 }} />
          <Cta title="SUBMIT" onPress={() => setSent(true)} disabled={!msg.trim()} style={{ marginTop: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ===========================================================================
// 5. SideDrawer — white left panel over the dimmed screen (#125:7342).
// ===========================================================================
export const SideDrawer = ({ navigation }: any) => {
  const s = useStore();
  const u = s.user;
  const close = () => navigation.goBack();
  const go = (route: string, params?: any) => {
    navigation.goBack();
    navigation.navigate(route, params);
  };

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <SafeAreaView edges={['top', 'bottom']} style={st.drawer}>
        {/* Identity */}
        <View style={{ alignItems: 'center', marginTop: 18 }}>
          <View style={{ width: 132, height: 132 }}>
            <Avatar uri={u?.avatar} name={u?.firstName} size={132} />
            <TouchableOpacity onPress={() => go('EditProfile')} style={st.drawerBadge} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Edit profile">
              <Ionicons name="pencil" size={15} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <Txt style={st.drawerName}>{u?.firstName ?? 'Anton'}</Txt>
          <TouchableOpacity onPress={() => go('Tabs', { screen: 'Profile' })} hitSlop={6} accessibilityRole="button" accessibilityLabel="View Profile">
            <Txt style={st.drawerViewProfile}>View Profile</Txt>
          </TouchableOpacity>
        </View>

        <View style={[st.divider, { marginTop: 24 }]} />

        {/* Menu */}
        <View style={{ flex: 1, paddingTop: 8 }}>
          <DrawerRow label="Favor History" onPress={() => go('History')}>
            <MaterialIcons name="history" size={22} color={L.text} />
          </DrawerRow>
          <DrawerRow label="Help" onPress={() => go('Help')}>
            <Ionicons name="help-circle" size={21} color={L.text} />
          </DrawerRow>
          <DrawerRow label="Settings" onPress={() => go('Settings')}>
            <Ionicons name="settings-sharp" size={19} color={L.text} />
          </DrawerRow>
          <DrawerRow label="Payment" onPress={() => go('Payment')}>
            <Ionicons name="card" size={20} color={L.text} />
          </DrawerRow>

          <View style={{ flex: 1 }} />

          <DrawerRow label="Logout" onPress={() => s.logout()} style={{ marginBottom: 18 }}>
            <Ionicons name="log-out-outline" size={21} color={L.text} />
          </DrawerRow>
        </View>
      </SafeAreaView>

      <Pressable style={st.backdrop} onPress={close} accessibilityRole="button" accessibilityLabel="Close menu" />
    </View>
  );
};

function DrawerRow({ label, onPress, children, style }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[st.drawerRow, style]} accessibilityRole="button" accessibilityLabel={label}>
      <View style={{ width: 22, alignItems: 'center' }}>{children}</View>
      <Txt style={st.drawerRowText}>{label}</Txt>
    </TouchableOpacity>
  );
}

// ===========================================================================
// 6. SetStatus — availability picker modal. No v.2 frame covers it, so it is
// restyled to the light card language (white card, green/gray states).
// ===========================================================================
const STATUS_OPTIONS: { key: 'online' | 'invisible' | 'offline'; label: string; dot: string; ring: string; color: string }[] = [
  { key: 'online', label: 'Online', dot: '#02CB00', ring: '#02CB00', color: '#02CB00' },
  { key: 'invisible', label: 'Invisible', dot: 'transparent', ring: '#767676', color: L.text },
  { key: 'offline', label: 'Offline', dot: '#9E9E9E', ring: '#9E9E9E', color: L.sub },
];

export const SetStatus = ({ navigation }: any) => {
  const s = useStore();
  const current = s.user?.status ?? 'online';
  const choose = (status: 'online' | 'invisible' | 'offline') => {
    s.setStatus(status);
    navigation.goBack();
  };
  return (
    <Pressable style={[st.scrim, { paddingHorizontal: 28 }]} onPress={() => navigation.goBack()}>
      <Pressable style={st.statusCard} onPress={() => {}}>
        <Txt style={st.statusTitle} center>Set Status</Txt>
        <View style={st.divider} />
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
                <View style={[st.statusRadio, { borderColor: opt.ring, backgroundColor: opt.dot }]} />
                <Txt style={{ fontFamily: sel ? fonts.displayMedium : POPPINS_MEDIUM, fontSize: 15, color: opt.color }}>
                  {opt.label}
                </Txt>
              </View>
              <View style={st.divider} />
            </TouchableOpacity>
          );
        })}
      </Pressable>
    </Pressable>
  );
};

// ---------------------------------------------------------------------------
const st = StyleSheet.create({
  // Header
  header: {
    height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.divider,
    backgroundColor: L.bg,
  },
  headerTitle: { fontFamily: fonts.displayMedium, fontSize: 16, color: L.text },

  // CTA
  cta: { height: 46, borderRadius: 10, backgroundColor: L.cta, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  ctaText: { fontFamily: fonts.displayMedium, fontSize: 13, color: '#FFFFFF', letterSpacing: 1 },

  // Modals
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  alertCard: { width: 285, borderRadius: 10, backgroundColor: '#FFFFFF', paddingVertical: 22, paddingHorizontal: 20 },
  alertTitle: { fontFamily: fonts.display, fontSize: 17, color: L.text },
  alertMsg: { fontFamily: fonts.bodyRegular, fontSize: 13, lineHeight: 19, color: L.text, marginTop: 10 },

  // Delete-account modal
  deleteCard: { alignSelf: 'stretch', marginHorizontal: 28, borderRadius: 8, backgroundColor: '#FFFFFF', paddingVertical: 22, paddingHorizontal: 20 },
  deleteTitle: { fontFamily: fonts.displayMedium, fontSize: 15, letterSpacing: 0.4, color: L.text, marginBottom: 14 },
  deleteBody: { fontFamily: fonts.bodyRegular, fontSize: 13, lineHeight: 19, color: L.text },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 16 },
  checkbox: {
    width: 18, height: 18, borderRadius: 2, borderWidth: 1.5, borderColor: L.text,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkText: { flex: 1, marginLeft: 10, fontFamily: fonts.bodyRegular, fontSize: 12.5, lineHeight: 18, color: L.text },

  // Fields (Edit Profile)
  fieldLabel: { fontFamily: POPPINS_MEDIUM, fontSize: 13, color: L.text, marginBottom: 7 },
  fieldBox: {
    backgroundColor: L.input, borderRadius: 8, minHeight: 44, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center',
  },
  fieldBoxMulti: { height: 110, alignItems: 'flex-start', paddingVertical: 12 },
  fieldInput: { flex: 1, fontFamily: fonts.bodyRegular, fontSize: 15, color: L.text, paddingVertical: 0 },
  fieldWrap: { marginBottom: 16 },
  fieldRow: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  editBadge: {
    position: 'absolute', right: 0, bottom: 2, width: 32, height: 32, borderRadius: 16,
    backgroundColor: L.red, alignItems: 'center', justifyContent: 'center',
  },

  // US flag
  flag: { width: 21, height: 14, borderRadius: 2, overflow: 'hidden' },
  flagCanton: { position: 'absolute', top: 0, left: 0, width: 9, height: 8, backgroundColor: '#3C3B6E' },

  // Profile / Settings
  profileName: { fontFamily: fonts.display, fontSize: 18, color: L.text, marginTop: 16 },
  setStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'center', marginTop: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: L.red },
  profileBio: { fontFamily: fonts.bodyRegular, fontSize: 14, lineHeight: 20, color: L.sub, marginTop: 14, paddingHorizontal: 16 },
  switchPill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center', marginTop: 18,
    backgroundColor: '#FFFFFF', borderRadius: 999, paddingLeft: 16, paddingRight: 6, height: 34, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3,
  },
  switchPillText: { fontFamily: POPPINS_MEDIUM, fontSize: 11, color: L.text },
  toggleTrack: { width: 38, height: 22, borderRadius: 11, padding: 2, justifyContent: 'center' },
  toggleKnob: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  statsRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 26 },
  statValue: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, color: L.text },
  statLabel: { fontFamily: fonts.bodyRegular, fontSize: 13, color: L.sub, marginTop: 4 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: L.divider, alignSelf: 'stretch' },
  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14, paddingLeft: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.divider,
  },
  infoTitle: { fontFamily: fonts.displayMedium, fontSize: 14, color: L.text },
  infoSub: { fontFamily: fonts.bodyRegular, fontSize: 13, color: L.sub, marginTop: 3 },

  // Help
  helpHeading: { fontFamily: fonts.displayMedium, fontSize: 21, color: L.text, marginTop: 14 },
  helpSub: { fontFamily: fonts.bodyRegular, fontSize: 14, color: L.text, marginTop: 12 },
  helpBox: { backgroundColor: L.input, borderRadius: 8, height: 160, paddingHorizontal: 14, paddingVertical: 12, marginTop: 18 },
  helpInput: { flex: 1, fontFamily: fonts.bodyRegular, fontSize: 15, color: L.text, paddingVertical: 0 },
  helpMax: { fontFamily: fonts.bodyRegular, fontSize: 11.5, color: L.placeholder, textAlign: 'right', marginTop: 8 },
  successText: { fontFamily: fonts.displayMedium, fontSize: 22, lineHeight: 31, color: L.text, marginTop: 26 },

  // SideDrawer
  drawer: {
    width: '72%', backgroundColor: L.bg,
    shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 8,
  },
  drawerBadge: {
    position: 'absolute', right: 2, bottom: 4, width: 33, height: 33, borderRadius: 17,
    backgroundColor: L.red, alignItems: 'center', justifyContent: 'center',
  },
  drawerName: { fontFamily: fonts.display, fontSize: 17, color: L.text, marginTop: 14 },
  drawerViewProfile: { fontFamily: fonts.bodyRegular, fontSize: 13, color: L.text, marginTop: 6 },
  drawerRow: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingVertical: 22, paddingHorizontal: 30 },
  drawerRowText: { fontFamily: POPPINS_MEDIUM, fontSize: 15, color: L.text },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },

  // SetStatus modal
  statusCard: { width: '100%', borderRadius: 16, backgroundColor: '#FFFFFF', paddingVertical: 24, paddingHorizontal: 24 },
  statusTitle: { fontFamily: fonts.display, fontSize: 20, color: L.text, marginBottom: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 17 },
  statusRadio: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
});
