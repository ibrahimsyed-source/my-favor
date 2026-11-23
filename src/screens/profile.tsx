import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, TextInput, TouchableOpacity, Pressable, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform, Modal, ActivityIndicator, Linking, Switch, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Txt, Avatar } from '../components';
import { fonts } from '../theme';
import { useStore } from '../store';
import { ApiError } from '../api/client';
import { pickAndUploadImage } from '../lib/upload';
import { User } from '../types';
import {
  suggestAddressesApi, resolvePlaceApi, geocodeServerApi, reverseGeocodeApi, AddressSuggestion,
} from '../api/endpoints';
import { getCurrentLocation } from '../lib/location';

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
  text: '#0D0A0A',
  sub: '#767676', // gray body / row subtitles
  placeholder: '#9A9A9A',
  divider: '#ECECEC',
  input: '#EFEFEF',
  cta: '#141414', // black CTA bars
  red: '#ED1C24',
  star: '#FFBD00',
  toggleOff: '#E4E4E6',
} as const;

// ---------------------------------------------------------------------------
// Provider App v.2 DARK kit — pal-mode (user.role === 'pal') variants of these
// account screens mirror payouts.tsx: page fill #0D0A0A, navy sheets/rows/
// dividers #252A38, navy field fills #2E3442, white text/labels, and white
// primary buttons with black labels. The same helpers below render this kit
// when passed `dark`, so member (light) and pal (dark) share one component.
// ---------------------------------------------------------------------------
const D = {
  bg: '#0D0A0A',
  sheet: '#252A38', // navy rows / cards / dividers
  field: '#2E3442', // navy filled input (a shade lighter than the sheet)
  text: '#FFFFFF',
  sub: '#B9B4B4', // secondary / body text
  placeholder: 'rgba(255,255,255,0.4)',
  divider: '#252A38',
  border: 'rgba(255,255,255,0.10)',
  red: '#ED1C24',
  ctaBg: '#FFFFFF', // provider primary CTA — white pill…
  ctaText: '#000000', // …with a black label
} as const;

const POPPINS_MEDIUM = 'Poppins_500Medium'; // registered in App.tsx

// ---------------------------------------------------------------------------
// v.2 light building blocks
// ---------------------------------------------------------------------------
function LightHeader({ title, onBack, onEdit, dark }: { title: string; onBack?: () => void; onEdit?: () => void; dark?: boolean }) {
  const ink = dark ? D.text : L.text;
  return (
    <View style={[st.header, dark && st.headerDark]}>
      <View style={{ width: 44 }}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={24} color={ink} />
          </TouchableOpacity>
        ) : null}
      </View>
      <Txt style={dark ? { ...st.headerTitle, color: D.text } : st.headerTitle} center>{title}</Txt>
      <View style={{ width: 44, alignItems: 'flex-end' }}>
        {onEdit ? (
          <TouchableOpacity onPress={onEdit} hitSlop={12} accessibilityRole="button" accessibilityLabel="Edit profile">
            <Ionicons name="pencil" size={20} color={ink} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// Black CTA bar (SAVE / SUBMIT / CONTINUE / DELETE MY ACCOUNT) — 48px, r8.
function Cta({ title, onPress, disabled, loading, style, dark }: {
  title: string; onPress?: () => void; disabled?: boolean; loading?: boolean; style?: any; dark?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={!!disabled || !!loading}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      style={[dark ? st.ctaDark : st.cta, disabled && { opacity: 0.4 }, style]}
    >
      {loading ? <ActivityIndicator color={dark ? D.ctaText : '#FFFFFF'} /> : <Txt style={dark ? st.ctaTextDark : st.ctaText}>{title}</Txt>}
    </TouchableOpacity>
  );
}

// Centered white alert card (Edit Profile - Success Modal #125:7632).
function LightModal({ visible, title, message, buttonLabel, onClose, dark }: {
  visible: boolean; title: string; message: string; buttonLabel: string; onClose: () => void; dark?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
      <Pressable style={st.scrim} onPress={onClose}>
        <Pressable style={[st.alertCard, dark && st.alertCardDark]} onPress={() => {}}>
          <Txt style={dark ? { ...st.alertTitle, color: D.text } : st.alertTitle} center>{title}</Txt>
          <Txt style={dark ? { ...st.alertMsg, color: D.sub } : st.alertMsg} center>{message}</Txt>
          <Cta title={buttonLabel} onPress={onClose} dark={dark} style={{ height: 40, marginTop: 18 }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Gray filled input with a light label above (Edit Profile #125:7568).
// `editable={false}` renders a greyed, read-only field (used for identity
// fields that can't be changed here); `note` prints a small hint beneath it.
function LightField({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, multiline, maxLength, autoCapitalize, dark, editable, note }: any) {
  const [hide, setHide] = useState(!!secureTextEntry);
  const readOnly = editable === false;
  return (
    <View style={{ flex: 1 }}>
      {label ? <Txt style={dark ? { ...st.fieldLabel, color: D.text } : st.fieldLabel}>{label}</Txt> : null}
      <View style={[st.fieldBox, dark && st.fieldBoxDark, multiline && st.fieldBoxMulti, readOnly && st.fieldBoxDisabled]}>
        <TextInput
          style={[st.fieldInput, dark && { color: D.text }, readOnly && { color: dark ? D.sub : L.sub }, multiline && { paddingVertical: 0, height: '100%' }]}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          placeholder={placeholder}
          placeholderTextColor={dark ? D.placeholder : L.placeholder}
          secureTextEntry={hide}
          keyboardType={keyboardType}
          multiline={multiline}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          textAlignVertical={multiline ? 'top' : 'center'}
        />
        {secureTextEntry ? (
          <TouchableOpacity onPress={() => setHide((h: boolean) => !h)} hitSlop={8} accessibilityRole="button" accessibilityLabel={hide ? 'Show password' : 'Hide password'}>
            <Ionicons name={hide ? 'eye' : 'eye-off'} size={18} color={dark ? D.text : L.text} />
          </TouchableOpacity>
        ) : null}
      </View>
      {note ? <Txt style={dark ? { ...st.fieldNote, color: D.sub } : st.fieldNote}>{note}</Txt> : null}
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

function PhoneField({ value, onChangeText, dark, editable, note }: any) {
  const readOnly = editable === false;
  return (
    <View>
      <Txt style={dark ? { ...st.fieldLabel, color: D.text } : st.fieldLabel}>Phone Number</Txt>
      <View style={[st.fieldBox, dark && st.fieldBoxDark, readOnly && st.fieldBoxDisabled]} accessibilityLabel="Country code, United States, plus 1">
        <USFlag />
        <Txt style={{ fontFamily: POPPINS_MEDIUM, fontSize: 14, color: dark ? D.text : L.text, marginLeft: 7, marginRight: 3 }}>+1</Txt>
        <Ionicons name="chevron-down" size={13} color={dark ? D.text : L.text} />
        <TextInput
          style={[st.fieldInput, { marginLeft: 14 }, dark && { color: D.text }, readOnly && { color: dark ? D.sub : L.sub }]}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          placeholder="8000 - 000 - 000"
          placeholderTextColor={dark ? D.placeholder : L.placeholder}
          keyboardType="phone-pad"
        />
      </View>
      {note ? <Txt style={dark ? { ...st.fieldNote, color: D.sub } : st.fieldNote}>{note}</Txt> : null}
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
function ProfileBody({ navigation, onBack, showSetStatus, showBlocked, showPrefs }: { navigation: any; onBack?: () => void; showSetStatus?: boolean; showBlocked?: boolean; showPrefs?: boolean }) {
  const s = useStore();
  const user = s.user;
  const [confirming, setConfirming] = useState(false);
  const [agree, setAgree] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  // Pal discovery preferences — the radius chip sheet + the Favor-home address
  // sheet open from the Settings rows below (pal-only).
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [homeOpen, setHomeOpen] = useState(false);
  if (!user) return null;

  const isPal = user.role === 'pal';
  const dark = isPal; // pal mode renders the Provider App v.2 dark Settings

  const runDelete = async () => {
    setDeleting(true);
    const ok = await s.deleteAccount();
    // Success: the store wipes the session + signs out; the auth navigator
    // unmounts this screen. Only a FAILURE leaves anything to render.
    if (!ok) {
      setDeleting(false);
      setConfirming(false);
      setNotice({
        title: 'Account Not Deleted',
        message: 'We couldn’t delete your account right now. Your account is still active — please try again.',
      });
    }
  };

  const switchRole = async () => {
    if (switching) return;
    if (!isPal && !user.palVerified) { navigation.navigate('Vetting'); return; }
    setSwitching(true);
    const ok = await s.setRole(isPal ? 'member' : 'pal'); // optimistic in the store; reverts itself on failure
    setSwitching(false);
    if (!ok) {
      setNotice({
        title: 'Couldn’t Switch',
        message: 'Your role wasn’t changed. Please check your connection and try again.',
      });
    }
  };

  const runUnblock = async (userId: string) => {
    if (unblockingId) return;
    setUnblockingId(userId);
    const ok = await s.unblockUser(userId);
    setUnblockingId(null);
    if (!ok) {
      setNotice({
        title: 'Couldn’t Unblock',
        message: 'This user is still blocked. Please check your connection and try again.',
      });
    }
  };

  // Favor alerts master switch — the store flips user.notifyFavors optimistically
  // and reverts itself on failure (same contract as setStatus), so the Switch
  // visibly snaps back; we only need to surface the failure.
  const toggleNotify = async (on: boolean) => {
    const ok = await s.setNotifyFavors(on);
    if (!ok) {
      setNotice({
        title: 'Couldn’t Update',
        message: 'Your Favor alert preference didn’t save. Please check your connection and try again.',
      });
    }
  };

  // Radius is optimistic in the store too — close the sheet immediately (the
  // subtitle already reflects the new value) and only surface a save failure.
  const chooseRadius = async (miles: number) => {
    setRadiusOpen(false);
    const ok = await s.setPalRadius(miles);
    if (!ok) {
      setNotice({
        title: 'Couldn’t Update',
        message: 'Your Favor radius didn’t save. Please check your connection and try again.',
      });
    }
  };

  // Role-aware favor count: User.totalFavors only counts favors done AS a pal,
  // so member mode counts their own completed requests from history instead.
  const totalFavors = isPal
    ? user.totalFavors
    : s.history.filter((f) => f.memberId === user.id && f.status === 'completed').length;
  const ratingValue = isPal ? user.rating : user.memberRating ?? 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: dark ? D.bg : L.bg }}>
      <LightHeader title="Profile" onBack={onBack} onEdit={() => navigation.navigate('EditProfile')} dark={dark} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignSelf: 'center', marginTop: 18 }}>
          <Avatar uri={user.avatar} name={user.firstName} size={124} />
        </View>
        <Txt style={dark ? { ...st.profileName, color: D.text } : st.profileName} center>{user.firstName}</Txt>

        {/* Availability is a PAL concept (broadcast/directory visibility) —
            member mode hides the link entirely. */}
        {showSetStatus && isPal ? (
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

        <Txt style={dark ? { ...st.profileBio, color: D.sub } : st.profileBio} center>{user.bio}</Txt>

        {/* Role switch pill — white in both themes (dark text reads on white).
            Same vetting gate as the dashboard/providers switches: an unvetted
            user heads to Driver Information instead of a pal mode they can't
            accept favors in. */}
        <View style={st.switchPill}>
          <Txt style={st.switchPillText}>{isPal ? 'Switch to request a favor' : 'Switch to be a favor pal'}</Txt>
          <TinyToggle value={isPal} onChange={() => { void switchRole(); }} />
        </View>

        {/* Stats */}
        <View style={st.statsRow}>
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <Txt style={dark ? { ...st.statValue, color: D.text } : st.statValue}>{String(totalFavors)}</Txt>
            <Txt style={dark ? { ...st.statLabel, color: D.sub } : st.statLabel}>Total Favors</Txt>
          </View>
          {/* Role-aware: pals show their pal rating (member->pal reviews);
              members show their member rating (pal->member reviews). An
              unrated user shows 'New' — the app-wide convention, not '0.0'.
              Tapping opens My Reviews (the reviews behind this number). */}
          <TouchableOpacity
            style={{ flex: 1, alignItems: 'center' }}
            onPress={() => navigation.navigate('MyReviews')}
            accessibilityRole="button"
            accessibilityLabel="Rating — view my reviews"
          >
            <Txt style={dark ? { ...st.statValue, color: D.text } : st.statValue}>
              {ratingValue > 0 ? ratingValue.toFixed(1) : 'New'}
            </Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <Ionicons name="star" size={12} color={L.star} />
              <Txt style={dark ? { ...st.statLabel, marginTop: 0, color: D.sub } : { ...st.statLabel, marginTop: 0 }}>Rating</Txt>
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Txt style={dark ? { ...st.statValue, color: D.text } : st.statValue}>{String(user.yearsActive)}</Txt>
            <Txt style={dark ? { ...st.statLabel, color: D.sub } : st.statLabel}>Years</Txt>
          </View>
        </View>

        {/* Contact rows */}
        <View style={[st.divider, { marginTop: 22 }, dark && { backgroundColor: D.divider }]} />
        <InfoRow icon="mail" title="Email" subtitle={user.email} onPress={() => navigation.navigate('EditProfile')} dark={dark} />
        <InfoRow icon="call" title="Phone" subtitle={user.phone} onPress={() => navigation.navigate('EditProfile')} dark={dark} />
        <InfoRow icon="home" title="Home" subtitle={user.homeAddress} onPress={() => navigation.navigate('EditProfile')} dark={dark} />
        <InfoRow icon="lock-closed" title="Password" subtitle="Change Password" onPress={() => navigation.navigate('EditProfile')} dark={dark} />

        {/* Favor preferences — pal-only, Settings only (showPrefs). Server-backed
            discovery prefs: the master alert switch, the discovery radius, and the
            home anchor favors are measured from. Members never see these. */}
        {showPrefs && isPal ? (
          <View style={{ marginTop: 26 }}>
            <Txt style={dark ? { ...st.blockedHeading, color: D.text } : st.blockedHeading}>Favor preferences</Txt>
            <PrefRow
              icon="notifications"
              title="Favor alerts"
              subtitle="Get notified when a new favor opens near you."
              dark={dark}
              right={
                <Switch
                  value={user.notifyFavors ?? true}
                  onValueChange={(v) => { void toggleNotify(v); }}
                  trackColor={{ false: dark ? '#3A3F4D' : L.toggleOff, true: L.red }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={dark ? '#3A3F4D' : L.toggleOff}
                  accessibilityLabel="Favor alerts"
                />
              }
            />
            <PrefRow
              icon="navigate"
              title="Favor radius"
              subtitle={`${user.palRadiusMiles ?? 25} miles`}
              onPress={() => setRadiusOpen(true)}
              dark={dark}
              right={<Ionicons name="chevron-forward" size={18} color={dark ? D.sub : L.sub} />}
            />
            <PrefRow
              icon="location"
              title="Favor home"
              subtitle={user.palHomeAddress || 'Not set — you’ll see favors everywhere'}
              onPress={() => setHomeOpen(true)}
              dark={dark}
              right={<Ionicons name="chevron-forward" size={18} color={dark ? D.sub : L.sub} />}
            />
          </View>
        ) : null}

        {/* Blocked users — Settings only; hidden while nobody is blocked. The
            store only knows ids; pals resolve to a name via the directory. */}
        {showBlocked && s.blockedUsers.length > 0 ? (
          <View style={{ marginTop: 26 }}>
            <Txt style={dark ? { ...st.blockedHeading, color: D.text } : st.blockedHeading}>Blocked users</Txt>
            {s.blockedUsers.map((id) => {
              const known = s.palById(id);
              const name = known ? `${known.firstName} ${known.lastName}`.trim() : 'Blocked user';
              const busy = unblockingId === id;
              return (
                <View key={id} style={[st.blockedRow, dark && { borderBottomColor: D.divider }]}>
                  <Avatar uri={known?.avatar} name={known?.firstName ?? '?'} size={36} />
                  <Txt style={dark ? { ...st.blockedName, color: D.text } : st.blockedName} numberOfLines={1}>{name}</Txt>
                  <TouchableOpacity
                    onPress={() => { void runUnblock(id); }}
                    disabled={!!unblockingId}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Unblock ${name}`}
                    accessibilityState={{ disabled: !!unblockingId, busy }}
                  >
                    {busy
                      ? <ActivityIndicator size="small" color={L.red} />
                      : <Txt style={st.unblockText}>UNBLOCK</Txt>}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : null}

        <Cta
          title="DELETE MY ACCOUNT"
          onPress={() => { setAgree(false); setConfirming(true); }}
          dark={dark}
          style={{ marginTop: 30 }}
        />
      </ScrollView>

      {/* Settings - Delete account (#1196:18885) — checkbox confirm modal.
          Copy matches the frame, with the design's "within45days"/"cetain"
          typos corrected per app policy ("within 45 days"/"certain").
          App Store 5.1.1(v): deletion initiated + completed in-app. */}
      <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => !deleting && setConfirming(false)} accessibilityViewIsModal>
        <Pressable style={st.scrim} onPress={() => !deleting && setConfirming(false)}>
          <Pressable style={[st.deleteCard, dark && { backgroundColor: D.sheet }]} onPress={() => {}}>
            <Txt style={dark ? { ...st.deleteTitle, color: D.text } : st.deleteTitle} center>DELETE MY ACCOUNT</Txt>
            <Txt style={dark ? { ...st.deleteBody, color: D.sub } : st.deleteBody}>
              Once your request is processed, your personal information will be permanently deleted within 45 days, with the exception of certain information we are legally required or permitted to retain.{'\n'}
              Please consider your request as you will immediately be signed out of the app and this cannot be undone.
            </Txt>
            <TouchableOpacity
              style={st.checkRow}
              activeOpacity={0.7}
              onPress={() => setAgree((a) => !a)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agree }}
            >
              <View style={[st.checkbox, dark && { borderColor: D.text }, agree && { backgroundColor: dark ? D.text : L.text }]}>
                {agree ? <Ionicons name="checkmark" size={13} color={dark ? D.ctaText : '#FFFFFF'} /> : null}
              </View>
              <Txt style={dark ? { ...st.checkText, color: D.text } : st.checkText}>
                Yes, I want to permanently delete my account.{'\n'}
                I understand I will be signed out of MyFavor app and no longer able to access the app or sign in
              </Txt>
            </TouchableOpacity>
            <Cta title="DELETE MY ACCOUNT" onPress={runDelete} disabled={!agree} loading={deleting} dark={dark} style={{ height: 42, marginTop: 18 }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Pal discovery-preference sheets (pal mode → always the dark v.2 kit). */}
      <RadiusModal
        visible={radiusOpen}
        value={user.palRadiusMiles ?? 25}
        onSelect={(m) => { void chooseRadius(m); }}
        onClose={() => setRadiusOpen(false)}
      />
      <HomeModal
        visible={homeOpen}
        user={user}
        onSave={(lat, lng, address) => s.setPalHome(lat, lng, address)}
        onClear={() => s.setPalHome(null, null, null)}
        onClose={() => setHomeOpen(false)}
      />

      {/* Failure notices (delete / role switch / unblock / prefs didn't stick). */}
      <LightModal
        visible={!!notice}
        title={notice?.title ?? ''}
        message={notice?.message ?? ''}
        buttonLabel="OK"
        onClose={() => setNotice(null)}
        dark={dark}
      />
    </SafeAreaView>
  );
}

function InfoRow({ icon, title, subtitle, onPress, dark }: any) {
  // An unset subtitle must not be read out as the literal word "undefined".
  const a11y = subtitle ? `${title}, ${subtitle}` : title;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[st.infoRow, dark && { borderBottomColor: D.divider }]} accessibilityRole="button" accessibilityLabel={a11y}>
      <Ionicons name={icon} size={17} color={dark ? D.text : L.text} style={{ width: 34, marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Txt style={dark ? { ...st.infoTitle, color: D.text } : st.infoTitle}>{title}</Txt>
        <Txt style={dark ? { ...st.infoSub, color: D.sub } : st.infoSub} numberOfLines={1}>{subtitle}</Txt>
      </View>
    </TouchableOpacity>
  );
}

// Settings row with a trailing control (a Switch, or a chevron into a sheet).
// Like InfoRow but vertically centered so the control lines up with the text,
// and it renders as a plain row when there's no onPress (the Switch IS the
// control — the whole row shouldn't double as a button over it).
function PrefRow({ icon, title, subtitle, onPress, right, dark }: any) {
  const ink = dark ? D.text : L.text;
  const a11y = subtitle ? `${title}, ${subtitle}` : title;
  const inner = (
    <>
      <Ionicons name={icon} size={17} color={ink} style={{ width: 34 }} />
      <View style={{ flex: 1 }}>
        <Txt style={dark ? { ...st.infoTitle, color: D.text } : st.infoTitle}>{title}</Txt>
        {subtitle ? (
          <Txt style={dark ? { ...st.infoSub, color: D.sub } : st.infoSub} numberOfLines={2}>{subtitle}</Txt>
        ) : null}
      </View>
      {right ?? null}
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[st.prefRow, dark && { borderBottomColor: D.divider }]} accessibilityRole="button" accessibilityLabel={a11y}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={[st.prefRow, dark && { borderBottomColor: D.divider }]}>{inner}</View>;
}

// Discovery-radius sheet — a navy card of mile chips (Provider v.2 dark kit).
// Presentational: onSelect fires with the tapped value; the parent closes the
// sheet + persists (optimistic in the store). Always dark — pal-mode only.
const RADIUS_OPTIONS = [5, 10, 25, 50, 100] as const;

function RadiusModal({ visible, value, onSelect, onClose }: {
  visible: boolean; value: number; onSelect: (m: number) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
      <Pressable style={[st.scrim, { paddingHorizontal: 28 }]} onPress={onClose}>
        <Pressable style={st.prefSheet} onPress={() => {}}>
          <Txt style={st.prefSheetTitle} center>Favor radius</Txt>
          <Txt style={st.prefSheetBody} center>Only alert me about favors within this distance of my Favor home.</Txt>
          <View style={st.chipRow}>
            {RADIUS_OPTIONS.map((m) => {
              const sel = value === m;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => onSelect(m)}
                  activeOpacity={0.8}
                  style={[st.chip, sel && st.chipSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel }}
                  accessibilityLabel={`${m} miles`}
                >
                  <Txt style={sel ? st.chipTextSelected : st.chipText}>{m}</Txt>
                  <Txt style={sel ? st.chipUnitSelected : st.chipUnit}>mi</Txt>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Favor-home sheet — a lightweight address setter reusing the server geo proxy
// (suggest → resolve, forward-geocode on save) plus a "use my current location"
// shortcut. Mirrors ConfirmAddress's epoch-guarded lookup discipline so a slow
// response can't clobber text the pal has since changed. onSave is the store's
// setPalHome (server-confirmed); a false result surfaces inline. Always dark.
function HomeModal({ visible, user, onSave, onClear, onClose }: {
  visible: boolean; user: User;
  onSave: (lat: number, lng: number, address: string) => Promise<boolean>;
  onClear: () => Promise<boolean>;
  onClose: () => void;
}) {
  const seedCoord = () =>
    (user.palHomeLat != null && user.palHomeLng != null
      ? { lat: user.palHomeLat, lng: user.palHomeLng }
      : null);
  const [addr, setAddr] = useState(user.palHomeAddress ?? '');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(seedCoord);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One epoch guards every background lookup (suggest / resolve / reverse / GPS):
  // a newer action bumps it and a late response only applies while its epoch is
  // current — same discipline as ConfirmAddress.
  const epoch = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const supersede = useCallback(() => {
    epoch.current += 1;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);
  useEffect(() => () => supersede(), [supersede]); // unmount: drop in-flight lookups

  // Re-seed from the latest saved home every time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    supersede();
    setAddr(user.palHomeAddress ?? '');
    setCoord(seedCoord());
    setSuggestions([]);
    setError(null);
    setBusy(false);
    setLocating(false);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = useCallback((t: string) => {
    supersede();
    setAddr(t);
    setCoord(null); // edited text no longer matches any picked/located point
    setError(null);
    const q = t.trim();
    if (q.length < 3) { setSuggestions([]); return; }
    const e = epoch.current;
    timer.current = setTimeout(async () => {
      try {
        const { suggestions: list } = await suggestAddressesApi(q);
        if (e === epoch.current) setSuggestions(list);
      } catch { /* suggestions are best-effort — typing + Save still works */ }
    }, 350);
  }, [supersede]);

  const pick = useCallback(async (sug: AddressSuggestion) => {
    supersede();
    const e = epoch.current;
    setSuggestions([]);
    setAddr(sug.description);
    setError(null);
    Keyboard.dismiss();
    try {
      const { location } = await resolvePlaceApi(sug.id);
      if (e !== epoch.current || !location) return; // superseded / unresolvable
      setCoord({ lat: location.lat, lng: location.lng });
    } catch { /* keep the description; Save forward-geocodes it */ }
  }, [supersede]);

  const useCurrent = useCallback(async () => {
    if (locating) return;
    supersede();
    const e = epoch.current;
    setLocating(true);
    setError(null);
    Keyboard.dismiss();
    // Explicit action → getCurrentLocation (prompts at the contextual moment),
    // not getKnownLocation, so the button isn't a silent no-op when permission
    // was never granted.
    const c = await getCurrentLocation();
    if (e !== epoch.current) { setLocating(false); return; }
    if (!c) {
      setLocating(false);
      setError('We couldn’t get your current location. Allow location access or type an address.');
      return;
    }
    setCoord(c);
    let label: string | null = null;
    try {
      const { location } = await reverseGeocodeApi(c.lat, c.lng);
      label = location?.address ?? null;
    } catch { label = null; }
    if (e !== epoch.current) { setLocating(false); return; }
    // No nameable address (rural fix / lookup failure): show honest coordinates
    // rather than leave a stale label.
    setAddr(label ?? `Current location (${c.lat.toFixed(5)}, ${c.lng.toFixed(5)})`);
    setSuggestions([]);
    setLocating(false);
  }, [locating, supersede]);

  const canSave = addr.trim().length > 0 && !busy && !locating;
  const save = useCallback(async () => {
    const trimmed = addr.trim();
    if (!trimmed || busy || locating) return;
    supersede();
    setSuggestions([]);
    setBusy(true);
    setError(null);
    // A picked suggestion / located fix already carries exact coordinates; only
    // free-typed text needs the forward geocode.
    let resolved = coord;
    if (!resolved) {
      try {
        const { location } = await geocodeServerApi(trimmed);
        resolved = location ? { lat: location.lat, lng: location.lng } : null;
      } catch { resolved = null; }
    }
    if (!resolved) {
      setBusy(false);
      setError('We couldn’t find that address. Please pick a suggestion or try again.');
      return;
    }
    const ok = await onSave(resolved.lat, resolved.lng, trimmed);
    setBusy(false);
    if (!ok) {
      setError('Couldn’t save your Favor home. Please check your connection and try again.');
      return;
    }
    onClose();
  }, [addr, busy, locating, coord, onSave, onClose, supersede]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[st.scrim, { paddingHorizontal: 24 }]} onPress={onClose}>
          <Pressable style={st.prefSheet} onPress={() => {}}>
            <Txt style={st.prefSheetTitle} center>Favor home</Txt>
            <Txt style={st.prefSheetBody} center>We’ll alert you about favors within your radius of this place. Leave it unset to see favors everywhere.</Txt>

            <View style={st.homeField}>
              <Ionicons name="locate" size={18} color={D.red} style={{ marginLeft: 12 }} />
              <TextInput
                value={addr}
                onChangeText={onChange}
                placeholder="Enter your home or work address"
                placeholderTextColor={D.placeholder}
                style={st.homeInput}
                numberOfLines={1}
                returnKeyType="done"
                accessibilityLabel="Favor home address"
              />
              {addr.length > 0 ? (
                <TouchableOpacity onPress={() => onChange('')} hitSlop={10} style={{ marginRight: 12 }} accessibilityRole="button" accessibilityLabel="Clear address">
                  <Ionicons name="close" size={16} color={D.text} />
                </TouchableOpacity>
              ) : null}
            </View>

            {suggestions.length > 0 ? (
              <View style={st.homeSuggestBox}>
                {suggestions.map((sug, i) => (
                  <TouchableOpacity
                    key={sug.id}
                    style={[st.homeSuggestRow, i > 0 && st.homeSuggestDivider]}
                    onPress={() => void pick(sug)}
                    accessibilityRole="button"
                    accessibilityLabel={`Use address ${sug.description}`}
                  >
                    <Ionicons name="location-outline" size={15} color={D.red} />
                    <Txt style={st.homeSuggestText} numberOfLines={1}>{sug.description}</Txt>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <TouchableOpacity
              onPress={() => void useCurrent()}
              disabled={locating}
              style={st.currentLocBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Use my current location"
              accessibilityState={{ disabled: locating, busy: locating }}
            >
              {locating ? <ActivityIndicator size="small" color={D.text} /> : <Ionicons name="navigate" size={16} color={D.text} />}
              <Txt style={st.currentLocText}>{locating ? 'Locating…' : 'Use my current location'}</Txt>
            </TouchableOpacity>

            {error ? (
              <View accessibilityLiveRegion="polite">
                <Txt style={st.homeError} center>{error}</Txt>
              </View>
            ) : null}

            <Cta title="SAVE FAVOR HOME" onPress={() => void save()} disabled={!canSave} loading={busy} dark style={{ marginTop: 14 }} />
            {user.palHomeLat != null ? (
              <TouchableOpacity
                onPress={async () => {
                  if (busy || locating) return;
                  setBusy(true); setError(null);
                  const ok = await onClear();
                  setBusy(false);
                  if (ok) onClose();
                  else setError('Couldn’t clear your Favor home. Please try again.');
                }}
                style={{ marginTop: 12 }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear Favor home and see favors everywhere"
              >
                <Txt style={{ ...st.homeCancel, color: D.red }} center>Clear Favor home</Txt>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={onClose} style={{ marginTop: 12 }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel">
              <Txt style={st.homeCancel} center>Cancel</Txt>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// 1. Profile — root tab (no back chevron), same v.2 design.
export const Profile = ({ navigation }: any) => (
  <ProfileBody navigation={navigation} showSetStatus />
);

// 2. Settings — "Settings - Revised" frame #125:7465 (in-app title "Profile").
// showSetStatus surfaces the red "Set Status" link under the name — required by
// the Provider App v.2 dark Settings (#181:9932); pal mode only (ProfileBody
// hides it for members). Settings is also where blocked users are managed.
export const Settings = ({ navigation }: any) => (
  <ProfileBody navigation={navigation} onBack={() => navigation.goBack()} showSetStatus showBlocked showPrefs />
);

// ===========================================================================
// 3. EditProfile — light form (#125:7568) + Success modal (#125:7632).
// ===========================================================================
export const EditProfile = ({ navigation }: any) => {
  const s = useStore();
  const u = s.user;
  const dark = u?.role === 'pal'; // pal mode → Provider App v.2 dark Edit Profile (#181:10544)
  const [firstName, setFirstName] = useState(u?.firstName ?? '');
  const [lastName, setLastName] = useState(u?.lastName ?? '');
  const [bio, setBio] = useState(u?.bio ?? '');
  // Email & phone are identity-bearing and CANNOT be changed via PATCH
  // /profile/me — the server schema is .strict() and would 400 the whole save.
  // Show them read-only (below) instead of as free-edit fields that falsely
  // report "Success" while silently discarding the change.
  const email = u?.email ?? '';
  const phone = u?.phone ?? '';
  const [homeAddress, setHomeAddress] = useState(u?.homeAddress ?? '');
  const [city, setCity] = useState(u?.city ?? '');
  const [stateName, setStateName] = useState(u?.state ?? '');
  const [zip, setZip] = useState(u?.zip ?? '');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [avatar, setAvatar] = useState(u?.avatar);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [modal, setModal] = useState<{ title: string; message: string; success?: boolean } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Pick + upload in one step: the lib returns a hosted https URL (null =
  // picker cancelled), so `avatar` only ever holds a URL the server's
  // .url() contract accepts. Failures are surfaced honestly in the modal.
  const pickImage = async () => {
    if (avatarBusy) return;
    setAvatarBusy(true);
    try {
      const res = await pickAndUploadImage('avatar');
      if (res === null) return; // user cancelled the picker
      if (res.ok) setAvatar(res.url);
      else setModal({ title: 'Couldn’t Update Photo', message: res.reason });
    } finally {
      setAvatarBusy(false);
    }
  };

  // First SAVE (after Zip Code) — profile fields only.
  // NOTE: email and phone are identity-bearing and intentionally NOT updatable
  // via PATCH /profile/me (the server schema is .strict() and rejects them, so
  // including them 400s the whole save). Send only the editable fields.
  const saveProfile = async () => {
    if (savingProfile) return;
    // A photo still uploading has no hosted URL yet — saving now would drop it
    // (and the success modal navigates away). Say so instead of losing it.
    if (avatarBusy) {
      setModal({
        title: 'Photo Still Uploading',
        message: 'Your new photo is still uploading — give it a moment, then save again.',
      });
      return;
    }
    // The server requires a non-empty first/last name (updateSchema min(1)) —
    // name the problem here instead of round-tripping into a generic 400.
    if (!firstName.trim() || !lastName.trim()) {
      setModal({
        title: 'Couldn’t Save Changes',
        message: 'First and last name are required — please fill them in and save again.',
      });
      return;
    }
    setSavingProfile(true);
    try {
      await s.updateProfile({
        firstName, lastName, bio,
        homeAddress, city, state: stateName, zip,
        // The avatar is uploaded to a hosted https URL the moment it is picked
        // (pickAndUploadImage), so it rides in the same PATCH as the text
        // fields; an unchanged avatar is omitted to keep the patch minimal.
        ...(avatar && avatar !== u?.avatar ? { avatar } : {}),
      });
    } catch (e) {
      // Surface the failure honestly: a server rejection (validation etc.)
      // shows the server's verdict — only a genuine network failure blames
      // the connection.
      setSavingProfile(false);
      const serverSaysNo = e instanceof ApiError && e.status > 0;
      setModal({
        title: "Couldn't Save Changes",
        message: serverSaysNo
          ? (e.code === 'validation_error'
            ? 'The server rejected these changes — please check your entries and try again.'
            : e.message)
          : 'Something went wrong while saving your profile. Please check your connection and try again.',
      });
      return;
    }
    setSavingProfile(false);
    setModal({ title: 'Success!', message: 'User Profile has been Successfully updated', success: true });
  };

  // Second SAVE (after New Password) — password change only. The in-flight
  // state matters here: a double-tap used to fire TWO change calls, the second
  // failing against the fresh hash and replacing 'Success!' with an error.
  const savePassword = async () => {
    if (savingPassword) return;
    // Client-side guard: the server requires a new password of at least 8
    // characters (auth.routes.ts passwordSchema). Short-circuit obviously
    // invalid input before the 400 round-trip and keep the copy in sync.
    if (!currentPw || newPw.length < 8) {
      setModal({
        title: 'Password Not Changed',
        message: 'Enter your current password and a new password of at least 8 characters.',
      });
      return;
    }
    setSavingPassword(true);
    const ok = await s.changePassword(currentPw, newPw);
    setSavingPassword(false);
    if (!ok) {
      setModal({
        title: 'Password Not Changed',
        message: 'Enter your current password and a new password of at least 8 characters.',
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
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: dark ? D.bg : L.bg }}>
      <LightHeader title="Edit Profile" onBack={() => navigation.goBack()} dark={dark} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Avatar with red edit badge (scrim + spinner while uploading) */}
          <View style={{ alignSelf: 'center', marginTop: 6, marginBottom: 26 }}>
            <Avatar uri={avatar} name={firstName} size={124} />
            {avatarBusy ? (
              <View style={st.avatarBusy}>
                <ActivityIndicator color="#FFFFFF" />
              </View>
            ) : null}
            <TouchableOpacity
              onPress={pickImage}
              disabled={avatarBusy}
              style={st.editBadge}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Change photo"
              accessibilityState={{ disabled: avatarBusy, busy: avatarBusy }}
            >
              <Ionicons name="pencil" size={15} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={st.fieldRow}>
            <LightField label="First Name" value={firstName} onChangeText={setFirstName} dark={dark} />
            <LightField label="Last Name" value={lastName} onChangeText={setLastName} dark={dark} />
          </View>

          <View style={st.fieldWrap}>
            <LightField label="Bio" value={bio} onChangeText={setBio} multiline maxLength={300} dark={dark} />
          </View>

          <View style={st.fieldWrap}>
            <LightField label="Email Address" value={email} editable={false} keyboardType="email-address" autoCapitalize="none" dark={dark} note="Contact account support to change your email." />
          </View>

          <View style={st.fieldWrap}>
            <PhoneField value={phone} editable={false} dark={dark} note="Contact account support to change your phone number." />
          </View>

          <View style={st.fieldWrap}>
            <LightField label="Home Address" value={homeAddress} onChangeText={setHomeAddress} dark={dark} />
          </View>

          <View style={st.fieldRow}>
            <LightField label="City" value={city} onChangeText={setCity} dark={dark} />
            <LightField label="State" value={stateName} onChangeText={setStateName} dark={dark} />
          </View>

          <View style={st.fieldWrap}>
            <LightField label="Zip Code" value={zip} onChangeText={setZip} keyboardType="number-pad" dark={dark} />
          </View>

          <Cta title="SAVE" onPress={saveProfile} loading={savingProfile} dark={dark} style={{ marginTop: 10 }} />

          <View style={[st.fieldWrap, { marginTop: 26 }]}>
            <LightField label="Current Password" value={currentPw} onChangeText={setCurrentPw} secureTextEntry dark={dark} />
          </View>

          <View style={st.fieldWrap}>
            <LightField label="New Password" value={newPw} onChangeText={setNewPw} secureTextEntry dark={dark} />
          </View>

          <Cta title="SAVE" onPress={savePassword} loading={savingPassword} dark={dark} style={{ marginTop: 10 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      <LightModal
        visible={!!modal}
        title={modal?.title ?? ''}
        message={modal?.message ?? ''}
        buttonLabel="OK"
        onClose={closeModal}
        dark={dark}
      />
    </SafeAreaView>
  );
};

// ===========================================================================
// 4. Help — support contact (#125:7401 layout, EMAIL CTA). The old in-app
// composer silently discarded the message (no support endpoint exists), so per
// product decision the screen opens a prefilled support email instead — the
// same pattern as scenarios.tsx — and shows no fake success state. Themed to
// the active role (pal mode renders the Provider v.2 dark kit).
// ===========================================================================
const SUPPORT_EMAIL = 'support@myfavorr.com';

export const Help = ({ navigation }: any) => {
  const s = useStore();
  const dark = s.user?.role === 'pal';
  // Linking rejects on unsupported platforms (e.g. web) — swallow it.
  const emailSupport = () => {
    void Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('MyFavor support request')}`,
    ).catch(() => {});
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: dark ? D.bg : L.bg }}>
      <LightHeader title="Help" onBack={() => navigation.goBack()} dark={dark} />
      <View style={{ flex: 1, padding: 24 }}>
        <Txt style={dark ? { ...st.helpHeading, color: D.text } : st.helpHeading}>Need help or have a question?</Txt>
        <Txt style={dark ? { ...st.helpSub, color: D.sub } : st.helpSub}>
          Email our support team at {SUPPORT_EMAIL} and we’ll get back to you as soon as we can.
        </Txt>
        <View style={{ flex: 1 }} />
        <Cta title="EMAIL SUPPORT" onPress={emailSupport} dark={dark} style={{ marginBottom: 28 }} />
      </View>
    </SafeAreaView>
  );
};

// ===========================================================================
// 5. SideDrawer — role-aware left panel over the dimmed screen.
// member: white panel (User App v.2 "Side Drawer" #125:7342).
// pal: dark panel (Provider App v.2 "Side Drawer (dark)") — #151313 panel on
// the #0D0A0A provider ink, white text/icons, red "● Set Status" row, and an
// Account item (→ StripeOnboarding, the dark "Accounts" #181:10039 screen)
// instead of Payment.
// ===========================================================================
const DK = {
  panel: '#151313',
  text: '#FFFFFF',
  sub: '#B9B4B4',
  red: '#ED1C24',
  divider: 'rgba(255,255,255,0.14)',
} as const;

export const SideDrawer = ({ navigation }: any) => {
  const s = useStore();
  const u = s.user;
  const isPal = u?.role === 'pal';
  const ink = isPal ? DK.text : L.text;
  const close = () => navigation.goBack();
  const go = (route: string, params?: any) => {
    navigation.goBack();
    navigation.navigate(route, params);
  };

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <SafeAreaView edges={['top', 'bottom']} style={[st.drawer, isPal && st.drawerDark]}>
        {/* Identity */}
        <View style={{ alignItems: 'center', marginTop: 18 }}>
          <View style={{ width: 132, height: 132 }}>
            <Avatar uri={u?.avatar} name={u?.firstName} size={132} />
            <TouchableOpacity onPress={() => go('EditProfile')} style={st.drawerBadge} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Edit profile">
              <Ionicons name="pencil" size={15} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          {/* No placeholder identity: a momentarily-null user renders (and is
              announced as) nothing rather than the Figma sample name. */}
          <Txt style={{ ...st.drawerName, color: ink }}>{u?.firstName ?? ''}</Txt>
          <TouchableOpacity onPress={() => go('Tabs', { screen: 'Account' })} hitSlop={6} accessibilityRole="button" accessibilityLabel="View Profile">
            <Txt style={isPal ? { ...st.drawerViewProfile, color: DK.sub } : st.drawerViewProfile}>View Profile</Txt>
          </TouchableOpacity>

          {isPal ? (
            <TouchableOpacity
              onPress={() => go('SetStatus')}
              style={st.drawerStatusRow}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Set Status"
            >
              <View style={st.statusDot} />
              <Txt style={{ fontFamily: POPPINS_MEDIUM, fontSize: 13, color: DK.red }}>Set Status</Txt>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={[st.divider, { marginTop: 24 }, isPal && { backgroundColor: DK.divider }]} />

        {/* Menu */}
        <View style={{ flex: 1, paddingTop: 8 }}>
          <DrawerRow label="Favor History" color={ink} onPress={() => go('History')}>
            <Ionicons name="time-outline" size={22} color={ink} />
          </DrawerRow>
          <DrawerRow label="Help" color={ink} onPress={() => go('Help')}>
            <Ionicons name="help-circle" size={21} color={ink} />
          </DrawerRow>
          <DrawerRow label="Settings" color={ink} onPress={() => go('Settings')}>
            <Ionicons name="settings-sharp" size={19} color={ink} />
          </DrawerRow>
          {isPal ? (
            <DrawerRow label="Account" color={ink} onPress={() => go('StripeOnboarding')}>
              <Ionicons name="wallet-outline" size={21} color={ink} />
            </DrawerRow>
          ) : (
            <>
              {/* Directory of vetted pals (profiles + reviews) — the member can
                  book a specific pal for their open favor from here. */}
              <DrawerRow label="Browse Favor Pals" color={ink} onPress={() => go('ProviderResults')}>
                <Ionicons name="people-outline" size={21} color={ink} />
              </DrawerRow>
              <DrawerRow label="Payment" color={ink} onPress={() => go('Payment')}>
                <Ionicons name="card" size={20} color={ink} />
              </DrawerRow>
            </>
          )}

          <View style={{ flex: 1 }} />

          <DrawerRow label="Logout" color={ink} onPress={() => s.logout()} style={{ marginBottom: 18 }}>
            <Ionicons name="log-out-outline" size={21} color={ink} />
          </DrawerRow>
        </View>
      </SafeAreaView>

      <Pressable style={st.backdrop} onPress={close} accessibilityRole="button" accessibilityLabel="Close menu" />
    </View>
  );
};

function DrawerRow({ label, onPress, children, style, color }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[st.drawerRow, style]} accessibilityRole="button" accessibilityLabel={label}>
      <View style={{ width: 22, alignItems: 'center' }}>{children}</View>
      <Txt style={color ? { ...st.drawerRowText, color } : st.drawerRowText}>{label}</Txt>
    </TouchableOpacity>
  );
}

// ===========================================================================
// 6. SetStatus — availability picker modal, Provider App v.2 "Set Status"
// popup #181:10437: navy card (#252A38), white title + option labels,
// ● Online (green) / Invisible / Offline.
// ===========================================================================
const STATUS_OPTIONS: { key: 'online' | 'invisible' | 'offline'; label: string; dot: string; ring: string; color: string }[] = [
  { key: 'online', label: 'Online', dot: '#02CB00', ring: '#02CB00', color: '#FFFFFF' },
  { key: 'invisible', label: 'Invisible', dot: 'transparent', ring: DK.sub, color: '#FFFFFF' },
  { key: 'offline', label: 'Offline', dot: '#9E9E9E', ring: '#9E9E9E', color: '#FFFFFF' },
];

export const SetStatus = ({ navigation }: any) => {
  const s = useStore();
  const current = s.user?.status ?? 'online';
  // Server-confirmed: only dismiss once the change stuck (the store is
  // optimistic and reverts user.status itself on failure).
  const [saving, setSaving] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const choose = async (status: 'online' | 'invisible' | 'offline') => {
    if (saving) return;
    setSaving(status);
    setFailed(false);
    const ok = await s.setStatus(status);
    if (ok) { navigation.goBack(); return; }
    setSaving(null);
    setFailed(true);
  };
  return (
    <Pressable style={[st.scrim, { paddingHorizontal: 28 }]} onPress={() => navigation.goBack()}>
      <Pressable style={st.statusCard} onPress={() => {}}>
        <Txt style={st.statusTitle} center>Set Status</Txt>
        <View style={st.statusDivider} />
        {STATUS_OPTIONS.map((opt) => {
          const sel = current === opt.key;
          const busy = saving === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              activeOpacity={0.7}
              disabled={!!saving}
              onPress={() => { void choose(opt.key); }}
              accessibilityRole="radio"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: sel, checked: sel, disabled: !!saving, busy }}
            >
              <View style={st.statusRow}>
                <View style={[st.statusRadio, { borderColor: opt.ring, backgroundColor: opt.dot }]} />
                <Txt style={{ fontFamily: sel ? fonts.displayMedium : POPPINS_MEDIUM, fontSize: 15, color: opt.color }}>
                  {opt.label}
                </Txt>
                {busy ? <ActivityIndicator size="small" color="#FFFFFF" style={{ marginLeft: 'auto' }} /> : null}
              </View>
              <View style={st.statusDivider} />
            </TouchableOpacity>
          );
        })}
        {failed ? (
          <Txt style={st.statusError} center>Couldn’t update your status. Please try again.</Txt>
        ) : null}
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
  headerDark: { backgroundColor: D.bg, borderBottomColor: D.border },

  // CTA
  cta: { height: 48, borderRadius: 8, backgroundColor: L.cta, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  ctaText: { fontFamily: fonts.displayMedium, fontSize: 15, color: '#FFFFFF', letterSpacing: 1 },
  // Provider v.2 primary CTA — white pill, black label.
  ctaDark: { height: 48, borderRadius: 8, backgroundColor: D.ctaBg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  ctaTextDark: { fontFamily: fonts.displayMedium, fontSize: 15, color: D.ctaText, letterSpacing: 1 },

  // Modals
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  alertCard: { width: 285, borderRadius: 10, backgroundColor: '#FFFFFF', paddingVertical: 22, paddingHorizontal: 20 },
  alertCardDark: { backgroundColor: D.sheet },
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
  fieldBoxDark: { backgroundColor: D.field },
  fieldBoxMulti: { height: 110, alignItems: 'flex-start', paddingVertical: 12 },
  fieldBoxDisabled: { opacity: 0.6 },
  fieldInput: { flex: 1, fontFamily: fonts.bodyRegular, fontSize: 15, color: L.text, paddingVertical: 0 },
  fieldNote: { fontFamily: fonts.bodyRegular, fontSize: 11.5, color: L.sub, marginTop: 6 },
  fieldWrap: { marginBottom: 16 },
  fieldRow: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  editBadge: {
    position: 'absolute', right: 0, bottom: 2, width: 32, height: 32, borderRadius: 16,
    backgroundColor: L.red, alignItems: 'center', justifyContent: 'center',
  },
  // Dim scrim + spinner over the 124pt avatar while the picked photo uploads.
  avatarBusy: {
    position: 'absolute', top: 0, left: 0, width: 124, height: 124, borderRadius: 62,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
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
  helpSub: { fontFamily: fonts.bodyRegular, fontSize: 14, lineHeight: 21, color: L.text, marginTop: 12 },

  // Blocked users (Settings)
  blockedHeading: { fontFamily: fonts.displayMedium, fontSize: 15, color: L.text, marginBottom: 4 },
  blockedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.divider,
  },
  blockedName: { flex: 1, fontFamily: fonts.bodyRegular, fontSize: 14, color: L.text },
  unblockText: { fontFamily: fonts.displayMedium, fontSize: 12.5, letterSpacing: 0.6, color: L.red },

  // Pal discovery preferences (Settings, pal mode) — rows + the radius/home sheets
  prefRow: {
    flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 14, paddingLeft: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.divider,
  },
  prefSheet: { width: '100%', borderRadius: 16, backgroundColor: D.sheet, paddingVertical: 24, paddingHorizontal: 22 },
  prefSheetTitle: { fontFamily: fonts.display, fontSize: 19, color: D.text, marginBottom: 8 },
  prefSheetBody: { fontFamily: fonts.bodyRegular, fontSize: 13, lineHeight: 19, color: D.sub, marginBottom: 20 },
  // radius chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  chip: {
    minWidth: 58, height: 48, borderRadius: 10, backgroundColor: D.field,
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', paddingHorizontal: 12, gap: 2,
  },
  chipSelected: { backgroundColor: '#FFFFFF' },
  chipText: { fontFamily: fonts.displayMedium, fontSize: 17, color: D.text },
  chipTextSelected: { fontFamily: fonts.displayMedium, fontSize: 17, color: '#000000' },
  chipUnit: { fontFamily: fonts.bodyRegular, fontSize: 11, color: D.sub },
  chipUnitSelected: { fontFamily: fonts.bodyRegular, fontSize: 11, color: '#555555' },
  // home address sheet
  homeField: { flexDirection: 'row', alignItems: 'center', backgroundColor: D.field, borderRadius: 10, minHeight: 48 },
  homeInput: { flex: 1, fontFamily: fonts.bodyRegular, fontSize: 14, color: D.text, paddingHorizontal: 10, paddingVertical: 0 },
  homeSuggestBox: { backgroundColor: D.field, borderRadius: 10, marginTop: 8, overflow: 'hidden' },
  homeSuggestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  homeSuggestDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: D.border },
  homeSuggestText: { flex: 1, fontFamily: fonts.bodyRegular, fontSize: 13, color: D.text },
  currentLocBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 10 },
  currentLocText: { fontFamily: POPPINS_MEDIUM, fontSize: 13, color: D.text },
  homeError: { fontFamily: fonts.bodyRegular, fontSize: 12.5, lineHeight: 18, color: D.red, marginTop: 12 },
  homeCancel: { fontFamily: POPPINS_MEDIUM, fontSize: 14, color: D.sub },

  // SideDrawer
  drawer: {
    width: '72%', backgroundColor: L.bg,
    shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 8,
  },
  drawerDark: { backgroundColor: DK.panel, shadowOpacity: 0.4 },
  drawerStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 },
  drawerBadge: {
    position: 'absolute', right: 2, bottom: 4, width: 33, height: 33, borderRadius: 17,
    backgroundColor: L.red, alignItems: 'center', justifyContent: 'center',
  },
  drawerName: { fontFamily: fonts.display, fontSize: 17, color: L.text, marginTop: 14 },
  drawerViewProfile: { fontFamily: fonts.bodyRegular, fontSize: 13, color: L.text, marginTop: 6 },
  drawerRow: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingVertical: 22, paddingHorizontal: 30 },
  drawerRowText: { fontFamily: POPPINS_MEDIUM, fontSize: 15, color: L.text },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },

  // SetStatus modal — navy card (Provider v.2 #181:10437)
  statusCard: { width: '100%', borderRadius: 16, backgroundColor: '#252A38', paddingVertical: 24, paddingHorizontal: 24 },
  statusTitle: { fontFamily: fonts.display, fontSize: 20, color: '#FFFFFF', marginBottom: 16 },
  statusDivider: { height: StyleSheet.hairlineWidth, backgroundColor: DK.divider, alignSelf: 'stretch' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 17 },
  statusRadio: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  statusError: { fontFamily: fonts.bodyRegular, fontSize: 12.5, color: '#ED1C24', marginTop: 14 },
});
