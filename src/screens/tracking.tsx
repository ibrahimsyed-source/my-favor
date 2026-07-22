import React, { useState } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
  TextInput, KeyboardAvoidingView, Platform, Modal, Dimensions, Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Poppins_400Regular } from '@expo-google-fonts/poppins';
import { Avatar, StarRating, StaticMap } from '../components';
import { tokens } from '../theme';
import { useStore } from '../store';
import { computeCancellation } from '../types';
import { haversineMiles, fmtMiles } from '../lib/geo';

// ---------------------------------------------------------------------------
// User App v.2 — tracking module (light design over a light map).
// Frames: Favor Booked Minimized/Expanded, Favor Arrived (+Message), Modal:
// Favor Pal Arrived, Order Complete, Tip Other, Tip/Feedback Submitted,
// Cancel Favor / Cancelled / Repost Favor modals.
// ---------------------------------------------------------------------------
const BLACK = '#0D0A0A'; // v.2 ink, canvas-verified (matches INK on sibling screens)
const WHITE = '#FFFFFF';
const RED = '#ED1C24';
const DIVIDER = '#EBEBEB';
const CHIP_BG = '#EFEFEF';
const GRAY = '#8A8A8A';
const GREEN = '#5ABE64';
const P_REGULAR = 'Poppins_400Regular'; // loaded locally (App.tsx has 500/600/700)
const POPPINS_M = 'Poppins_500Medium';
const POPPINS_SB = 'Poppins_600SemiBold';

const WIN_H = Dimensions.get('window').height;

// ---------------------------------------------------------------------------
// v.2 modal — white rounded card centered over a 50% black scrim.
// (Cancel favor / Cancelled / Pal arrived / Repost / Tip success all share it.)
// ---------------------------------------------------------------------------
const V2Modal: React.FC<{
  visible: boolean;
  title: string;
  body?: string;
  buttons: { label: string; gray?: boolean; onPress: () => void }[];
  row?: boolean; // render buttons side-by-side at ~50% width (e.g. NO | YES)
  onDismiss?: () => void; // tap-scrim / hardware back; omit to force a choice
}> = ({ visible, title, body, buttons, row, onDismiss }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss ?? (() => {})}>
    <TouchableOpacity activeOpacity={1} onPress={onDismiss} style={styles.scrim}>
      <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
        <Text style={styles.modalTitle}>{title}</Text>
        {body ? <Text style={styles.modalBody}>{body}</Text> : null}
        <View style={row ? styles.modalBtnRow : undefined}>
          {buttons.map((b) => (
            <TouchableOpacity
              key={b.label}
              activeOpacity={0.85}
              onPress={b.onPress}
              style={[styles.modalBtn, b.gray && styles.modalBtnGray, row && styles.modalBtnHalf]}
              accessibilityRole="button"
              accessibilityLabel={b.label}
            >
              <Text style={[styles.modalBtnText, b.gray && styles.modalBtnTextGray]}>{b.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </TouchableOpacity>
  </Modal>
);

// Small black map chip ("N Flagler Dr.", "13 mins ETA", "2nd St.").
const MapChip: React.FC<{ label: string; top: string; left: string }> = ({ label, top, left }) => (
  <View style={[styles.mapChip, { top: top as any, left: left as any }]}>
    <Text style={styles.mapChipText}>{label}</Text>
  </View>
);

// ---------------------------------------------------------------------------
// 1) FavorTracking — the light-map screen with the white bottom sheet.
//    Minimized <-> Expanded (tap the handle); Arrived states; overlay modals.
// ---------------------------------------------------------------------------
export const FavorTracking = ({ navigation }: any) => {
  const s = useStore();
  const insets = useSafeAreaInsets();
  const fav = s.activeFavor;
  const pal = s.activePal;

  const [expanded, setExpanded] = useState(false);
  const [callVisible, setCallVisible] = useState(false);
  const [feeAlertVisible, setFeeAlertVisible] = useState(false);
  const [cancelVisible, setCancelVisible] = useState(false);
  // Set after WE cancel: { charged } drives "Cancelled." with/without the
  // "Your account has been charged." line (w-o charge = reblast frame 149:10128).
  const [cancelled, setCancelled] = useState<null | { charged: boolean }>(null);
  const [arrivedSeen, setArrivedSeen] = useState(false);
  const [repostDismissed, setRepostDismissed] = useState(false);

  // Display values from live state, with the Figma literals as fallbacks.
  const palName = pal ? `${pal.firstName} ${pal.lastName}` : 'Fabrizio L.';
  const palAvatar = pal?.avatar ?? 'https://i.pravatar.cc/150?img=12';
  const palRating = (pal?.rating ?? 4.9).toFixed(1);
  const etaShort = fav?.etaWindow ?? '11:50 - 12:10';
  const etaLong = fav?.etaWindow ?? '11:50 - 12:10PM';

  const status = fav?.status ?? 'matched';
  const arrived = status === 'arrived' || status === 'in_progress';
  const completed = status === 'completed';
  const cancelledByPal = status === 'cancelled'; // our own cancel nulls activeFavor

  // Live distance: how far the pal actually is from the favor location, from the
  // pal's streamed GPS (via the active-favor poll). Falls back to a "locating"
  // state until the first fix arrives (e.g. web/demo, or before permission).
  const palLoc = fav?.palLocation;
  const liveMiles =
    palLoc && fav ? haversineMiles(palLoc.lat, palLoc.lng, fav.location.lat, fav.location.lng) : null;
  const hasLive = liveMiles != null && !arrived && !completed;
  const distanceLabel =
    arrived || completed
      ? '0 miles away'
      : liveMiles != null
        ? `${fmtMiles(liveMiles)} away`
        : 'Locating your Pal…';

  // Unread messages from this Pal → red "Message your Favor Pal" row + badge.
  const thread = pal ? s.threads.find((t) => t.withUser.id === pal.id) : undefined;
  const unread = thread?.unread ?? 0;

  const openThread = async () => {
    if (pal) {
      const threadId = await s.openThreadWith(pal.id);
      if (threadId) {
        navigation.navigate('MessageThread', { threadId });
        return;
      }
    }
    navigation.navigate('Messages');
  };

  const callPal = () => {
    const phone = pal?.phone;
    // On web, react-native-web's openURL resolves even when the browser can't
    // handle tel:, so the .catch fallback never fires — show the modal directly.
    if (Platform.OS === 'web' || !phone) {
      setCallVisible(true);
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => setCallVisible(true));
  };

  // Capture the fee BEFORE cancelFavor() nulls the favor.
  const confirmCancel = () => {
    const charged = fav ? computeCancellation(fav).fee > 0 : true;
    setCancelVisible(false);
    s.cancelFavor();
    setCancelled({ charged });
  };

  const requestAnother = () => {
    setCancelled(null);
    navigation.popToTop();
    navigation.navigate('SelectFavor');
  };

  // Pal cancelled → seed the draft from the dead favor so REPOST works.
  const repostFavor = () => {
    if (fav) {
      s.setDraft({
        tier: fav.tier,
        price: fav.price,
        description: fav.description,
        images: fav.images,
        location: fav.location,
        ...(fav.scheduledFor != null ? { scheduledFor: fav.scheduledFor } : {}),
      });
    }
    setRepostDismissed(true);
    navigation.navigate('FavorSummary');
  };

  // Sheet body -------------------------------------------------------------
  const profileCol = (
    <View style={{ marginLeft: 14 }}>
      <Text style={styles.palName}>{palName}</Text>
      <View style={styles.starRow}>
        <Ionicons name="star" size={13} color="#FFBD00" />
        <Text style={styles.ratingText}>{palRating}</Text>
      </View>
      <Text style={styles.distanceText}>{distanceLabel}</Text>
    </View>
  );

  const actionRow = (
    label: string,
    icon: keyof typeof Ionicons.glyphMap,
    onPress: () => void,
    red?: boolean,
  ) => (
    <TouchableOpacity
      style={styles.actionRow}
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={19} color={red ? RED : BLACK} />
      <Text style={[styles.actionText, red && { color: RED }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={red ? RED : BLACK} />
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#E9EEF3' }}>
      <StatusBar barStyle="dark-content" />

      {/* Light map backdrop (StaticMap → MapPlaceholder fallback), full-bleed. */}
      <View style={{ position: 'absolute', top: -16, left: -16, right: -16, bottom: -16 }} pointerEvents="none">
        <StaticMap
          lat={fav?.location?.lat}
          lng={fav?.location?.lng}
          palLat={hasLive ? palLoc?.lat : undefined}
          palLng={hasLive ? palLoc?.lng : undefined}
          height={WIN_H + 32}
          zoom={15}
          label=""
        >
          <View style={StyleSheet.absoluteFill}>
            {arrived || completed ? (
              // Pal + car together at the member's pin.
              <View style={[styles.mapMarkerRow, { top: '42%', left: '42%' }]}>
                <View style={styles.palPin}>
                  <Avatar uri={palAvatar} size={30} />
                </View>
                <Ionicons name="car-sport" size={24} color={RED} style={{ marginLeft: 2 }} />
              </View>
            ) : hasLive ? (
              // Real live position — the static map already draws the pal (blue)
              // and destination (red) pins, so no decorative overlay is needed.
              null
            ) : (
              <>
                {/* red route: car (pal) → member pin */}
                <Ionicons name="car-sport" size={24} color={RED} style={{ position: 'absolute', top: '19%', left: '53%' }} />
                <MapChip label="N Flagler Dr." top="24%" left="56%" />
                <View style={[styles.routeV, { top: '23%', left: '52%', height: '29%' }]} />
                <MapChip label="13 mins ETA" top="40%" left="55%" />
                <View style={[styles.routeH, { top: '52%', left: '45%', width: '8%' }]} />
                <View style={[styles.palPin, { position: 'absolute', top: '49.5%', left: '38%' }]}>
                  <Avatar uri={palAvatar} size={30} />
                </View>
                <MapChip label="2nd St." top="56%" left="35%" />
              </>
            )}
          </View>
        </StaticMap>
      </View>

      {/* Header: home + menu squares + white "Switch to be a favor pal" pill */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: 'transparent' }}>
        <View style={styles.headerRow}>
          {/* Back to Home — the tracking screen is pushed over Tabs, but with no
              back button a member who opens their live favor is stranded here.
              Land on the Home tab whether or not there is a stack entry to pop. */}
          <TouchableOpacity
            style={[styles.menuBtn, tokens.shadow.card]}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Tabs', { screen: 'Home' })}
            accessibilityRole="button"
            accessibilityLabel="Back to home"
          >
            <Ionicons name="chevron-back" size={24} color={WHITE} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.menuBtn, tokens.shadow.card, { marginLeft: 10 }]}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('SideDrawer')}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
          >
            <Ionicons name="menu" size={24} color={WHITE} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.rolePill, tokens.shadow.card]}
            activeOpacity={0.85}
            onPress={() => {
              // Gate on vetting: unverified pals go to Driver Information first.
              if (!s.user?.palVerified) { navigation.navigate('Vetting'); return; }
              s.setRole('pal');
              navigation.navigate('Tabs');
            }}
            accessibilityRole="switch"
            accessibilityState={{ checked: false }}
            accessibilityLabel="Switch to be a favor pal"
          >
            <Text style={styles.rolePillText}>Switch to be a favor pal</Text>
            <View style={styles.toggleTrack}>
              <View style={styles.toggleKnob} />
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View style={{ flex: 1 }} />

      {/* White bottom sheet */}
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }, tokens.shadow.card]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setExpanded((e) => !e)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse favor details' : 'Expand favor details'}
          style={{ alignSelf: 'stretch', alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}
        >
          <View style={styles.handle} />
        </TouchableOpacity>

        {arrived || completed ? (
          // ------------------- Favor Arrived (#125:9610 / #125:9354) -------------------
          <View>
            <Text style={styles.sheetTitle}>
              {completed ? 'Your Favor Pal has completed the favor.' : 'Your Favor Pal has arrived.'}
            </Text>
            <View style={styles.divider} />
            <View style={styles.arrivedProfileRow}>
              <View>
                <Avatar uri={palAvatar} size={64} />
                {unread > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{unread}</Text>
                  </View>
                ) : null}
              </View>
              {profileCol}
            </View>
            <View style={styles.divider} />
            {completed ? (
              <TouchableOpacity
                style={styles.blackBtn}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('OrderComplete')}
                accessibilityRole="button"
                accessibilityLabel="Rate your Favor Pal"
              >
                <Text style={styles.blackBtnText}>RATE YOUR FAVOR PAL</Text>
              </TouchableOpacity>
            ) : (
              <>
                {actionRow('Call your Favor Pal', 'call', callPal)}
                <View style={styles.divider} />
                {actionRow('Message your Favor Pal', 'chatbox', openThread, unread > 0)}
              </>
            )}
          </View>
        ) : expanded ? (
          // ------------------- Favor Booked - Expanded (#125:8968) -------------------
          <View>
            <Text style={styles.sheetTitle}>Favor Booked</Text>
            <View style={styles.divider} />
            <View style={styles.expandedProfileRow}>
              <Avatar uri={palAvatar} size={64} />
              {profileCol}
            </View>
            <Text style={styles.etaBig}>{etaLong}</Text>
            <View style={styles.arrivalPill}>
              <Text style={styles.arrivalPillText}>Arrival Window</Text>
            </View>
            <View style={[styles.divider, { marginTop: 20 }]} />
            <View style={styles.notifyRow}>
              <Ionicons name="notifications-outline" size={20} color={BLACK} />
              <Text style={styles.notifyText}>You'll be notified when your{'\n'}favor pal is on the way</Text>
            </View>
            <View style={styles.divider} />
            {actionRow('Call your Favor Pal', 'call', callPal)}
            <View style={styles.divider} />
            {actionRow('Message your Favor Pal', 'chatbox', openThread, unread > 0)}
            <TouchableOpacity
              style={styles.blackBtn}
              activeOpacity={0.85}
              onPress={() => setFeeAlertVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Cancel this favor"
            >
              <Text style={styles.blackBtnText}>CANCEL THIS FAVOR</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // ------------------- Favor Booked - Minimized (#125:8826) -------------------
          <TouchableOpacity activeOpacity={0.85} onPress={() => setExpanded(true)}>
            <View style={styles.minRow}>
              <Avatar uri={palAvatar} size={48} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.palName}>{palName}</Text>
                <View style={styles.starRow}>
                  <Ionicons name="star" size={13} color="#FFBD00" />
                  <Text style={styles.ratingText}>{palRating}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.etaSmall}>{etaShort}</Text>
                <Text style={styles.distanceText}>{distanceLabel}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Modal: Favor Pal Arrived (#125:10406) */}
      <V2Modal
        visible={arrived && !arrivedSeen}
        title={'Your Favor Pal\nhas arrived.'}
        buttons={[{ label: 'OK', onPress: () => setArrivedSeen(true) }]}
        onDismiss={() => setArrivedSeen(true)}
      />

      {/* Cancellation Alert (#125:9157) — fee-aware confirm, NO (gray) | YES (black) */}
      <V2Modal
        visible={feeAlertVisible}
        title="Cancel favor?"
        body={'If you decide to cancel the request after 5 minutes, you will be automatically charged a cancellation fee.\n\nService and Transaction Fee are non-refundable.'}
        row
        buttons={[
          { label: 'NO', gray: true, onPress: () => setFeeAlertVisible(false) },
          {
            label: 'YES',
            onPress: () => {
              setFeeAlertVisible(false);
              setCancelVisible(true);
            },
          },
        ]}
        onDismiss={() => setFeeAlertVisible(false)}
      />

      {/* Cancel Favor Modal (#125:10014) */}
      <V2Modal
        visible={cancelVisible}
        title="Are you sure you want to cancel?"
        body="You will be charged the full amount if you cancel this favor."
        buttons={[{ label: 'CANCEL FAVOR', onPress: confirmCancel }]}
        onDismiss={() => setCancelVisible(false)}
      />

      {/* Cancelled Modal — with charge (#125:10210) / without charge (#149:10128) */}
      <V2Modal
        visible={cancelled != null}
        title="Cancelled."
        body={cancelled?.charged ? 'Your account has been charged.' : undefined}
        buttons={[{ label: 'REQUEST ANOTHER FAVOR', onPress: requestAnother }]}
      />

      {/* Repost Favor Modal (#125:10601) — the Pal cancelled on us */}
      <V2Modal
        visible={cancelledByPal && !repostDismissed && cancelled == null}
        title={'Your Favor has been cancelled by\nyour favor pal.'}
        buttons={[
          { label: 'REPOST FAVOR', onPress: repostFavor },
          {
            label: 'CLOSE',
            gray: true,
            onPress: () => {
              setRepostDismissed(true);
              navigation.popToTop();
            },
          },
        ]}
      />

      {/* Call fallback (web / no dialer) — styled like the v.2 alert modals */}
      <V2Modal
        visible={callVisible}
        title="Connecting call"
        body={`We're connecting you with ${palName} through a private number to keep both phone numbers protected.`}
        buttons={[{ label: 'OK', onPress: () => setCallVisible(false) }]}
        onDismiss={() => setCallVisible(false)}
      />
    </View>
  );
};

// ---------------------------------------------------------------------------
// 2) OrderComplete — "Thank You!" + rating + tip + feedback (#125:9770),
//    Tip Other (#125:9841), Tip Submitted Success (#125:9917) and
//    Feedback Submitted Success (#125:9999).
// ---------------------------------------------------------------------------
const TIPS = [
  { key: '2', label: '$2.00', value: 2 },
  { key: '4', label: '$4.00', value: 4 },
  { key: '6', label: '$6.00', value: 6 },
  { key: 'other', label: 'Other', value: undefined },
] as const;

export const OrderComplete = ({ navigation }: any) => {
  const s = useStore();
  // Poppins Regular isn't registered app-wide; expo-font caches globally so
  // this resolves instantly after the first mount anywhere in the app.
  const [fontsReady] = useFonts({ Poppins_400Regular });
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [tipKey, setTipKey] = useState<string | null>(null);
  const [customTip, setCustomTip] = useState('');
  const [tipSuccessVisible, setTipSuccessVisible] = useState(false);
  const [done, setDone] = useState(false);

  // "Other" needs a real numeric amount; presets carry their fixed value.
  const isOther = tipKey === 'other';
  const presetTip = TIPS.find((t) => t.key === tipKey)?.value;
  const parsedCustom = Math.round(parseFloat(customTip) * 100) / 100;
  // Server caps tip at $1000 (favor.routes.ts). Enforce it here so an
  // out-of-range tip can't 400 the whole (rating+feedback+tip) request.
  const customOverMax = isOther && !Number.isNaN(parsedCustom) && parsedCustom > 1000;
  const customValid =
    isOther && !Number.isNaN(parsedCustom) && parsedCustom > 0 && parsedCustom <= 1000;
  const tip = isOther ? (customValid ? parsedCustom : undefined) : presetTip;
  const canSubmit = rating > 0 && (!isOther || customValid);

  const onSubmit = () => {
    s.rateFavor(rating, feedback, tip);
    if (tip && tip > 0) setTipSuccessVisible(true);
    else setDone(true);
  };

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: WHITE }} />; // flash-guard

  // ---------------- Feedback Submitted Success (#125:9999) ----------------
  if (done) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: WHITE }} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
          <View style={styles.successRing}>
            <Ionicons name="checkmark-sharp" size={58} color={GREEN} />
          </View>
          <Text style={styles.successText}>You've succesfully submitted your feedback!</Text>
        </View>
        <TouchableOpacity
          style={[styles.blackBtn, { marginBottom: 8 }]}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Tabs')}
          accessibilityRole="button"
          accessibilityLabel="Continue"
        >
          <Text style={styles.blackBtnText}>CONTINUE</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: WHITE }} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.thankYou}>Thank You!</Text>
          {/* Figma layer reads "completedyour" — app policy fixes obvious design typos. */}
          <Text style={styles.completedSub}>Favor Pal has completed your favor.</Text>

          <Image
            source={require('../../assets/img/tracking/celebration.png')}
            style={styles.celebration}
            accessibilityIgnoresInvertColors
          />

          <View style={styles.hr} />

          {/* Rating */}
          <View style={styles.ratingRow}>
            <Text style={styles.sectionLabel}>Rating</Text>
            <View style={{ marginLeft: 28 }}>
              <StarRating value={rating} size={22} onChange={setRating} />
            </View>
          </View>

          <View style={styles.hr} />

          {/* Tip */}
          <Text style={[styles.sectionLabel, { paddingHorizontal: 20, paddingTop: 18 }]}>
            Great Pal? Consider giving a tip!
          </Text>
          <View style={styles.tipRow}>
            {TIPS.map((t) => {
              const active = tipKey === t.key;
              const muted = tipKey != null && !active;
              return (
                <TouchableOpacity
                  key={t.key}
                  activeOpacity={0.8}
                  onPress={() => {
                    setTipKey(t.key);
                    if (t.key !== 'other') setCustomTip('');
                  }}
                  style={[
                    styles.tipChip,
                    active && { backgroundColor: '#E4E4E4' },
                    muted && { backgroundColor: '#F5F5F5' },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t.key === 'other' ? 'Other tip amount' : `Tip ${t.label}`}
                >
                  <Text style={[styles.tipChipText, muted && { color: '#BEBEBE' }]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Tip Other (#125:9841): outlined field, right-aligned "$ Other…" */}
          {isOther ? (
            <View style={styles.otherField}>
              <TextInput
                style={styles.otherInput}
                value={customTip}
                onChangeText={setCustomTip}
                placeholder="$ Other…"
                placeholderTextColor="#9E9E9E"
                keyboardType="decimal-pad"
                accessibilityLabel="Enter tip amount"
              />
            </View>
          ) : null}
          {customOverMax ? <Text style={styles.tipError}>Max tip is $1000.</Text> : null}

          <View style={[styles.hr, { marginTop: 18 }]} />

          {/* Feedback */}
          <Text style={[styles.sectionLabel, { paddingHorizontal: 20, paddingTop: 18 }]}>Feedback</Text>
          <View style={styles.textarea}>
            <TextInput
              style={styles.textareaInput}
              value={feedback}
              onChangeText={setFeedback}
              placeholder="Please tell us about your experience"
              placeholderTextColor="#9E9E9E"
              multiline
              maxLength={700}
              accessibilityLabel="Feedback"
            />
          </View>
          <Text style={styles.charMax}>700 characters max.</Text>

          <TouchableOpacity
            style={[styles.blackBtn, !canSubmit && { backgroundColor: '#C4C4C4' }]}
            activeOpacity={0.85}
            disabled={!canSubmit}
            onPress={onSubmit}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
            accessibilityLabel="Submit feedback"
          >
            <Text style={styles.blackBtnText}>SUBMIT FEEDBACK</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Tip Submitted Success (#125:9917) */}
      <V2Modal
        visible={tipSuccessVisible}
        title="Success!"
        body="You have successfully tipped your Favor Pal!"
        buttons={[
          {
            label: 'OK',
            onPress: () => {
              setTipSuccessVisible(false);
              setDone(true);
            },
          },
        ]}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // ----- map + header -----
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: BLACK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WHITE,
    borderRadius: 999,
    height: 40,
    paddingLeft: 16,
    paddingRight: 8,
  },
  rolePillText: { fontFamily: POPPINS_M, fontSize: 12, color: BLACK },
  toggleTrack: {
    width: 36,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E4E4E4',
    marginLeft: 10,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleKnob: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: WHITE,
    ...tokens.shadow.card,
  },
  mapChip: {
    position: 'absolute',
    backgroundColor: BLACK,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  mapChipText: { fontFamily: POPPINS_M, fontSize: 11, color: WHITE },
  routeV: { position: 'absolute', width: 5, borderRadius: 3, backgroundColor: RED },
  routeH: { position: 'absolute', height: 5, borderRadius: 3, backgroundColor: RED },
  mapMarkerRow: { position: 'absolute', flexDirection: 'row', alignItems: 'center' },
  palPin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: WHITE,
    borderWidth: 2,
    borderColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  // ----- bottom sheet -----
  sheet: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    width: 60,
    height: 5,
    borderRadius: 3,
    backgroundColor: BLACK,
  },
  sheetTitle: {
    fontFamily: POPPINS_M,
    fontSize: 16,
    color: BLACK,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  divider: { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },
  minRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 18,
  },
  expandedProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  arrivedProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingVertical: 18,
  },
  palName: { fontFamily: POPPINS_M, fontSize: 16, color: BLACK },
  starRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  ratingText: { fontFamily: POPPINS_M, fontSize: 13, color: BLACK, marginLeft: 5 },
  distanceText: { fontFamily: POPPINS_M, fontSize: 12, color: GRAY, marginTop: 3 },
  etaSmall: { fontFamily: POPPINS_M, fontSize: 16, color: BLACK },
  etaBig: {
    fontFamily: POPPINS_M,
    fontSize: 24,
    color: BLACK,
    textAlign: 'center',
    marginTop: 6,
  },
  arrivalPill: {
    alignSelf: 'center',
    backgroundColor: CHIP_BG,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 10,
  },
  arrivalPillText: { fontFamily: POPPINS_M, fontSize: 12, color: '#5B5B5B' },
  notifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  notifyText: {
    fontFamily: POPPINS_M,
    fontSize: 13,
    lineHeight: 19,
    color: BLACK,
    marginLeft: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 17,
  },
  actionText: { flex: 1, fontFamily: POPPINS_M, fontSize: 15, color: BLACK, marginLeft: 14 },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 18,
    borderRadius: 5,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadBadgeText: { fontFamily: POPPINS_SB, fontSize: 11, color: WHITE },
  blackBtn: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 4,
    height: 48,
    borderRadius: 8,
    backgroundColor: BLACK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blackBtnText: {
    fontFamily: POPPINS_M,
    fontSize: 15,
    color: WHITE,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // ----- v.2 modal -----
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: WHITE,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  modalTitle: {
    fontFamily: POPPINS_M,
    fontSize: 24,
    lineHeight: 36,
    color: BLACK,
    textAlign: 'center',
  },
  modalBody: {
    fontFamily: POPPINS_M,
    fontSize: 16,
    lineHeight: 24,
    color: BLACK,
    textAlign: 'center',
    marginTop: 14,
  },
  modalBtn: {
    marginTop: 20,
    height: 48,
    borderRadius: 8,
    backgroundColor: BLACK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnGray: { marginTop: 10, backgroundColor: '#E5E5E5' },
  modalBtnHalf: { flex: 1, marginTop: 20 }, // side-by-side (NO | YES) — overrides gray's marginTop
  modalBtnText: {
    fontFamily: POPPINS_M,
    fontSize: 15,
    color: WHITE,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  modalBtnTextGray: { color: BLACK }, // dark ink label on the light #E5E5E5 fill
  modalBtnRow: { flexDirection: 'row', gap: 12 },

  // ----- OrderComplete -----
  thankYou: {
    fontFamily: POPPINS_SB,
    fontSize: 24,
    color: BLACK,
    textAlign: 'center',
    marginTop: 24,
  },
  completedSub: {
    fontFamily: POPPINS_M,
    fontSize: 14,
    color: BLACK,
    textAlign: 'center',
    marginTop: 8,
  },
  celebration: {
    alignSelf: 'center',
    width: '70%',
    height: 235,
    resizeMode: 'contain',
    marginTop: 22,
  },
  hr: { height: 1, backgroundColor: DIVIDER, marginTop: 22 },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginTop: 2,
  },
  sectionLabel: { fontFamily: POPPINS_SB, fontSize: 15, color: BLACK },
  tipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 14,
  },
  tipChip: {
    backgroundColor: CHIP_BG,
    borderRadius: 999,
    height: 36,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipChipText: { fontFamily: P_REGULAR, fontSize: 13, color: BLACK },
  otherField: {
    marginHorizontal: 20,
    marginTop: 16,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DFDFDF',
    backgroundColor: WHITE,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  otherInput: {
    fontFamily: P_REGULAR,
    fontSize: 15,
    color: BLACK,
    textAlign: 'right',
    padding: 0,
  },
  textarea: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: CHIP_BG,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textareaInput: {
    fontFamily: P_REGULAR,
    fontSize: 15,
    color: BLACK,
    minHeight: 96,
    textAlignVertical: 'top',
    padding: 0,
  },
  charMax: {
    fontFamily: P_REGULAR,
    fontSize: 11,
    color: GRAY,
    alignSelf: 'flex-end',
    marginRight: 20,
    marginTop: 8,
  },
  tipError: {
    fontFamily: P_REGULAR,
    fontSize: 11,
    color: RED,
    marginHorizontal: 20,
    marginTop: 6,
  },

  // ----- Feedback Submitted Success -----
  successRing: {
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 9,
    borderColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  successText: {
    fontFamily: POPPINS_M,
    fontSize: 24,
    lineHeight: 34,
    color: BLACK,
    textAlign: 'center',
  },
});
