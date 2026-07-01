import React, { useState, useEffect } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, Pressable, StyleSheet, Dimensions, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Txt, Button, MapPlaceholder, InfoModal } from '../components';
import { tokens } from '../theme';
import { useStore } from '../store';
import { FAVOR_TIERS, computeFees, computePayout, FavorTier } from '../types';

// Tier illustrations (shared with the request flow) for the summary thumbnail.
const TIER_IMAGES: Record<string, any> = {
  tiny: require('../../assets/img/request/tier-tiny.png'),
  small: require('../../assets/img/request/tier-small.png'),
  big: require('../../assets/img/request/tier-big.png'),
  huge: require('../../assets/img/request/tier-huge.png'),
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// User App v.2 — the checkout / confirmation screens are DARK (matches
// favor-confirmation-v2). The shared useTheme() is the light auth palette, so
// these screens carry their own local dark tokens instead.
// ---------------------------------------------------------------------------
const DARK = {
  bg: '#0C0C0C',           // screen background (near-black)
  card: '#171922',         // dark navy card / bottom sheet
  cardAlt: '#1B222C',      // raised sheet surface
  field: '#1C2331',        // tiles / close button / thumbnail
  fieldAlt: '#2E3A44',     // add-circle / raised pill
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.6)',
  textTertiary: 'rgba(255,255,255,0.4)',
  border: 'rgba(255,255,255,0.10)',
  divider: 'rgba(255,255,255,0.10)',
  brand: '#ED1C24',        // scarlet accent / map pins
  star: '#FFBD00',
  success: '#02CB00',
  ctaBg: '#FFFFFF',        // v.2 filled CTA = white pill…
  ctaText: '#141414',      // …with dark text
};

const FALLBACK_DESC = 'No description provided.';
const FALLBACK_ADDRESS = '2099 Woodvine Rd, Lorman';

// Schedule label: 'Now' for an immediate favor, otherwise the picked date/time
// (same toLocaleString shape used on the Pal-side cards in pal.tsx).
const formatSchedule = (ms?: number) =>
  ms != null
    ? new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Now';

// ---------------------------------------------------------------------------
// Shared: derive the favor summary from the draft (defaults to Tiny / $20).
// Fees come from computeFees(base) so the summary, the pay button and the
// stored favor all agree.
// ---------------------------------------------------------------------------
function useFavorSummary() {
  const { draftFavor } = useStore();
  const tier = (draftFavor?.tier ?? 'tiny') as FavorTier;
  const tierMeta = (FAVOR_TIERS as Record<string, { label: string; price: number }>)[tier];
  const base = draftFavor?.price ?? tierMeta?.price ?? FAVOR_TIERS.tiny.price;
  const label = tierMeta?.label ?? 'Custom Favor';
  const fees = computeFees(base);
  // Transparency split: what the member pays (fees.total) vs what the Pal
  // actually receives after the platform commission.
  const { payout } = computePayout(base);
  const description = draftFavor?.description || FALLBACK_DESC;
  const address = draftFavor?.location?.address || FALLBACK_ADDRESS;
  const image = draftFavor?.images?.[0];
  const scheduledFor = draftFavor?.scheduledFor;
  return { base, label, fees, payout, description, address, image, tier, scheduledFor };
}

// ---------------------------------------------------------------------------
// Shared header (large rounded title + back arrow + hairline)
// ---------------------------------------------------------------------------
function CheckoutHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <View style={[styles.header, { borderBottomColor: DARK.border }]}>
      <TouchableOpacity onPress={onBack} disabled={!onBack} hitSlop={10} style={{ width: 38 }}>
        {onBack && <Ionicons name="arrow-back" size={26} color={DARK.text} />}
      </TouchableOpacity>
      <Txt variant="h3" color={DARK.text} numberOfLines={1} style={{ flex: 1, marginLeft: 6 }}>
        {title}
      </Txt>
    </View>
  );
}

function CostRow({ left, right, bold }: { left: string; right: string; bold?: boolean }) {
  const color = bold ? DARK.text : DARK.textSecondary;
  return (
    <View style={[styles.costRow, { marginBottom: bold ? 6 : 4 }]}>
      <Txt variant={bold ? 'h3' : 'body'} color={color}>{left}</Txt>
      <Txt variant={bold ? 'h3' : 'body'} color={color}>{right}</Txt>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared body of the Favor Summary (cost breakdown + description + address).
// Reused (dimmed) behind the payment sheet.
// ---------------------------------------------------------------------------
function SummaryBody() {
  const { base, label, fees, payout, description, address, image, tier, scheduledFor } = useFavorSummary();
  const tierImage = TIER_IMAGES[tier as string];
  return (
    <View style={styles.body}>
      <View style={styles.costBlock}>
        <View style={[styles.thumb, { backgroundColor: DARK.field }]}>
          {image ? (
            <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} />
          ) : tierImage ? (
            <Image source={tierImage} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          ) : (
            <Ionicons name="walk" size={34} color={DARK.textTertiary} />
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <CostRow left={label} right={`$${base.toFixed(2)}`} />
          <CostRow left="Service Fee @ 2.9%" right={`$${fees.serviceFee.toFixed(2)}`} />
          <CostRow left="Transaction Fee" right={`$${fees.transactionFee.toFixed(2)}`} />
          {/* Emphasize the Total — this is the amount the member is actually charged. */}
          <CostRow left="Total Cost" right={`$${fees.total.toFixed(2)}`} bold />
          <CostRow left="Favor Pal receives" right={`$${payout.toFixed(2)}`} />
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: DARK.divider }]} />

      <View style={styles.sectionHead}>
        <Ionicons name="time" size={22} color={DARK.text} />
        <Txt variant="h4" color={DARK.text} style={{ marginLeft: 12 }}>When</Txt>
      </View>
      <Txt variant="body" color={DARK.textSecondary} style={{ marginTop: 10 }}>
        {formatSchedule(scheduledFor)}
      </Txt>

      <View style={[styles.divider, { backgroundColor: DARK.divider }]} />

      <View style={styles.sectionHead}>
        <Ionicons name="document-text" size={22} color={DARK.text} />
        <Txt variant="h4" color={DARK.text} style={{ marginLeft: 12 }}>Description</Txt>
      </View>
      <Txt variant="body" color={DARK.textSecondary} style={{ marginTop: 10 }}>
        {description}
      </Txt>

      <View style={[styles.divider, { backgroundColor: DARK.divider }]} />

      <View style={styles.sectionHead}>
        <Ionicons name="location" size={22} color={DARK.text} />
        <Txt variant="h4" color={DARK.text} style={{ marginLeft: 12 }}>Address</Txt>
      </View>
      <Txt variant="body" color={DARK.textSecondary} style={{ marginTop: 10 }}>
        {address}
      </Txt>

      <View style={[styles.divider, { backgroundColor: DARK.divider }]} />
    </View>
  );
}

// ===========================================================================
// 1. Favor Summary
// ===========================================================================
export const FavorSummary = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: DARK.bg }} edges={['top']}>
      <CheckoutHeader title="Favor Summary Appointment" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }}>
        <SummaryBody />
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 10 }}>
        <Button title="PAY NOW" variant="white" onPress={() => navigation.navigate('SelectPayment')} />
      </View>
    </SafeAreaView>
  );
};

// ===========================================================================
// 2. Select Payment (bottom sheet over the dimmed summary)
// ===========================================================================
export const SelectPayment = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { cards, requestFavor, pals } = useStore();
  const { fees } = useFavorSummary();
  const [selected, setSelected] = useState<string | null>(cards[0]?.id ?? null);
  const [noPal, setNoPal] = useState(false);
  const [notified, setNotified] = useState(false);
  // In-flight guard for the (money-sensitive) Pay call: blocks double-submit and
  // drives the button's busy/spinner state. `payError` surfaces a failed charge
  // instead of silently stranding the member on the sheet.
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
    // No FavorPals available in the area → surface the recovery flow.
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

  // Zero-supply recovery: instead of dead-ending the member on the payment
  // sheet, register interest and return Home with their draft preserved so the
  // favor can be retried once a Pal is available.
  const onNotifyMe = () => {
    setNoPal(false);
    setNotified(true);
  };
  const onNotifiedClose = () => {
    setNotified(false);
    navigation.popToTop();
  };

  return (
    <View style={{ flex: 1, backgroundColor: DARK.bg }}>
      {/* Dimmed summary behind the sheet */}
      <View style={[StyleSheet.absoluteFill, { paddingTop: insets.top }]} pointerEvents="none">
        <CheckoutHeader title="Favor Summary Appointment" onBack={() => {}} />
        <SummaryBody />
      </View>

      {/* Scrim */}
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
        onPress={() => navigation.goBack()}
      />

      {/* Sheet */}
      <View style={[styles.sheet, { backgroundColor: DARK.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.closeBtn, { backgroundColor: DARK.field }]}>
            <Ionicons name="close" size={20} color={DARK.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Payment')} hitSlop={10}>
            <Txt variant="body" color={DARK.textSecondary}>Edit</Txt>
          </TouchableOpacity>
        </View>

        <Txt variant="h2" color={DARK.text} style={{ marginTop: 14 }}>Select your payment method</Txt>

        <View style={styles.tiles}>
          {/* Add new card */}
          <View style={styles.tileWrap}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('AddCard')}
              style={[styles.tile, { backgroundColor: DARK.field }]}
            >
              <View style={[styles.addCircle, { backgroundColor: DARK.fieldAlt }]}>
                <Ionicons name="add" size={26} color={DARK.text} />
              </View>
            </TouchableOpacity>
            <Txt variant="label" color={DARK.text} style={{ marginTop: 10 }}>+ Add</Txt>
          </View>

          {/* Saved cards */}
          {cards.map((c) => {
            const isSel = c.id === selected;
            return (
              <View key={c.id} style={styles.tileWrap}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSelected(c.id)}
                  style={[
                    styles.tile,
                    { backgroundColor: DARK.field, borderWidth: isSel ? 2 : 0, borderColor: DARK.success },
                  ]}
                >
                  <Text style={[styles.brandText, { color: DARK.text }]}>{c.brand.toUpperCase()}</Text>
                  {isSel && (
                    <View style={[styles.checkBadge, { backgroundColor: DARK.success, borderColor: DARK.card }]}>
                      <Ionicons name="checkmark" size={15} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
                <Txt variant="label" color={DARK.text} style={{ marginTop: 10 }}>{`•••• ${c.last4}`}</Txt>
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
          style={[styles.payBtn, { backgroundColor: DARK.ctaBg, opacity: canPay && !paying ? 1 : 0.5 }]}
        >
          {paying ? (
            <ActivityIndicator color={DARK.ctaText} />
          ) : (
            <>
              <Txt variant="button" color={DARK.ctaText} style={{ fontSize: 18, lineHeight: 24 }}>
                {`Pay US$${fees.total.toFixed(2)}`}
              </Txt>
              <Ionicons name="lock-closed" size={18} color={DARK.ctaText} style={{ position: 'absolute', right: 22 }} />
            </>
          )}
        </TouchableOpacity>
      </View>

      <InfoModal
        visible={noPal}
        title="NO FAVOR PAL AVAILABLE"
        message="We're sorry — there are no Favor Pals in your area right now. We can let you know the moment one becomes available."
        buttonLabel="Notify me when available"
        onClose={onNotifyMe}
      />

      <InfoModal
        visible={notified}
        title="WE'LL NOTIFY YOU"
        message="Great — we'll send you a notification as soon as a Favor Pal is available in your area. Your favor details have been saved."
        buttonLabel="Back to Home"
        onClose={onNotifiedClose}
      />

      <InfoModal
        visible={payError}
        title="PAYMENT FAILED"
        message="We couldn't complete your payment. Please check your connection and try again — you have not been charged."
        buttonLabel="Try again"
        onClose={() => setPayError(false)}
      />
    </View>
  );
};

// ===========================================================================
// 3. Searching (centered modal over a map)
// ===========================================================================
export const Searching = ({ navigation }: any) => {
  const { pals, advanceFavor, assignPal, activeFavor } = useStore();
  const matchedPal = pals[0];
  const palName = matchedPal?.firstName ?? 'a Favor Pal';

  // A favor booked for a future time should NOT be matched/en-route the instant
  // it is paid for — it stays "Scheduled" until its window. Only the immediate
  // ("Now") flow runs the live-match simulation below.
  const isScheduled = activeFavor?.scheduledFor != null && activeFavor.scheduledFor > Date.now();

  // Simulate the Pal accepting shortly after payment: bind the matched pal so the
  // tracking screen shows the same person named here, advance the favor to
  // 'matched', and replace into live tracking (replace so Back/gesture doesn't
  // dump the member back onto this stale Searching modal). The "Choose another
  // Favor Pal" button below stays as the genuine impatient-user fallback.
  useEffect(() => {
    if (isScheduled) return; // scheduled favors don't drive en-route tracking yet
    const t = setTimeout(() => {
      if (matchedPal) assignPal(matchedPal.id);
      else advanceFavor('matched');
      navigation.replace('FavorTracking');
    }, 2500);
    return () => clearTimeout(t);
  }, [isScheduled, matchedPal, assignPal, advanceFavor, navigation]);

  return (
    <View style={{ flex: 1, backgroundColor: DARK.bg }}>
      <MapPlaceholder height={SCREEN_H} label="">
        <View style={[styles.pin, { top: SCREEN_H * 0.30, left: SCREEN_W * 0.26 }]}>
          <Ionicons name="location" size={42} color={DARK.brand} />
        </View>
        <View style={[styles.pin, { top: SCREEN_H * 0.20, left: SCREEN_W * 0.64 }]}>
          <Ionicons name="location" size={42} color={DARK.brand} />
        </View>
      </MapPlaceholder>

      {/* Heavy dark scrim so the (shared, light) map placeholder reads as the
          v.2 dark map behind the sheet. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,12,12,0.55)' }]} pointerEvents="none" />

      <View style={[StyleSheet.absoluteFill, styles.modalWrap]}>
        <View style={[styles.modalCard, { backgroundColor: DARK.card, borderColor: DARK.border }]}>
          {isScheduled ? (
            <>
              <Ionicons
                name="calendar"
                size={40}
                color={DARK.brand}
                style={{ alignSelf: 'center', marginBottom: 12 }}
              />
              <Txt variant="h3" color={DARK.text} center>Favor scheduled</Txt>
              <Txt variant="body" color={DARK.textSecondary} center style={{ marginTop: 12 }}>
                {`We'll match you with a Favor Pal for ${formatSchedule(activeFavor?.scheduledFor)}.`}
              </Txt>
              <Button
                title="BACK TO HOME"
                variant="white"
                onPress={() => navigation.popToTop()}
                style={{ marginTop: 20 }}
              />
            </>
          ) : (
            <>
              <Txt variant="h3" color={DARK.text} center>{`You have asked a favor from ${palName}`}</Txt>
              <ActivityIndicator color={DARK.brand} size="large" style={{ marginTop: 18 }} />
              <Txt variant="body" color={DARK.textSecondary} center style={{ marginTop: 12 }}>
                Please wait while we confirm.
              </Txt>
              <Txt variant="bodySm" color={DARK.textTertiary} center style={{ marginTop: 16 }}>
                Taking too long?
              </Txt>
              <Button
                title="CHOOSE ANOTHER FAVOR PAL"
                variant="white"
                onPress={() => navigation.navigate('ProviderResults')}
                style={{ marginTop: 16 }}
              />
            </>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { paddingHorizontal: 20, paddingTop: 18 },
  costBlock: { flexDirection: 'row', alignItems: 'center' },
  thumb: {
    width: 78,
    height: 78,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  divider: { height: 1, marginVertical: 18 },
  sectionHead: { flexDirection: 'row', alignItems: 'center' },

  // Payment sheet
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 18,
  },
  sheetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  closeBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', marginTop: 22 },
  tileWrap: { alignItems: 'center', marginRight: 18 },
  tile: {
    width: 132,
    height: 104,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 26, fontWeight: '800', fontStyle: 'italic', letterSpacing: 0.5 },
  checkBadge: {
    position: 'absolute',
    right: -8,
    bottom: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtn: {
    height: 56,
    borderRadius: 14,
    marginTop: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Searching modal
  pin: { position: 'absolute' },
  modalWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  modalCard: { width: '100%', borderRadius: 16, paddingVertical: 28, paddingHorizontal: 24, borderWidth: 1 },
});
