import React, { useState, useEffect } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, Pressable, StyleSheet,
  Dimensions, ActivityIndicator, Modal, ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Poppins_400Regular } from '@expo-google-fonts/poppins';
import { useStore } from '../store';
import { FAVOR_TIERS, computeFees, FavorTier } from '../types';

// ---------------------------------------------------------------------------
// Checkout flow — rebuilt to the User App v.2 Figma frames (light theme):
//   Favor Summary Immediate #125:10996            -> FavorSummary
//   Select your paymnet method #125:11045         -> SelectPayment (bottom sheet)
//   Immediate Book Request Modal #125:10708       -> Searching (waiting modal)
//   No Favor Pal Available Notification #125:11190-> no-pal failure modal
// Colours / sizes / copy verified against the live Figma canvas:
//   ink #0D0A0A · secondary #484747 · dividers #EEEEEE (368x1 @ x23)
//   pay blue #2A7AFF · success green #34C45C · buttons 368x48 r8 (Poppins Medium 16)
//   modals 351 wide r8 over rgba(0,0,0,0.5) scrim
// ---------------------------------------------------------------------------
const INK = '#0D0A0A';        // headings, black buttons, primary text
const SUB = '#484747';        // secondary text (fees, bodies, "Edit")
const DIVIDER = '#EEEEEE';    // 1px hairlines
const BLUE = '#2A7AFF';       // Pay button
const GREEN = '#34C45C';      // selected-card border + check badge
const CIRCLE_GRAY = '#CECBCB';// "+" circle inside the Add tile
const CLOSE_GRAY = '#9E9E9E'; // sheet close (×) ring + glyph
const TILE_BG = '#EFEFEF';    // summary thumbnail backing
const RED = '#D40000';        // map pins (v.2 map accent)
const WHITE = '#FFFFFF';

const P400 = 'Poppins_400Regular';
const P500 = 'Poppins_500Medium';
const P600 = 'Poppins_600SemiBold';

// Poppins Regular isn't in the app-wide font load (App.tsx loads 500/600/700),
// so this module loads it itself — expo caches globally, instant after first use.
function usePoppins() {
  const [loaded] = useFonts({ Poppins_400Regular });
  return loaded;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Tier illustrations (exported from Figma, shared with the request flow).
// Each sits oversized inside a 75x75 rounded mask exactly like the frames.
const TIER_ART: Record<string, { img: any; w: number; h: number; dx: number; dy: number }> = {
  tiny: { img: require('../../assets/img/request/tier-tiny.png'), w: 94, h: 94, dx: -9, dy: -10 },
  small: { img: require('../../assets/img/request/tier-small.png'), w: 94, h: 94, dx: -9, dy: -10 },
  big: { img: require('../../assets/img/request/tier-big.png'), w: 78, h: 78, dx: -1, dy: -1 },
  huge: { img: require('../../assets/img/request/tier-huge.png'), w: 79, h: 79, dx: -2, dy: -2 },
};

const MAP_IMG = require('../../assets/img/request/map-light.png');

const FALLBACK_DESC = 'No description provided.';
const FALLBACK_ADDRESS = '2099 Woodvine Rd, Lorman';

// Whole-dollar bases render like the frame ("$20"), odd amounts keep cents.
const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

// Schedule label for the (off-frame) scheduled-favor state on Searching.
const formatSchedule = (ms?: number) =>
  ms != null
    ? new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Now';

// ---------------------------------------------------------------------------
// Shared: derive the favor summary from the draft (defaults to Tiny / $20).
// Every displayed amount comes from the store via computeFees so the summary,
// the Pay button and the stored favor all agree.
// ---------------------------------------------------------------------------
function useFavorSummary() {
  const { draftFavor } = useStore();
  const tier = (draftFavor?.tier ?? 'tiny') as FavorTier;
  const tierMeta = (FAVOR_TIERS as Record<string, { label: string; price: number }>)[tier];
  const base = draftFavor?.price ?? tierMeta?.price ?? FAVOR_TIERS.tiny.price;
  // Negotiated favors label like the "Favor Summary Negotiate" frame: "2hrs x $50".
  const label = draftFavor?.hours
    ? `${draftFavor.hours}hrs x $${Math.round(base / draftFavor.hours)}`
    : tierMeta?.label ?? 'Custom Favor';
  const fees = computeFees(base);
  const description = draftFavor?.description || FALLBACK_DESC;
  const address = draftFavor?.location?.address || FALLBACK_ADDRESS;
  const image = draftFavor?.images?.[0];
  return { base, label, fees, description, address, image, tier };
}

// ---------------------------------------------------------------------------
// Small shared pieces (local — v.2 checkout uses its own design language)
// ---------------------------------------------------------------------------
const Divider = ({ style }: { style?: ViewStyle }) => (
  <View style={[{ height: 1, backgroundColor: DIVIDER, marginHorizontal: 23 }, style]} />
);

// btn/solid/2/black from the kit: 368x48, radius 8, Poppins Medium white text.
const BlackButton = ({
  title, onPress, style, textSize = 16,
}: { title: string; onPress?: () => void; style?: ViewStyle; textSize?: number }) => (
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={title}
    style={[styles.blackBtn, style]}
  >
    <Text style={[styles.blackBtnText, { fontSize: textSize }]}>{title}</Text>
  </TouchableOpacity>
);

// Section block: black icon + Poppins-Medium label, gray body (#484747 16/24).
const Section = ({
  icon, label, body,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; body: string }) => (
  <>
    <View style={styles.sectionHead}>
      <Ionicons name={icon} size={22} color={INK} />
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
    <Text style={styles.sectionBody}>{body}</Text>
  </>
);

// Centered white alert card (351 wide, r8) over a 50% black scrim — the shape
// shared by "No Favor Pal Available" #125:11190 and kin.
const AlertModal = ({
  visible, title, message, buttonLabel, onClose,
}: { visible: boolean; title: string; message: string; buttonLabel: string; onClose: () => void }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.scrimCenter}>
      <View style={styles.alertCard}>
        <Text style={styles.alertTitle}>{title}</Text>
        <Text style={styles.alertBody}>{message}</Text>
        <BlackButton title={buttonLabel} onPress={onClose} style={{ marginTop: 28 }} />
      </View>
    </View>
  </Modal>
);

// ---------------------------------------------------------------------------
// Shared body of the Favor Summary (thumbnail + cost rows, Description,
// Address). Reused as the backdrop behind the payment sheet.
// ---------------------------------------------------------------------------
function SummaryBody() {
  const { base, label, fees, description, address, image, tier } = useFavorSummary();
  const art = TIER_ART[tier as string] ?? TIER_ART.tiny;
  return (
    <View>
      {/* Cost block — illustration in a 75x75 rounded mask, prices at right */}
      <View style={styles.costBlock}>
        <View style={styles.thumbMask}>
          {image ? (
            <Image source={{ uri: image }} style={{ width: 75, height: 75 }} />
          ) : (
            <Image
              source={art.img}
              style={{ position: 'absolute', width: art.w, height: art.h, left: art.dx, top: art.dy }}
              resizeMode="cover"
            />
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 34 }}>
          <View style={styles.moneyRow}>
            <Text style={styles.tierTitle}>{label}</Text>
            <Text style={styles.tierPrice}>{money(base)}</Text>
          </View>
          <View style={[styles.moneyRow, { marginTop: 4 }]}>
            <Text style={styles.feeLabel}>Service Fee @ 2.9%</Text>
            <Text style={styles.feeLabel}>{`$${fees.serviceFee.toFixed(2)}`}</Text>
          </View>
          <View style={[styles.moneyRow, { marginTop: 4 }]}>
            <Text style={styles.feeLabel}>Transaction Fee</Text>
            <Text style={styles.feeLabel}>{`$${fees.transactionFee.toFixed(2)}`}</Text>
          </View>
          <View style={[styles.moneyRow, { marginTop: 4 }]}>
            <Text style={styles.feeLabel}>Total Cost</Text>
            <Text style={styles.feeLabel}>{`$${fees.total.toFixed(2)}`}</Text>
          </View>
        </View>
      </View>

      <Divider style={{ marginTop: 18 }} />
      <Section icon="document-text" label="Description" body={description} />
      <Divider style={{ marginTop: 16 }} />
      <Section icon="location" label="Address" body={address} />
      <Divider style={{ marginTop: 18 }} />
    </View>
  );
}

// ===========================================================================
// 1. Favor Summary  (v.2 #125:10996 — no header bar; black REQUEST FAVOR NOW)
// ===========================================================================
export const FavorSummary = ({ navigation }: any) => {
  const fontsReady = usePoppins();
  const insets = useSafeAreaInsets();
  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: WHITE }} />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: WHITE }} edges={['top']}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        <SummaryBody />
      </ScrollView>
      <View style={{ paddingHorizontal: 23, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 18) + 16 }}>
        <BlackButton title="REQUEST FAVOR NOW" onPress={() => navigation.navigate('SelectPayment')} />
      </View>
    </SafeAreaView>
  );
};

// ===========================================================================
// 2. Select Payment  (v.2 #125:11045 — white sheet over the undimmed summary)
// ===========================================================================
export const SelectPayment = ({ navigation }: any) => {
  const fontsReady = usePoppins();
  const insets = useSafeAreaInsets();
  const { cards, requestFavor, pals } = useStore();
  const { fees } = useFavorSummary();
  const [selected, setSelected] = useState<string | null>(cards[0]?.id ?? null);
  const [noPal, setNoPal] = useState(false);
  // In-flight guard for the (money-sensitive) Pay call: blocks double-submit and
  // drives the button's busy state. `payError` surfaces a failed charge instead
  // of silently stranding the member on the sheet.
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState(false);

  // Resolve the selection against the live card list rather than trusting raw
  // state: if the chosen card was deleted on the Payment screen, `selected` no
  // longer points at a real card and we must not let a paid favor go through
  // with no funding source.
  const selectedCard = cards.find((c) => c.id === selected);
  const canPay = Boolean(selectedCard);

  const pay = async () => {
    // Guarded three ways: card selected, and not already paying (a second tap
    // while the request is in flight would create a duplicate favor / double
    // charge). The disabled Pay button reflects both.
    if (!canPay || paying) return;
    // No FavorPals available in the area → v.2 "No Favor Pal Available" alert.
    if (pals.length === 0) {
      setNoPal(true);
      return;
    }
    setPaying(true);
    try {
      await requestFavor();
      navigation.navigate('Searching');
    } catch {
      // Offline / 500 from createFavorApi: tell the member the payment didn't go
      // through (rather than failing silently) and reset so they can retry.
      setPayError(true);
    } finally {
      setPaying(false);
    }
  };

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: WHITE }} />;

  return (
    <View style={{ flex: 1, backgroundColor: WHITE }}>
      {/* Summary behind the sheet — v.2 shows it undimmed */}
      <SafeAreaView style={StyleSheet.absoluteFill} edges={['top']} pointerEvents="none">
        <SummaryBody />
      </SafeAreaView>

      {/* Tap outside the sheet to dismiss */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => navigation.goBack()}
        accessibilityLabel="Dismiss payment sheet"
      />

      {/* Bottom sheet */}
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
        <View style={styles.sheetTopRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={16} color={CLOSE_GRAY} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Payment')} hitSlop={10}>
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sheetHeading}>Select your payment method</Text>

        <View style={{ flexDirection: 'row', marginTop: 26 }}>
          {/* Add new card */}
          <View style={{ marginRight: 12 }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('AddCard')}
              accessibilityRole="button"
              accessibilityLabel="Add a new card"
              style={styles.tile}
            >
              <View style={styles.addCircle}>
                <Ionicons name="add" size={22} color={INK} />
              </View>
            </TouchableOpacity>
            <Text style={styles.tileLabel}>+ Add</Text>
          </View>

          {/* Saved cards */}
          {cards.map((c) => {
            const isSel = c.id === selected;
            return (
              <View key={c.id} style={{ marginRight: 12 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSelected(c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={`${c.brand} ending ${c.last4}`}
                  style={[styles.tile, isSel && { borderWidth: 1, borderColor: GREEN }]}
                >
                  <Text style={styles.brandText}>{c.brand.toUpperCase()}</Text>
                  {isSel && (
                    <View style={styles.checkBadge}>
                      <Ionicons name="checkmark" size={13} color={WHITE} />
                    </View>
                  )}
                </TouchableOpacity>
                <Text style={styles.tileLabel}>{`•••• ${c.last4}`}</Text>
              </View>
            );
          })}
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={pay}
          disabled={!canPay || paying}
          accessibilityRole="button"
          accessibilityLabel={`Pay US$${fees.total.toFixed(2)}`}
          accessibilityState={{ disabled: !canPay || paying, busy: paying }}
          style={[styles.payBtn, { opacity: canPay && !paying ? 1 : 0.5 }]}
        >
          {paying ? (
            <ActivityIndicator color={WHITE} />
          ) : (
            <>
              <Text style={styles.payBtnText}>{`Pay US$${fees.total.toFixed(2)}`}</Text>
              <Ionicons name="lock-closed" size={17} color={WHITE} style={{ position: 'absolute', right: 20 }} />
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* v.2 #125:11190 — No Favor Pal Available */}
      <AlertModal
        visible={noPal}
        title="No Favor Pal Available"
        message={'We are sorry that there are no FavorPals in your area at the moment.  Please try again later.'}
        buttonLabel="CLOSE"
        onClose={() => setNoPal(false)}
      />

      <AlertModal
        visible={payError}
        title="Payment Failed"
        message="We couldn't complete your payment. Please check your connection and try again — you have not been charged."
        buttonLabel="TRY AGAIN"
        onClose={() => setPayError(false)}
      />
    </View>
  );
};

// ===========================================================================
// 3. Searching  (v.2 #125:10708 — white waiting modal over the dimmed map)
// ===========================================================================
export const Searching = ({ navigation }: any) => {
  const fontsReady = usePoppins();
  const { pals, advanceFavor, assignPal, activeFavor } = useStore();
  const matchedPal = pals[0];
  const palName = matchedPal?.firstName ?? 'a Favor Pal';

  // A favor booked for a future time should NOT be matched/en-route the instant
  // it is paid for — it stays "Scheduled" until its window. Only the immediate
  // ("Now") flow runs the live-match simulation below.
  const isScheduled = activeFavor?.scheduledFor != null && activeFavor.scheduledFor > Date.now();

  // v.2 "Match Alert Notification" (#125:10778): once the Pal accepts, the member
  // gets a match popup ("{Pal} accepted your favor." + OKAY) instead of being
  // dropped silently into tracking. Tapping OKAY enters live tracking.
  const [matched, setMatched] = useState(false);

  // Simulate the Pal accepting shortly after payment: bind the matched pal so the
  // tracking screen shows the same person named here, advance the favor to
  // 'matched', then surface the match alert (the "Choose another Favor Pal"
  // button below stays as the genuine impatient-user fallback until then).
  useEffect(() => {
    if (isScheduled) return; // scheduled favors don't drive en-route tracking yet
    const t = setTimeout(() => {
      if (matchedPal) assignPal(matchedPal.id);
      else advanceFavor('matched');
      setMatched(true);
    }, 2500);
    return () => clearTimeout(t);
  }, [isScheduled, matchedPal, assignPal, advanceFavor]);

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: WHITE }} />;

  return (
    <View style={{ flex: 1, backgroundColor: '#D8D8D8' }}>
      {/* v.2 light map backdrop with red pins */}
      <Image source={MAP_IMG} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} resizeMode="cover" />
      <Ionicons name="location" size={42} color={RED} style={[styles.pin, { top: SCREEN_H * 0.13, left: SCREEN_W * 0.2 }]} />
      <Ionicons name="location" size={42} color={RED} style={[styles.pin, { top: SCREEN_H * 0.24, left: SCREEN_W * 0.6 }]} />

      {/* 50% scrim, then the centered alert card */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} pointerEvents="none" />

      <View style={[StyleSheet.absoluteFill, styles.scrimCenter, { backgroundColor: 'transparent' }]}>
        <View style={styles.alertCard}>
          {isScheduled ? (
            <>
              <Text style={styles.alertTitle}>Favor scheduled</Text>
              <Text style={styles.alertBody}>
                {`We'll match you with a Favor Pal for ${formatSchedule(activeFavor?.scheduledFor)}.`}
              </Text>
              <BlackButton title="BACK TO HOME" onPress={() => navigation.popToTop()} style={{ marginTop: 20 }} />
            </>
          ) : matched ? (
            <>
              {/* v.2 Match Alert Notification #125:10778 — "Fabrizio has accepted
                  your favor! / You favor pal is on their way." (typo corrected) */}
              <Text style={styles.alertTitle}>{`${palName} has accepted your favor!`}</Text>
              <Text style={styles.alertBody}>Your favor pal is on their way.</Text>
              <BlackButton
                title="OKAY"
                onPress={() => navigation.replace('FavorTracking')}
                style={{ marginTop: 20 }}
              />
            </>
          ) : (
            <>
              <Text style={styles.alertTitle}>{`You have asked a favor from ${palName}`}</Text>
              <Text style={styles.alertBody}>Please wait while we confirm.</Text>
              <Text style={styles.tooLong}>Taking too long?</Text>
              <BlackButton
                title="CHOOSE ANOTHER FAVOR PAL"
                textSize={14}
                onPress={() => navigation.navigate('ProviderResults')}
                style={{ marginTop: 20 }}
              />
            </>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // --- Favor Summary -------------------------------------------------------
  costBlock: {
    flexDirection: 'row',
    marginTop: 93, // content starts 93 below the status bar in the frame (y=137)
    paddingLeft: 25,
    paddingRight: 23,
  },
  thumbMask: {
    width: 75,
    height: 75,
    borderRadius: 5,
    marginTop: 10,
    backgroundColor: TILE_BG,
    overflow: 'hidden',
  },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  tierTitle: { fontFamily: P500, fontSize: 18, lineHeight: 27, color: INK },
  tierPrice: { fontFamily: P500, fontSize: 18, lineHeight: 27, color: INK },
  feeLabel: { fontFamily: P400, fontSize: 12, lineHeight: 18, color: SUB },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginTop: 28, paddingLeft: 33 },
  sectionLabel: { fontFamily: P500, fontSize: 16, lineHeight: 24, color: INK, marginLeft: 8 },
  sectionBody: { fontFamily: P400, fontSize: 16, lineHeight: 24, color: SUB, marginLeft: 63, marginRight: 25, marginTop: 4 },
  blackBtn: {
    height: 48,
    borderRadius: 8,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  blackBtnText: { fontFamily: P500, fontSize: 16, color: WHITE, letterSpacing: 0.5 },

  // --- Select Payment sheet ------------------------------------------------
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: WHITE,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 23,
    paddingTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },
  sheetTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: CLOSE_GRAY,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editText: { fontFamily: P400, fontSize: 16, color: SUB },
  sheetHeading: { fontFamily: P600, fontSize: 24, lineHeight: 30, color: INK, marginTop: 24 },
  tile: {
    width: 113,
    height: 71,
    borderRadius: 8,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  addCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CIRCLE_GRAY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { fontSize: 20, fontWeight: '800', fontStyle: 'italic', letterSpacing: 0.5, color: INK },
  checkBadge: {
    position: 'absolute',
    right: -7,
    bottom: -7,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: GREEN,
    borderWidth: 2,
    borderColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { fontFamily: P400, fontSize: 15, color: INK, marginTop: 12 },
  payBtn: {
    height: 48,
    borderRadius: 8,
    backgroundColor: BLUE,
    marginTop: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtnText: { fontFamily: P500, fontSize: 16, color: WHITE },

  // --- Alert modals (No Favor Pal / Searching / errors) ---------------------
  scrimCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 31,
  },
  alertCard: {
    width: '100%',
    maxWidth: 351,
    borderRadius: 8,
    backgroundColor: WHITE,
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  alertTitle: { fontFamily: P600, fontSize: 20, lineHeight: 30, color: INK, textAlign: 'center' },
  alertBody: { fontFamily: P400, fontSize: 14, lineHeight: 22, color: SUB, textAlign: 'center', marginTop: 16 },
  tooLong: { fontFamily: P500, fontSize: 14, lineHeight: 21, color: INK, textAlign: 'center', marginTop: 14 },

  // --- Searching map -------------------------------------------------------
  pin: { position: 'absolute' },
});
