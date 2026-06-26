import React, { useState } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, Pressable, StyleSheet, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Txt, Button, MapPlaceholder, InfoModal } from '../components';
import { useTheme, tokens } from '../theme';
import { useStore } from '../store';
import { FAVOR_TIERS, computeFees, FavorTier } from '../types';

// Tier illustrations (shared with the request flow) for the summary thumbnail.
const TIER_IMAGES: Record<string, any> = {
  tiny: require('../../assets/img/request/tier-tiny.png'),
  small: require('../../assets/img/request/tier-small.png'),
  big: require('../../assets/img/request/tier-big.png'),
  huge: require('../../assets/img/request/tier-huge.png'),
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Stripe-style blue "Pay" button on the payment sheet (matches the reference).
const PAY_BLUE = '#2D6CE0';

const FALLBACK_DESC =
  'Sum dolor sit amet, consectetur adipiscing elit. A quis hendrerit sagittis, ' +
  'duis lectus lacus, mattis pharetra morbi.';
const FALLBACK_ADDRESS = '2099 Woodvine Rd, Lorman';

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
  const description = draftFavor?.description || FALLBACK_DESC;
  const address = draftFavor?.location?.address || FALLBACK_ADDRESS;
  const image = draftFavor?.images?.[0];
  return { base, label, fees, description, address, image, tier };
}

// ---------------------------------------------------------------------------
// Shared header (large rounded title + back arrow + hairline)
// ---------------------------------------------------------------------------
function CheckoutHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.header, { borderBottomColor: theme.border }]}>
      <TouchableOpacity onPress={onBack} disabled={!onBack} hitSlop={10} style={{ width: 38 }}>
        {onBack && <Ionicons name="arrow-back" size={26} color={theme.text} />}
      </TouchableOpacity>
      <Txt variant="h3" numberOfLines={1} style={{ flex: 1, marginLeft: 6 }}>
        {title}
      </Txt>
    </View>
  );
}

function CostRow({ left, right, bold }: { left: string; right: string; bold?: boolean }) {
  const { theme } = useTheme();
  const color = bold ? theme.text : theme.textSecondary;
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
  const { theme } = useTheme();
  const { base, label, fees, description, address, image, tier } = useFavorSummary();
  const tierImage = TIER_IMAGES[tier as string];
  return (
    <View style={styles.body}>
      <View style={styles.costBlock}>
        <View style={[styles.thumb, { backgroundColor: theme.surfaceAlt }]}>
          {image ? (
            <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} />
          ) : tierImage ? (
            <Image source={tierImage} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          ) : (
            <Ionicons name="walk" size={34} color={theme.textTertiary} />
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <CostRow left={label} right={`$${base}`} bold />
          <CostRow left="Service Fee @ 2.9%" right={`$${fees.serviceFee.toFixed(2)}`} />
          <CostRow left="Transaction Fee" right={`$${fees.transactionFee.toFixed(2)}`} />
          <CostRow left="Total Cost" right={`$${fees.total.toFixed(2)}`} />
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.divider }]} />

      <View style={styles.sectionHead}>
        <Ionicons name="document-text" size={22} color={theme.text} />
        <Txt variant="h4" style={{ marginLeft: 12 }}>Description</Txt>
      </View>
      <Txt variant="body" color={theme.textSecondary} style={{ marginTop: 10 }}>
        {description}
      </Txt>

      <View style={[styles.divider, { backgroundColor: theme.divider }]} />

      <View style={styles.sectionHead}>
        <Ionicons name="location" size={22} color={theme.text} />
        <Txt variant="h4" style={{ marginLeft: 12 }}>Address</Txt>
      </View>
      <Txt variant="body" color={theme.textSecondary} style={{ marginTop: 10 }}>
        {address}
      </Txt>

      <View style={[styles.divider, { backgroundColor: theme.divider }]} />
    </View>
  );
}

// ===========================================================================
// 1. Favor Summary
// ===========================================================================
export const FavorSummary = ({ navigation }: any) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <CheckoutHeader title="Favor Summary Appointment" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }}>
        <SummaryBody />
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 10 }}>
        <Button title="PAY NOW" onPress={() => navigation.navigate('SelectPayment')} />
      </View>
    </SafeAreaView>
  );
};

// ===========================================================================
// 2. Select Payment (bottom sheet over the dimmed summary)
// ===========================================================================
export const SelectPayment = ({ navigation }: any) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { cards, requestFavor, pals } = useStore();
  const { fees } = useFavorSummary();
  const [selected, setSelected] = useState<string | null>(cards[0]?.id ?? null);
  const [noPal, setNoPal] = useState(false);

  const pay = async () => {
    // No FavorPals available in the area → surface the empty-state alert.
    if (pals.length === 0) {
      setNoPal(true);
      return;
    }
    await requestFavor();
    navigation.navigate('Searching');
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Dimmed summary behind the sheet */}
      <View style={[StyleSheet.absoluteFill, { paddingTop: insets.top }]} pointerEvents="none">
        <CheckoutHeader title="Favor Summary Appointment" onBack={() => {}} />
        <SummaryBody />
      </View>

      {/* Scrim */}
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
        onPress={() => navigation.goBack()}
      />

      {/* Sheet */}
      <View style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.closeBtn, tokens.shadow.card, { backgroundColor: theme.card }]}>
            <Ionicons name="close" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Payment')} hitSlop={10}>
            <Txt variant="body" color={theme.textSecondary}>Edit</Txt>
          </TouchableOpacity>
        </View>

        <Txt variant="h2" style={{ marginTop: 14 }}>Select your payment method</Txt>

        <View style={styles.tiles}>
          {/* Add new card */}
          <View style={styles.tileWrap}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('AddCard')}
              style={[styles.tile, tokens.shadow.card, { backgroundColor: theme.card }]}
            >
              <View style={[styles.addCircle, { backgroundColor: theme.surfaceAlt }]}>
                <Ionicons name="add" size={26} color={theme.text} />
              </View>
            </TouchableOpacity>
            <Txt variant="label" style={{ marginTop: 10 }}>+ Add</Txt>
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
                    tokens.shadow.card,
                    { backgroundColor: theme.card, borderWidth: isSel ? 2 : 0, borderColor: theme.success },
                  ]}
                >
                  <Text style={[styles.brandText, { color: theme.text }]}>{c.brand.toUpperCase()}</Text>
                  {isSel && (
                    <View style={[styles.checkBadge, { backgroundColor: theme.success, borderColor: theme.card }]}>
                      <Ionicons name="checkmark" size={15} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
                <Txt variant="label" style={{ marginTop: 10 }}>{`•••• ${c.last4}`}</Txt>
              </View>
            );
          })}
        </View>

        <TouchableOpacity activeOpacity={0.9} onPress={pay} style={[styles.payBtn, { backgroundColor: PAY_BLUE }]}>
          <Txt variant="button" color="#fff" style={{ fontSize: 18, lineHeight: 24 }}>
            {`Pay US$${fees.total.toFixed(2)}`}
          </Txt>
          <Ionicons name="lock-closed" size={18} color="#fff" style={{ position: 'absolute', right: 22 }} />
        </TouchableOpacity>
      </View>

      <InfoModal
        visible={noPal}
        title="NO FAVOR PAL AVAILABLE"
        message="We are sorry that there are no FavorPals in your area at the moment.  Please try again later."
        onClose={() => setNoPal(false)}
      />
    </View>
  );
};

// ===========================================================================
// 3. Searching (centered modal over a map)
// ===========================================================================
export const Searching = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { pals } = useStore();
  const palName = pals[0]?.firstName ?? 'a Favor Pal';

  return (
    <View style={{ flex: 1 }}>
      <MapPlaceholder height={SCREEN_H} label="">
        <View style={[styles.pin, { top: SCREEN_H * 0.30, left: SCREEN_W * 0.26 }]}>
          <Ionicons name="location" size={42} color={theme.primary} />
        </View>
        <View style={[styles.pin, { top: SCREEN_H * 0.20, left: SCREEN_W * 0.64 }]}>
          <Ionicons name="location" size={42} color={theme.primary} />
        </View>
      </MapPlaceholder>

      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} pointerEvents="none" />

      <View style={[StyleSheet.absoluteFill, styles.modalWrap]}>
        <View style={[styles.modalCard, tokens.shadow.card, { backgroundColor: theme.card }]}>
          <Txt variant="h3" center>{`You have asked a favor from ${palName}`}</Txt>
          <Txt variant="body" color={theme.textSecondary} center style={{ marginTop: 12 }}>
            Please wait while we confirm.
          </Txt>
          <Txt variant="bodySm" color={theme.textSecondary} center style={{ marginTop: 16 }}>
            Taking too long?
          </Txt>
          <Button
            title="CHOOSE ANOTHER FAVOR PAL"
            onPress={() => navigation.navigate('ProviderResults')}
            style={{ marginTop: 16 }}
          />
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
  modalCard: { width: '100%', borderRadius: 16, paddingVertical: 28, paddingHorizontal: 24 },
});
