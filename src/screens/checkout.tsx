import React, { useEffect, useState } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, Pressable, StyleSheet,
  Dimensions, ActivityIndicator, Modal, TextInput, ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Poppins_400Regular } from '@expo-google-fonts/poppins';
import { useStore } from '../store';
import { Avatar } from '../components';
import { FAVOR_TIERS, computeFees, computeCancellation, FavorTier, FavorOffer, Review } from '../types';
import { counterOfferApi, declineOfferApi, getPalApi, getPalReviewsApi } from '../api/endpoints';
import { LiveMap } from '../components/LiveMap';
import { MapScene, MAP_SCENE_SUPPORTED } from '../components/MapScene';

// ---------------------------------------------------------------------------
// Checkout flow — rebuilt to the User App v.2 Figma frames (light theme):
//   Favor Summary Immediate #125:10996            -> FavorSummary
//   Select your paymnet method #125:11045         -> SelectPayment (bottom sheet)
//   Immediate Book Request Modal #125:10708       -> Searching (waiting modal)
//   No Favor Pal Available Notification #125:11190-> no-pal failure modal
// Colours / sizes / copy verified against the live Figma canvas:
//   ink #0D0A0A · secondary #484747 · dividers #EEEEEE (368x1 @ x23)
//   pay blue #2A7AFF · success green #34C45C · buttons 368x48 r8 (Poppins Medium 16)
//   modals 351 wide r16 over rgba(0,0,0,0.5) scrim
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
const FALLBACK_ADDRESS = 'Address not set';

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
  // The geocoded pickup coordinates (set on ConfirmAddress) — drives the pickup
  // pin on the summary map. Undefined until an address has been confirmed.
  const location =
    draftFavor?.location && typeof draftFavor.location.lat === 'number'
      ? { lat: draftFavor.location.lat, lng: draftFavor.location.lng }
      : undefined;
  return { base, label, fees, description, address, image, tier, location };
}

// ---------------------------------------------------------------------------
// Small shared pieces (local — v.2 checkout uses its own design language)
// ---------------------------------------------------------------------------
const Divider = ({ style }: { style?: ViewStyle }) => (
  <View style={[{ height: 1, backgroundColor: DIVIDER, marginHorizontal: 23 }, style]} />
);

// btn/solid/2/black from the kit: 368x48, radius 8, Poppins Medium white text.
// `disabled` / `busy` are real (TouchableOpacity disabled + accessibilityState),
// not just an opacity hint — screen readers announce the true state.
const BlackButton = ({
  title, onPress, style, textSize = 16, disabled = false, busy = false,
}: {
  title: string; onPress?: () => void; style?: ViewStyle; textSize?: number;
  disabled?: boolean; busy?: boolean;
}) => (
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={onPress}
    disabled={disabled || busy}
    accessibilityRole="button"
    accessibilityLabel={title}
    accessibilityState={{ disabled: disabled || busy, busy }}
    style={[styles.blackBtn, (disabled || busy) && { opacity: 0.5 }, style]}
  >
    {busy ? (
      <ActivityIndicator color={WHITE} />
    ) : (
      <Text style={[styles.blackBtnText, { fontSize: textSize }]}>{title}</Text>
    )}
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
  visible, title, message, buttonLabel, onClose, onPrimary, secondaryLabel,
}: {
  visible: boolean; title: string; message: string; buttonLabel: string; onClose: () => void;
  // Optional second action: the black button runs `onPrimary` and a dismiss
  // link labelled `secondaryLabel` runs `onClose` (used by "VIEW CURRENT FAVOR").
  onPrimary?: () => void; secondaryLabel?: string;
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
    <View style={styles.scrimCenter}>
      <View style={styles.alertCard}>
        <Text style={styles.alertTitle}>{title}</Text>
        <Text style={styles.alertBody}>{message}</Text>
        <BlackButton title={buttonLabel} onPress={onPrimary ?? onClose} style={{ marginTop: 28 }} />
        {secondaryLabel ? (
          <TouchableOpacity
            onPress={onClose}
            style={{ marginTop: 14, alignSelf: 'center', paddingVertical: 4 }}
            accessibilityRole="button"
            accessibilityLabel={secondaryLabel}
          >
            <Text style={styles.tooLong}>{secondaryLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  </Modal>
);

// ---------------------------------------------------------------------------
// Shared body of the Favor Summary (thumbnail + cost rows, Description,
// Address). Reused as the backdrop behind the payment sheet.
// ---------------------------------------------------------------------------
function SummaryBody() {
  const { base, label, fees, description, address, image, tier, location } = useFavorSummary();
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
      {/* Pickup pin at the geocoded address — interactive map on native, a Static
          Maps image on web (see components/LiveMap). Only shown once a location
          has been confirmed. */}
      {location ? (
        <View style={{ marginHorizontal: 23, marginTop: 14, borderRadius: 12, overflow: 'hidden' }}>
          <LiveMap lat={location.lat} lng={location.lng} height={160} zoom={15} label="Pickup" />
        </View>
      ) : null}
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
  const { requestFavor, draftFavor, activeMemberFavor } = useStore();
  // In-flight guard: a second tap while the request is posting would create a
  // duplicate favor.
  const [requesting, setRequesting] = useState(false);
  // requestFavor's { ok:false } result — 'active_exists' gets a VIEW CURRENT
  // FAVOR modal; every other reason shows the server's message verbatim.
  const [requestFail, setRequestFail] = useState<{ reason: string; code?: 'active_exists' } | null>(null);

  // Payments are waived while Stripe is in sandbox: REQUEST FAVOR NOW posts the
  // favor directly — no card required, nothing is charged (the server's mock
  // ledger settles with no money moving). The SelectPayment sheet stays in the
  // codebase for when payments go live.
  const onRequest = async () => {
    if (requesting) return;
    // A confirmed location is required (requestFavor refuses without one) —
    // send the member to ConfirmAddress if the draft somehow lacks it.
    if (!draftFavor?.location || typeof draftFavor.location.lat !== 'number') {
      navigation.navigate('ConfirmAddress');
      return;
    }
    setRequesting(true);
    const res = await requestFavor();
    setRequesting(false);
    if (res.ok) {
      // replace (not navigate): the favor now exists, so drop this summary from
      // the stack — back must never return to a live REQUEST button.
      navigation.replace('Searching');
      return;
    }
    setRequestFail(res);
  };

  // The one member slot is taken — jump to wherever that favor lives.
  const viewCurrentFavor = () => {
    setRequestFail(null);
    navigation.replace(activeMemberFavor?.status === 'requested' ? 'Searching' : 'FavorTracking');
  };

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: WHITE }} />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: WHITE }} edges={['top']}>
      {navigation.canGoBack() ? (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4, alignSelf: 'flex-start' }}
        >
          <Ionicons name="chevron-back" size={26} color="#0D0A0A" />
        </TouchableOpacity>
      ) : null}
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        <SummaryBody />
      </ScrollView>
      <View style={{ paddingHorizontal: 23, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 18) + 16 }}>
        <BlackButton title="REQUEST FAVOR NOW" onPress={onRequest} busy={requesting} />
      </View>
      <AlertModal
        visible={requestFail != null}
        title={requestFail?.code === 'active_exists' ? 'You already have a favor' : 'Request Failed'}
        message={requestFail?.reason ?? ''}
        buttonLabel={requestFail?.code === 'active_exists' ? 'VIEW CURRENT FAVOR' : 'OK'}
        onPrimary={requestFail?.code === 'active_exists' ? viewCurrentFavor : undefined}
        secondaryLabel={requestFail?.code === 'active_exists' ? 'Not now' : undefined}
        onClose={() => setRequestFail(null)}
      />
    </SafeAreaView>
  );
};

// ===========================================================================
// 2. Select Payment  (v.2 #125:11045 — white sheet over the undimmed summary)
// ===========================================================================
export const SelectPayment = ({ navigation }: any) => {
  const fontsReady = usePoppins();
  const insets = useSafeAreaInsets();
  const { cards, requestFavor, pals, activeMemberFavor } = useStore();
  const { fees } = useFavorSummary();
  const [selected, setSelected] = useState<string | null>(cards[0]?.id ?? null);
  const [noPal, setNoPal] = useState(false);
  // In-flight guard for the (money-sensitive) Pay call: blocks double-submit and
  // drives the button's busy state. `payFail` surfaces the server's reason for a
  // failed charge instead of silently stranding the member on the sheet.
  const [paying, setPaying] = useState(false);
  const [payFail, setPayFail] = useState<{ reason: string; code?: 'active_exists' } | null>(null);

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
    const res = await requestFavor();
    setPaying(false);
    if (res.ok) {
      // replace (not navigate): the favor is now created + charged, so drop this
      // payment sheet from the stack — a back gesture must never return to a live
      // Pay button that would re-submit and double-charge.
      navigation.replace('Searching');
      return;
    }
    // Offline / 409 / 500 from createFavorApi: surface the server's reason (an
    // 'active_exists' gets the VIEW CURRENT FAVOR modal) rather than failing
    // silently, and let the member retry.
    setPayFail(res);
  };

  // The one member slot is taken — jump to wherever that favor lives.
  const viewCurrentFavor = () => {
    setPayFail(null);
    navigation.replace(activeMemberFavor?.status === 'requested' ? 'Searching' : 'FavorTracking');
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
          <TouchableOpacity
            onPress={() => navigation.navigate('Payment')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Edit payment methods"
          >
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sheetHeading}>Select your payment method</Text>

        {/* Horizontal scroll: the tiles are fixed-width, so 3+ saved cards
            overflow a phone — every card must stay reachable/selectable. The
            negative margins bleed the scroll under the sheet padding so tiles
            run edge to edge; bottom padding keeps the tile shadows unclipped. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 26, marginHorizontal: -23 }}
          contentContainerStyle={{ flexDirection: 'row', paddingHorizontal: 23, paddingBottom: 8 }}
        >
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
        </ScrollView>

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
        visible={payFail != null}
        title={payFail?.code === 'active_exists' ? 'You already have a favor' : 'Payment Failed'}
        message={payFail?.reason ?? ''}
        buttonLabel={payFail?.code === 'active_exists' ? 'VIEW CURRENT FAVOR' : 'OK'}
        onPrimary={payFail?.code === 'active_exists' ? viewCurrentFavor : undefined}
        secondaryLabel={payFail?.code === 'active_exists' ? 'Not now' : undefined}
        onClose={() => setPayFail(null)}
      />
    </View>
  );
};

// ---------------------------------------------------------------------------
// PalProfileModal — the approval surface's "who is this person?" view: full
// profile + the reviews other members left, fetched on open. The member reads
// this BEFORE approving a candidate from the offer cards.
// ---------------------------------------------------------------------------
function PalProfileModal({ palId, onClose }: { palId: string | null; onClose: () => void }) {
  const [pal, setPal] = useState<any | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  // Fetch failed (network blip / pal gone): show an error instead of the
  // spinner-forever the swallowed rejection used to leave behind.
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    if (!palId) return;
    let cancelled = false;
    setLoading(true);
    setPal(null);
    setReviews([]);
    setLoadError(false);
    void Promise.all([getPalApi(palId), getPalReviewsApi(palId)])
      .then(([p, r]) => {
        if (cancelled) return;
        setPal(p.pal);
        setReviews(r.reviews);
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [palId]);

  const name = pal ? `${pal.firstName ?? ''} ${pal.lastName ?? ''}`.trim() : '';
  return (
    <Modal visible={palId != null} transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
      <View style={styles.scrimCenter}>
        <View style={[styles.alertCard, { maxHeight: '78%' }]}>
          {loading ? (
            <ActivityIndicator color={INK} style={{ marginVertical: 28 }} />
          ) : loadError || !pal ? (
            <>
              <Text style={styles.alertTitle}>Couldn't load this profile</Text>
              <Text style={styles.alertBody}>
                Please check your connection and try again.
              </Text>
            </>
          ) : (
            <ScrollView style={{ alignSelf: 'stretch' }} showsVerticalScrollIndicator={false}>
              <View style={{ alignItems: 'center' }}>
                <Avatar uri={pal.avatar} size={72} name={name || 'Favor Pal'} />
                <Text style={[styles.alertTitle, { marginTop: 10 }]}>{name || 'Favor Pal'}</Text>
                <Text style={styles.alertBody}>
                  {`★ ${pal.rating && pal.rating > 0 ? Number(pal.rating).toFixed(1) : 'New'}   ·   ${pal.totalFavors ?? 0} favors`}
                  {pal.city ? `   ·   ${pal.city}` : ''}
                </Text>
              </View>
              {pal.bio ? <Text style={[styles.alertBody, { textAlign: 'left', marginTop: 12 }]}>{pal.bio}</Text> : null}
              <Text style={[styles.alertTitle, { fontSize: 15, textAlign: 'left', marginTop: 16 }]}>Reviews</Text>
              {reviews.length === 0 ? (
                <Text style={[styles.alertBody, { textAlign: 'left' }]}>No reviews yet.</Text>
              ) : (
                reviews.map((r) => (
                  <View key={r.id} style={{ marginTop: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Ionicons key={n} name={n <= r.rating ? 'star' : 'star-outline'} size={13} color="#FFBD00" />
                      ))}
                      <Text style={[styles.alertBody, { marginTop: 0 }]}>
                        {'   '}{r.authorName}{' · '}
                        {new Date(r.date).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                      </Text>
                    </View>
                    {r.comment ? (
                      <Text style={[styles.alertBody, { textAlign: 'left', marginTop: 2 }]}>{r.comment}</Text>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>
          )}
          <BlackButton title="CLOSE" onPress={onClose} style={{ marginTop: 16, alignSelf: 'stretch' }} />
        </View>
      </View>
    </Modal>
  );
}

// ===========================================================================
// 3. Searching  (v.2 #125:10708 — white waiting modal over the dimmed map)
// ===========================================================================
export const Searching = ({ navigation }: any) => {
  const fontsReady = usePoppins();
  const {
    activeMemberFavor: activeFavor, activePal, acceptOffer,
    cancelFavor, palCanceled, clearPalCanceled,
  } = useStore();
  // Cancel-while-waiting. The confirm copy quotes computeCancellation LIVE: the
  // 4s poll can match the favor while the modal is open, and a matched cancel
  // charges a fee — the modal must never promise "you won't be charged" then.
  const [cancelAsk, setCancelAsk] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');

  // A favor booked for a future time stays "Scheduled" until its window.
  const isScheduled = activeFavor?.scheduledFor != null && activeFavor.scheduledFor > Date.now();

  // REAL matching: the store's app-wide 4s poll refreshes activeFavor; the moment
  // a pal accepts (at list price or a negotiated one) the status leaves
  // 'requested' and the v.2 Match Alert shows. The old 2.5s simulated match (it
  // force-booked the first directory pal) is gone.
  const isMatched =
    !!activeFavor && ['matched', 'enroute', 'arrived', 'in_progress'].includes(activeFavor.status);
  // The poll parks the final 'completed' favor in the member slot until it's
  // rated — show a completion state here, never the searching spinner.
  const isCompleted = activeFavor?.status === 'completed';
  // Finished work awaiting the member's release — the lifecycle passes through
  // this between in_progress and completed, so the screen must hand over to the
  // release sheet instead of regressing to the searching spinner.
  const isPendingRelease = activeFavor?.status === 'pending_release';
  const palName = activePal?.firstName ?? 'Your Favor Pal';

  // Recomputed every render so the quote tracks the live status.
  const cancelQuote = activeFavor ? computeCancellation(activeFavor) : null;

  // Price negotiation: pending offers ride the polled favor. The member accepts,
  // counters, or declines right here while waiting. Local `declined`/`countered`
  // sets bridge the ≤4s gap until the poll reflects an action, so a card can't
  // be double-tapped into a stale state.
  const [counterFor, setCounterFor] = useState<FavorOffer | null>(null);
  // Candidate pal whose full profile + reviews the member is inspecting.
  const [profilePalId, setProfilePalId] = useState<string | null>(null);
  const [counterText, setCounterText] = useState('');
  const [offerBusy, setOfferBusy] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<{ title: string; message: string } | null>(null);
  // Keyed to the offer row's updatedAt/price at decline time: the server
  // UPSERTS offers per (favor, pal) pair, so a pal re-offering a new price
  // reuses the SAME row id — once the row changes, the decline expires and the
  // fresh offer reappears (same expiry scheme as counteredIds below).
  const [declinedIds, setDeclinedIds] = useState<Record<string, { price: number; baseUpdatedAt: number }>>({});
  // Keyed to the offer row's updatedAt at counter time: once the server row
  // changes (our counter landed, or the pal re-priced), the local flag expires
  // and the server state wins.
  const [counteredIds, setCounteredIds] = useState<Record<string, { price: number; baseUpdatedAt: number }>>({});

  const offers = ((!isMatched && !isCompleted && activeFavor?.offers) || []).filter((o) => {
    const d = declinedIds[o.id];
    return !d || o.updatedAt !== d.baseUpdatedAt || o.price !== d.price;
  });

  const onAcceptOffer = async (o: FavorOffer) => {
    if (offerBusy) return;
    setOfferBusy(o.id);
    // Echo the exact price on the card — the server refuses if it changed.
    const res = await acceptOffer(o.favorId, o.id, o.price);
    setOfferBusy(null);
    if (!res.ok) setOfferError({ title: 'Offer unavailable', message: res.reason || 'This offer is no longer available.' });
    // Success flips activeFavor to 'matched' → the match alert renders.
  };

  const onDeclineOffer = async (o: FavorOffer) => {
    if (offerBusy) return;
    setOfferBusy(o.id);
    try {
      await declineOfferApi(o.favorId, o.id);
      setDeclinedIds((m) => ({ ...m, [o.id]: { price: o.price, baseUpdatedAt: o.updatedAt } }));
    } catch {
      setOfferError({ title: 'Decline failed', message: 'Could not decline the offer. Please try again.' });
    }
    setOfferBusy(null);
  };

  const counterValue = Math.round(parseFloat(counterText) * 100) / 100;
  const counterValid = !Number.isNaN(counterValue) && counterValue > 0 && counterValue <= 100000;
  const sendCounter = async () => {
    const target = counterFor;
    if (!target || !counterValid || offerBusy) return;
    setOfferBusy(target.id);
    try {
      await counterOfferApi(target.favorId, target.id, counterValue);
      setCounteredIds((m) => ({ ...m, [target.id]: { price: counterValue, baseUpdatedAt: target.updatedAt } }));
    } catch {
      setOfferError({ title: 'Counter not sent', message: 'Could not send your counter offer. Please try again.' });
    }
    setOfferBusy(null);
    setCounterFor(null);
    setCounterText('');
  };

  // Confirmed cancel: await the server, surface failure, leave state alone on
  // error (the favor is still live — a pal may already be en route).
  const onConfirmCancel = async () => {
    if (cancelBusy) return;
    setCancelBusy(true);
    const res = await cancelFavor();
    setCancelBusy(false);
    setCancelAsk(false);
    if (res.ok) {
      clearPalCanceled();
      navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
    } else {
      setCancelError(res.reason || 'Could not cancel this favor. Please try again.');
    }
  };

  // Incoming price offers — accept / counter / decline inline. Shared by the
  // immediate AND scheduled branches: scheduled favors broadcast right away, so
  // pals can offer before the window and the member must be able to approve.
  const offersBlock = offers.length > 0 ? (
    <View style={{ alignSelf: 'stretch', marginTop: 18 }}>
      {offers.map((o) => {
        // Our counter is on the table (server-confirmed, or sent
        // moments ago and not yet reflected by the 4s poll).
        const local = counteredIds[o.id];
        const justCountered = local != null && o.lastBy !== 'member' && o.updatedAt === local.baseUpdatedAt;
        const waitingOnPal = o.lastBy === 'member' || justCountered;
        const shownPrice = justCountered ? local.price : o.price;
        // A list-price request is the pal "accepting" the favor —
        // the member's ACCEPT here is the approval of the PERSON.
        const isListPrice = !waitingOnPal && o.lastBy === 'pal' && o.price === activeFavor?.price;
        const palLabel = o.pal?.firstName ?? 'A Favor Pal';
        return (
          <View key={o.id} style={styles.offerCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() => { if (o.pal?.id) setProfilePalId(o.pal.id); }}
                accessibilityRole="button"
                accessibilityLabel={`View ${palLabel}'s profile and reviews`}
              >
                <Avatar uri={o.pal?.avatar} size={42} name={palLabel} />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.offerName} numberOfLines={1}>
                  {palLabel +
                    (o.pal?.rating ? `  ·  ★ ${o.pal.rating.toFixed(1)}` : '  ·  New') +
                    (o.pal?.totalFavors ? `  ·  ${o.pal.totalFavors} favors` : '')}
                </Text>
                <Text style={styles.offerPrice}>
                  {waitingOnPal
                    ? `You countered $${shownPrice.toFixed(2)} — waiting on their reply`
                    : isListPrice
                      ? `Wants your favor at your listed $${o.price.toFixed(2)}`
                      : `Offers $${o.price.toFixed(2)}`}
                </Text>
              </View>
              {!waitingOnPal ? (
                <TouchableOpacity
                  style={[styles.offerAccept, offerBusy != null && { opacity: 0.5 }]}
                  disabled={offerBusy != null}
                  onPress={() => onAcceptOffer(o)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isListPrice
                      ? `Approve ${palLabel} for your favor`
                      : `Accept ${palLabel}'s offer of $${o.price.toFixed(2)}`
                  }
                >
                  <Text style={styles.offerAcceptText}>
                    {offerBusy === o.id ? '…' : isListPrice ? 'APPROVE' : 'ACCEPT'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {!waitingOnPal ? (
              <View style={{ flexDirection: 'row', marginTop: 8, gap: 20 }}>
                <TouchableOpacity
                  onPress={() => { if (o.pal?.id) setProfilePalId(o.pal.id); }}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${palLabel}'s profile`}
                >
                  <Text style={styles.offerLink}>PROFILE</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setCounterFor(o); setCounterText(''); }}
                  accessibilityRole="button"
                  accessibilityLabel="Counter this offer"
                >
                  <Text style={styles.offerLink}>COUNTER</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onDeclineOffer(o)}
                  accessibilityRole="button"
                  accessibilityLabel="Decline this offer"
                >
                  <Text style={[styles.offerLink, { color: SUB }]}>DECLINE</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  ) : null;

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: WHITE }} />;

  return (
    <View style={{ flex: 1, backgroundColor: '#D8D8D8' }}>
      {/* v.2 light map backdrop with red pins — a REAL map of the favor
          location on native, the Figma export on web. */}
      {MAP_SCENE_SUPPORTED && activeFavor?.location ? (
        <MapScene
          center={activeFavor.location}
          zoom={15}
          interactive={false}
          markers={[{ lat: activeFavor.location.lat, lng: activeFavor.location.lng, kind: 'pin' }]}
        />
      ) : (
        <>
          <Image source={MAP_IMG} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} resizeMode="cover" />
          <Ionicons name="location" size={42} color={RED} style={[styles.pin, { top: SCREEN_H * 0.13, left: SCREEN_W * 0.2 }]} />
          <Ionicons name="location" size={42} color={RED} style={[styles.pin, { top: SCREEN_H * 0.24, left: SCREEN_W * 0.6 }]} />
        </>
      )}

      {/* 50% scrim, then the centered alert card */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} pointerEvents="none" />

      <View style={[StyleSheet.absoluteFill, styles.scrimCenter, { backgroundColor: 'transparent' }]}>
        {/* maxHeight + ScrollView: many simultaneous offers must scroll inside
            the card, never push the cancel/back controls off-screen. */}
        <View style={[styles.alertCard, { maxHeight: '78%' }]}>
          <ScrollView style={{ alignSelf: 'stretch' }} showsVerticalScrollIndicator={false}>
          {!activeFavor ? (
            <>
              {/* The favor left the active set (cancelled / completed elsewhere). */}
              <Text style={styles.alertTitle}>This favor is no longer active</Text>
              <BlackButton
                title="BACK TO HOME"
                onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] })}
                style={{ marginTop: 20 }}
              />
            </>
          ) : isPendingRelease ? (
            <>
              {/* The pal finished while this screen was up — hand the member to
                  the release sheet, never the searching spinner (and no cancel:
                  the server refuses on finished work). */}
              <Text style={styles.alertTitle}>Your Favor Pal finished the favor.</Text>
              <Text style={styles.alertBody}>
                {`Review the work and release ${palName}'s payment.`}
              </Text>
              <BlackButton
                title="REVIEW & RELEASE PAYMENT"
                onPress={() => navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'FavorTracking' }] })}
                style={{ marginTop: 20 }}
              />
              <TouchableOpacity
                onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] })}
                style={{ marginTop: 14, alignSelf: 'center', paddingVertical: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Back to home"
              >
                <Text style={styles.tooLong}>Back to home</Text>
              </TouchableOpacity>
            </>
          ) : isCompleted ? (
            <>
              {/* The favor finished while this screen was up (quick favor, app
                  backgrounded): completion state, not an eternal spinner — the
                  rating prompt lives on tracking. */}
              <Text style={styles.alertTitle}>Your favor is complete!</Text>
              <Text style={styles.alertBody}>
                {`${palName} finished your favor. Leave a rating to wrap it up.`}
              </Text>
              <BlackButton
                title="RATE YOUR FAVOR PAL"
                onPress={() => navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'FavorTracking' }] })}
                style={{ marginTop: 20 }}
              />
              <TouchableOpacity
                onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] })}
                style={{ marginTop: 14, alignSelf: 'center', paddingVertical: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Back to home"
              >
                <Text style={styles.tooLong}>Back to home</Text>
              </TouchableOpacity>
            </>
          ) : isScheduled ? (
            <>
              {/* Scheduled-request modal (v.2): "YOUR FAVOR HAS BEEN REQUESTED" +
                  date chip + "Please wait while we search for a favor pal near you!" */}
              <Text style={[styles.alertTitle, { fontSize: 16, letterSpacing: 0.4 }]}>
                YOUR FAVOR HAS BEEN REQUESTED
              </Text>
              <View style={styles.scheduleChip}>
                <Text style={styles.scheduleChipText}>{formatSchedule(activeFavor?.scheduledFor)}</Text>
              </View>
              <Text style={styles.alertBody}>Please wait while we search for a favor pal near you!</Text>
              {/* Scheduled favors broadcast immediately — offers can arrive (and
                  need approving) long before the window opens. */}
              {offersBlock}
              {/* app addition — no v2 frame shows an exit, but the member needs one */}
              <BlackButton title="BACK TO HOME" onPress={() => navigation.popToTop()} style={{ marginTop: 20 }} />
              <TouchableOpacity
                onPress={() => setCancelAsk(true)}
                style={{ marginTop: 14, alignSelf: 'center', paddingVertical: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Cancel this favor request"
              >
                <Text style={[styles.tooLong, { color: RED }]}>Cancel favor request</Text>
              </TouchableOpacity>
            </>
          ) : isMatched ? (
            <>
              {/* v.2 Match Alert Notification #125:10778 — "Fabrizio has accepted
                  your favor! / You favor pal is on their way." (typo corrected) */}
              <Text style={styles.alertTitle}>{`${palName} has accepted your favor!`}</Text>
              <Text style={styles.alertBody}>Your favor pal is on their way.</Text>
              <BlackButton
                title="OKAY"
                // Collapse the whole checkout flow: tracking sits directly on
                // Tabs so back from tracking lands on Home, not a stale sheet.
                onPress={() => navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'FavorTracking' }] })}
                style={{ marginTop: 20 }}
              />
            </>
          ) : (
            <>
              <Text style={styles.alertTitle}>Finding your Favor Pal…</Text>
              {palCanceled ? (
                <Text style={[styles.alertBody, { color: RED }]}>
                  Your previous Favor Pal canceled — your favor is back out to nearby pals.
                </Text>
              ) : null}
              <Text style={styles.alertBody}>
                Your favor is out to nearby Favor Pals. Offers and the match will show up right here.
              </Text>
              <ActivityIndicator color={INK} style={{ marginTop: 16 }} />

              {/* Incoming price offers — accept / counter / decline inline. */}
              {offersBlock}

              {/* Exit while waiting — the favor stays live and reachable from the
                  app-wide trip bar. */}
              <TouchableOpacity
                onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] })}
                style={{ marginTop: 18, alignSelf: 'center', paddingVertical: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Back to home"
              >
                <Text style={styles.tooLong}>Back to home</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCancelAsk(true)}
                style={{ marginTop: 8, alignSelf: 'center', paddingVertical: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Cancel this favor request"
              >
                <Text style={[styles.tooLong, { color: RED }]}>Cancel favor request</Text>
              </TouchableOpacity>
            </>
          )}
          </ScrollView>
        </View>
      </View>

      {/* Candidate pal's full profile + reviews — read before approving. */}
      <PalProfileModal palId={profilePalId} onClose={() => setProfilePalId(null)} />

      {/* Cancel-while-waiting confirm. The copy quotes the LIVE cancellation
          maths — the favor can match underneath this modal, at which point a
          fee applies and "you won't be charged" would be a lie. */}
      <Modal
        visible={cancelAsk}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!cancelBusy) setCancelAsk(false); }}
        accessibilityViewIsModal
      >
        <View style={styles.scrimCenter}>
          <View style={styles.alertCard}>
            <Text style={styles.alertTitle}>Cancel this favor request?</Text>
            <Text style={styles.alertBody}>
              {cancelQuote?.committed
                ? `A Favor Pal has already committed, so a $${cancelQuote.fee.toFixed(2)} cancellation fee applies — you'll be refunded $${cancelQuote.refund.toFixed(2)}.`
                : "No Favor Pal has committed yet, so you won't be charged."}
            </Text>
            <BlackButton
              title="CANCEL REQUEST"
              onPress={onConfirmCancel}
              busy={cancelBusy}
              style={{ marginTop: 20 }}
            />
            <TouchableOpacity
              onPress={() => setCancelAsk(false)}
              disabled={cancelBusy}
              style={{ marginTop: 14, alignSelf: 'center', paddingVertical: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Keep waiting for a pal"
              accessibilityState={{ disabled: cancelBusy }}
            >
              <Text style={styles.tooLong}>Keep waiting</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Counter-offer input */}
      <Modal
        visible={counterFor != null}
        transparent
        animationType="fade"
        onRequestClose={() => setCounterFor(null)}
        accessibilityViewIsModal
      >
        <View style={styles.scrimCenter}>
          <View style={styles.alertCard}>
            <Text style={styles.alertTitle}>Counter offer</Text>
            <Text style={styles.alertBody}>
              {`${counterFor?.pal?.firstName ?? 'The pal'} offered $${(counterFor?.price ?? 0).toFixed(2)}. Name your price — they can accept or counter back.`}
            </Text>
            <View style={styles.counterField}>
              <TextInput
                value={counterText}
                onChangeText={setCounterText}
                keyboardType="decimal-pad"
                placeholder="$ Your price"
                placeholderTextColor="#9E9E9E"
                style={styles.counterInput}
                accessibilityLabel="Counter offer amount"
              />
            </View>
            <BlackButton
              title={counterValid ? `SEND COUNTER — $${counterValue.toFixed(2)}` : 'SEND COUNTER'}
              onPress={sendCounter}
              disabled={!counterValid}
              busy={counterFor != null && offerBusy === counterFor.id}
              style={{ marginTop: 16 }}
            />
            <TouchableOpacity
              onPress={() => setCounterFor(null)}
              style={{ marginTop: 12, alignSelf: 'center' }}
              accessibilityRole="button"
              accessibilityLabel="Cancel counter offer"
            >
              <Text style={styles.tooLong}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <AlertModal
        visible={offerError != null}
        title={offerError?.title ?? ''}
        message={offerError?.message ?? ''}
        buttonLabel="OK"
        onClose={() => setOfferError(null)}
      />

      <AlertModal
        visible={!!cancelError}
        title="Cancel failed"
        message={cancelError}
        buttonLabel="OK"
        onClose={() => setCancelError('')}
      />
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
  brandText: { fontSize: 20, fontFamily: 'Poppins_700Bold', letterSpacing: 0.5, color: INK },
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
    borderRadius: 16,
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
  alertTitle: { fontFamily: P500, fontSize: 20, lineHeight: 30, color: INK, textAlign: 'center' },
  alertBody: { fontFamily: P400, fontSize: 14, lineHeight: 22, color: SUB, textAlign: 'center', marginTop: 16 },
  tooLong: { fontFamily: P500, fontSize: 14, lineHeight: 21, color: INK, textAlign: 'center', marginTop: 14 },
  // Scheduled-request modal date chip ("Feb 16, 12:00PM ASAP" on gray fill).
  scheduleChip: {
    alignSelf: 'stretch',
    height: 40,
    borderRadius: 6,
    backgroundColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 12,
  },
  scheduleChipText: { fontFamily: P500, fontSize: 15, color: INK },

  // --- Searching map -------------------------------------------------------
  pin: { position: 'absolute' },

  // --- Negotiation (offers on the Searching card) ----------------------------
  offerCard: {
    borderWidth: 1,
    borderColor: DIVIDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
  },
  offerName: { fontFamily: P500, fontSize: 15, color: INK },
  offerPrice: { fontFamily: P400, fontSize: 13, color: SUB, marginTop: 2 },
  offerAccept: {
    backgroundColor: INK,
    borderRadius: 8,
    paddingHorizontal: 14,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  offerAcceptText: { fontFamily: P500, fontSize: 13, color: WHITE, letterSpacing: 0.4 },
  offerLink: { fontFamily: P500, fontSize: 13, color: INK, letterSpacing: 0.4 },
  counterField: {
    marginTop: 16,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DFDFDF',
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  counterInput: { fontFamily: P400, fontSize: 16, color: INK, padding: 0 },
});
