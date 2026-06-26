import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, Switch,
  StyleSheet, Image, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Screen, Txt, Button, Row, TopBar } from '../components';
import { useTheme } from '../theme';
import { useStore } from '../store';

// ---------------------------------------------------------------------------
// Module palette — Profile / EditProfile are dark, Settings light, drawer navy.
// ---------------------------------------------------------------------------
const DARK_BG = '#0C0C0C';
const FIELD_BG = '#1C2331';
const NAVY = '#1C2331';
const RED = '#ED1C24';
const STAR = '#FFBD00';
const SUBTLE = '#9BA1A6';
const PLACEHOLDER = '#6B7280';
const DARK_DIVIDER = '#262626';

// ---------------------------------------------------------------------------
// Shared dark-surface building blocks
// ---------------------------------------------------------------------------
function DarkHeader({ title, onBack, rightIcon, onRight }: any) {
  return (
    <View style={st.darkHeader}>
      <TouchableOpacity onPress={onBack} hitSlop={10} style={{ width: 40 }}>
        <Ionicons name="chevron-back" size={26} color="#fff" />
      </TouchableOpacity>
      <Txt variant="h6" color="#fff">{title}</Txt>
      <View style={{ width: 40, alignItems: 'flex-end' }}>
        {rightIcon ? (
          <TouchableOpacity onPress={onRight} hitSlop={10}>
            <Ionicons name={rightIcon} size={22} color="#fff" />
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
  const [hide, setHide] = useState(!!secureTextEntry);
  return (
    <View style={{ flex: 1 }}>
      {label ? <Text style={st.darkLabel}>{label}</Text> : null}
      <View style={[st.darkInput, multiline && { height: 120, alignItems: 'flex-start' }]}>
        <TextInput
          style={{ flex: 1, color: '#fff', fontSize: 16, paddingVertical: multiline ? 10 : 0 }}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={PLACEHOLDER}
          secureTextEntry={hide}
          keyboardType={keyboardType}
          multiline={multiline}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          textAlignVertical={multiline ? 'top' : 'center'}
        />
        {secureTextEntry ? (
          <TouchableOpacity onPress={() => setHide((h) => !h)} hitSlop={8}>
            <Ionicons name={hide ? 'eye-off' : 'eye'} size={20} color={PLACEHOLDER} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function PhoneField({ value, onChangeText }: any) {
  return (
    <View>
      <Text style={st.darkLabel}>Phone Number</Text>
      <View style={st.darkInput}>
        <Text style={{ fontSize: 18 }}>🇺🇸</Text>
        <Text style={{ color: '#fff', fontSize: 16, marginLeft: 8, marginRight: 4 }}>+1</Text>
        <Ionicons name="chevron-down" size={16} color={SUBTLE} />
        <View style={{ width: 1, height: 24, backgroundColor: '#33384A', marginHorizontal: 12 }} />
        <TextInput
          style={{ flex: 1, color: '#fff', fontSize: 16 }}
          value={value}
          onChangeText={onChangeText}
          placeholder="8000 - 000 - 000"
          placeholderTextColor={PLACEHOLDER}
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
  const s = useStore();
  const user = s.user;
  if (!user) return null;

  const isPal = user.role === 'pal';
  const switchLabel = isPal ? 'Switch to be a Favor Pal' : 'Switch to request a favor';
  const toggleRole = () => s.setRole(isPal ? 'member' : 'pal');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: DARK_BG }}>
      <DarkHeader
        title="Profile"
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('SideDrawer'))}
        rightIcon="pencil"
        onRight={() => navigation.navigate('EditProfile')}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        {/* Avatar + identity */}
        <Image source={{ uri: user.avatar }} style={st.profileAvatar} />
        <Txt variant="h3" color="#fff" center style={{ marginTop: 16 }}>{user.firstName}</Txt>
        <TouchableOpacity onPress={() => navigation.navigate('SetStatus')} style={st.setStatus} activeOpacity={0.7}>
          <View style={st.statusDot} />
          <Text style={{ color: RED, fontSize: 15, fontWeight: '700' }}>Set Status</Text>
        </TouchableOpacity>

        {/* Bio */}
        <Txt variant="body" color={SUBTLE} center style={{ marginTop: 18, paddingHorizontal: 4 }}>
          {user.bio}
        </Txt>

        {/* Role switch pill */}
        <View style={st.switchPill}>
          <Text style={{ color: '#141414', fontSize: 15, fontWeight: '600' }}>{switchLabel}</Text>
          <Switch
            value={isPal}
            onValueChange={toggleRole}
            trackColor={{ false: '#D1D5DB', true: RED }}
            thumbColor="#fff"
          />
        </View>

        {/* Stats */}
        <View style={st.statsRow}>
          <Stat value={String(user.totalFavors)} label="Total Favors" />
          <Stat value={user.rating.toFixed(1)} label="Rating" star />
          <Stat value={String(user.yearsActive)} label="Years" />
        </View>

        {/* Info rows */}
        <InfoRow icon="mail" title="Email" subtitle={user.email} onPress={() => navigation.navigate('EditProfile')} />
        <InfoRow icon="call" title="Phone" subtitle={user.phone} onPress={() => navigation.navigate('EditProfile')} />
        <InfoRow icon="home" title="Home" subtitle={user.homeAddress} onPress={() => navigation.navigate('EditProfile')} />
        <InfoRow icon="lock-closed" title="Password" subtitle="Change Password" onPress={() => navigation.navigate('EditProfile')} />
      </ScrollView>
    </SafeAreaView>
  );
};

function Stat({ value, label, star }: any) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800' }}>{value}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
        {star ? <Ionicons name="star" size={14} color={STAR} /> : null}
        <Text style={{ color: SUBTLE, fontSize: 14 }}>{label}</Text>
      </View>
    </View>
  );
}

function InfoRow({ icon, title, subtitle, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={st.infoRow}>
      <Ionicons name={icon} size={22} color="#fff" style={{ width: 32 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{title}</Text>
        <Text style={{ color: '#8C8C8C', fontSize: 14, marginTop: 2 }} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={PLACEHOLDER} />
    </TouchableOpacity>
  );
}

// ===========================================================================
// 2. EditProfile — dark form (figma 97:4909)
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
    await s.updateProfile({
      firstName, lastName, bio, email, phone,
      homeAddress, city, state: stateName, zip, avatar,
    });
    navigation.goBack();
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: DARK_BG }}>
      <DarkHeader title="Edit Profile" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Avatar with red edit badge */}
          <View style={{ alignSelf: 'center', marginBottom: 24 }}>
            <Image source={avatar ? { uri: avatar } : undefined} style={st.editAvatar} />
            <TouchableOpacity onPress={pickImage} style={st.editBadge} activeOpacity={0.85}>
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

          <Button title="SAVE" variant="white" onPress={onSave} style={{ marginTop: 16 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ===========================================================================
// 3. Settings — light list (figma 97:4297)
// ===========================================================================
export const Settings = ({ navigation }: any) => {
  const { theme, isDark, toggleDark } = useTheme();
  const s = useStore();
  const [push, setPush] = useState(true);
  const [emailN, setEmailN] = useState(false);
  const [loc, setLoc] = useState(true);

  const track = { false: '#D1D5DB', true: theme.primary };

  const confirmDelete = () =>
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account and all of your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => s.logout() },
      ]
    );

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
        <Row icon="moon-outline" title="Dark Mode" right={<Switch value={isDark} onValueChange={toggleDark} trackColor={track} />} />
        <Row icon="location-outline" title="Location Services" right={<Switch value={loc} onValueChange={setLoc} trackColor={track} />} />

        <SectionLabel>Support</SectionLabel>
        <Row icon="help-circle-outline" title="Help Center" onPress={() => navigation.navigate('Help')} />
        <Row icon="document-text-outline" title="Privacy Policy" onPress={() => {}} />
        <Row icon="shield-checkmark-outline" title="Terms of Service" onPress={() => {}} />

        <SectionLabel>Account Actions</SectionLabel>
        <TouchableOpacity onPress={confirmDelete} activeOpacity={0.7} style={[st.lightRow, { borderBottomColor: theme.divider }]}>
          <Ionicons name="trash-outline" size={22} color={theme.danger} style={{ marginRight: 14 }} />
          <Txt variant="label" color={theme.danger} style={{ flex: 1 }}>Delete Account</Txt>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => s.logout()} activeOpacity={0.7} style={[st.lightRow, { borderBottomColor: theme.divider }]}>
          <Ionicons name="log-out-outline" size={22} color={theme.textSecondary} style={{ marginRight: 14 }} />
          <Txt variant="label" style={{ flex: 1 }}>Log Out</Txt>
        </TouchableOpacity>
      </ScrollView>
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
        <Txt variant="h2" color="#586172">Need help or have a{'\n'}question?</Txt>
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
            placeholder="Provide as much detail as possible about your favor!  Let your provider know about what they will be doing, what they will need to bring, special requirements, etc."
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
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12 }}>
          {/* Identity */}
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <View style={{ width: 86, height: 86 }}>
              <Image source={{ uri: u?.avatar }} style={{ width: 86, height: 86, borderRadius: 43 }} />
              <TouchableOpacity onPress={() => go('EditProfile')} style={st.drawerBadge} activeOpacity={0.85}>
                <Ionicons name="pencil" size={13} color="#fff" />
              </TouchableOpacity>
            </View>
            <Txt variant="h4" color="#fff" style={{ marginTop: 12 }}>{u?.firstName ?? 'Anton'}</Txt>
            <TouchableOpacity onPress={() => go('Tabs', { screen: 'Profile' })}>
              <Text style={{ color: SUBTLE, fontSize: 14, marginTop: 4 }}>View Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => go('SetStatus')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}
            >
              <View style={st.statusDot} />
              <Text style={{ color: RED, fontSize: 14, fontWeight: '700' }}>Set Status</Text>
            </TouchableOpacity>
          </View>

          <View style={st.drawerDivider} />

          {/* Menu */}
          <DrawerRow icon="time-outline" label="Favor History" onPress={() => go('Tabs', { screen: 'History' })} />
          <DrawerRow icon="help-circle-outline" label="Help" onPress={() => go('Help')} />
          <DrawerRow icon="settings-outline" label="Settings" onPress={() => go('Settings')} />
          {u?.role === 'pal' && (
            <DrawerRow icon="cash-outline" label="Earnings" onPress={() => go('Earnings')} />
          )}
          {/* Pals manage their Stripe/bank payout account; members manage cards. */}
          <DrawerRow
            icon="card-outline"
            label="Account"
            onPress={() => go(u?.role === 'pal' ? 'StripeOnboarding' : 'Payment')}
          />

          <View style={{ flex: 1 }} />

          <DrawerRow icon="log-out-outline" label="Logout" onPress={() => s.logout()} />
        </View>
      </SafeAreaView>

      <Pressable style={st.backdrop} onPress={close} />
    </View>
  );
};

function DrawerRow({ icon, label, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 }}>
      <Ionicons name={icon} size={22} color="#fff" />
      <Text style={{ color: '#fff', fontSize: 16 }}>{label}</Text>
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
        <Text style={[st.statusTitle, { color: '#586172' }]}>Set Status</Text>
        <View style={[st.statusDivider, { backgroundColor: theme.divider }]} />
        {STATUS_OPTIONS.map((opt) => {
          const sel = current === opt.key;
          return (
            <TouchableOpacity key={opt.key} activeOpacity={0.7} onPress={() => choose(opt.key)}>
              <View style={st.statusRow}>
                <View style={[st.statusRadio, { borderColor: opt.dot === 'transparent' ? '#8A909B' : opt.dot, backgroundColor: opt.dot }]} />
                <Text style={{ color: sel ? theme.text : '#6B7280', fontSize: 18, fontWeight: sel ? '700' : '400' }}>{opt.label}</Text>
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
    paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#23262B',
  },
  darkLabel: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  darkInput: {
    backgroundColor: FIELD_BG, borderRadius: 10, paddingHorizontal: 14, minHeight: 52,
    flexDirection: 'row', alignItems: 'center',
  },
  fieldWrap: { marginBottom: 16 },
  fieldRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },

  // Profile
  profileAvatar: { width: 140, height: 140, borderRadius: 70, alignSelf: 'center', marginTop: 16, backgroundColor: '#222' },
  setStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', marginTop: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: RED },
  switchPill: {
    backgroundColor: '#fff', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center', gap: 14, alignSelf: 'center', marginTop: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 20, marginTop: 24, marginBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: DARK_DIVIDER,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DARK_DIVIDER,
  },

  // EditProfile avatar
  editAvatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#222' },
  editBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15,
    backgroundColor: RED, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: DARK_BG,
  },

  // Settings
  lightRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },

  // Help
  helpBox: { borderWidth: 1, borderRadius: 12, padding: 16, height: 340 },

  // SideDrawer
  drawer: { width: '78%', backgroundColor: NAVY },
  drawerBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14,
    backgroundColor: RED, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: NAVY,
  },
  drawerDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#2E3647', marginVertical: 22 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },

  // SetStatus modal
  statusScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  statusCard: { width: '100%', borderRadius: 18, paddingVertical: 28, paddingHorizontal: 28 },
  statusTitle: { fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 18 },
  statusDivider: { height: StyleSheet.hairlineWidth },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 20 },
  statusRadio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
});
