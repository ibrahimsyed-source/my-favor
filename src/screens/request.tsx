import React, { useState, useRef, useCallback } from 'react';
import {
  View, Image, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as ImagePicker from 'expo-image-picker';
import { Txt, Button, Avatar } from '../components';
import { tokens } from '../theme';
import { useStore } from '../store';
import { FAVOR_TIERS, FavorTier } from '../types';

// ---------------------------------------------------------------------------
// User App v.2 — DARK palette. These request-flow screens are intentionally
// dark (Favor Blast v.2). The shared useTheme() is LIGHT and only drives the
// auth screens, so we never read it for backgrounds/text here — colours,
// spacing and layout are matched to the v.2 reference via these local consts.
// ---------------------------------------------------------------------------
const SCREEN_BG = '#0C0C0C';           // content-screen background
const MAP_BG = '#11161F';              // dark map backdrop (ConfirmAddress)
const SHEET = '#171922';               // cards / bottom sheet
const RAISED = '#1C2331';              // raised fields / pills
const TXT = '#FFFFFF';                 // primary text
const TXT_2 = 'rgba(255,255,255,0.6)'; // secondary text
const TXT_3 = 'rgba(255,255,255,0.4)'; // tertiary / placeholder
const BORDER = 'rgba(255,255,255,0.10)';
const BRAND = '#ED1C24';               // brand red (pins / accents)
const THUMB_BG = '#EDEDED';            // light tile behind the tier illustrations

// Custom tier illustrations exported from Figma (node 100:12594).
const TIER_IMAGES: Record<'tiny' | 'small' | 'big' | 'huge', any> = {
  tiny: require('../../assets/img/request/tier-tiny.png'),
  small: require('../../assets/img/request/tier-small.png'),
  big: require('../../assets/img/request/tier-big.png'),
  huge: require('../../assets/img/request/tier-huge.png'),
};

// Plain-language examples so members can pick the right tier instead of guessing.
// Kept local (FAVOR_TIERS lives in the shared types module we don't edit here).
const TIER_EXAMPLES: Record<'tiny' | 'small' | 'big' | 'huge', string> = {
  tiny: 'Quick errands — dog walk, coffee run',
  small: '~1hr tasks — groceries, yard tidy',
  big: 'Half-day help — furniture build, deep clean',
  huge: 'Big jobs — small move, event setup',
};

// ---------------------------------------------------------------------------
// Shared dark chrome (replaces the light Screen / TopBar so these screens read
// dark without touching the shared light-theme components).
// ---------------------------------------------------------------------------
const DarkScreen: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <SafeAreaView style={{ flex: 1, backgroundColor: SCREEN_BG }} edges={['top']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {children}
    </KeyboardAvoidingView>
  </SafeAreaView>
);

const DarkTopBar: React.FC<{ title?: string; onBack?: () => void }> = ({ title, onBack }) => (
  <View style={styles.topbar}>
    {onBack ? (
      <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
        <Ionicons name="arrow-back" size={26} color={TXT} />
      </TouchableOpacity>
    ) : (
      <View style={{ width: 26 }} />
    )}
    <Txt variant="h6" color={TXT}>{title}</Txt>
    <View style={{ width: 26 }} />
  </View>
);

const Footer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.footer}>{children}</View>
);

// ---------------------------------------------------------------------------
// 1. SelectFavor — "How big is the favor?"
// ---------------------------------------------------------------------------
const TierCard: React.FC<{
  image?: any;
  title: string;
  price: string;
  example?: string;
  selected: boolean;
  onPress: () => void;
}> = ({ image, title, price, example, selected, onPress }) => (
  <TouchableOpacity
    activeOpacity={0.9}
    onPress={onPress}
    style={[
      styles.tierCard,
      { borderWidth: selected ? 2 : 1, borderColor: selected ? BRAND : BORDER },
    ]}
  >
    <View style={styles.thumb}>
      {image ? (
        <Image source={image} style={{ width: 60, height: 60 }} resizeMode="contain" />
      ) : (
        <Txt variant="h2" color="#141414">$</Txt>
      )}
    </View>
    <View style={{ flex: 1, marginLeft: 14 }}>
      <Txt variant="h6" color={TXT}>{title}</Txt>
      <Txt variant="caption" color={TXT_2} style={{ marginTop: 4 }}>
        {price}
      </Txt>
      {example ? (
        <Txt variant="caption" color={TXT_3} style={{ marginTop: 2 }}>
          {example}
        </Txt>
      ) : null}
    </View>
    <View style={[styles.selectPill, { backgroundColor: selected ? BRAND : RAISED }]}>
      <Txt variant="caption" color={selected ? '#FFFFFF' : TXT_2} style={{ fontSize: 11, letterSpacing: 0.5 }}>
        {selected ? 'SELECTED' : 'SELECT'}
      </Txt>
    </View>
  </TouchableOpacity>
);

export function SelectFavor({ navigation }: any) {
  const s = useStore();
  const [selected, setSelected] = useState<FavorTier | null>(null);

  const tierKeys: Array<keyof typeof FAVOR_TIERS> = ['tiny', 'small', 'big', 'huge'];
  const canNext = selected !== null;

  const onNext = () => {
    if (!selected) return;
    // "Custom" → negotiate the price by time on the Negotiate screen.
    if (selected === 'custom') {
      s.setDraft({ tier: 'negotiate' });
      navigation.navigate('Negotiate');
      return;
    }
    const price = FAVOR_TIERS[selected as keyof typeof FAVOR_TIERS].price;
    s.setDraft({ tier: selected, price });
    navigation.navigate('FavorDescription');
  };

  return (
    <DarkScreen>
      <DarkTopBar
        title="Select Favor"
        onBack={navigation.canGoBack() ? navigation.goBack : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: tokens.spacing.lg }} keyboardShouldPersistTaps="handled">
        <Txt variant="h3" color={TXT}>How big is the favor?</Txt>
        <Txt variant="body" color={TXT_2} style={{ marginTop: 8, marginBottom: tokens.spacing.base }}>
          Choose the cost of favor based on the amount of effort required.
        </Txt>

        <View
          style={{ flexDirection: 'row', alignItems: 'center', marginBottom: tokens.spacing.xl }}
        >
          <Ionicons name="information-circle-outline" size={16} color={TXT_2} />
          <Txt variant="caption" color={TXT_2} style={{ flex: 1, marginLeft: 6 }}>
            We'll match you with a nearby Favor Pal after checkout — you can switch to another Pal if you'd like.
          </Txt>
        </View>

        {tierKeys.map((key) => (
          <TierCard
            key={key}
            image={TIER_IMAGES[key as 'tiny' | 'small' | 'big' | 'huge']}
            title={FAVOR_TIERS[key].label}
            price={`$${FAVOR_TIERS[key].price.toFixed(2)}`}
            example={TIER_EXAMPLES[key as 'tiny' | 'small' | 'big' | 'huge']}
            selected={selected === key}
            onPress={() => setSelected(key)}
          />
        ))}

        <TierCard
          title="Custom"
          price="Negotiate your price"
          selected={selected === 'custom'}
          onPress={() => setSelected('custom')}
        />
      </ScrollView>

      <Footer>
        <Button title="NEXT" variant="white" disabled={!canNext} onPress={onNext} />
      </Footer>
    </DarkScreen>
  );
}

// ---------------------------------------------------------------------------
// 2. FavorDescription — "What is the favor?"
// ---------------------------------------------------------------------------
const DESC_PLACEHOLDER =
  'Provide as much detail as possible about your favor!  Let your provider know about what they will be doing, what they will need to bring, special requirements, etc.';

const DESC_MAX = 250;

// Memoized so a parent re-render (e.g. the Negotiate price slider dragging) never
// re-renders this TextInput. The counter shows the remaining-count honestly.
const DescriptionField = React.memo(function DescriptionField({
  value,
  onChangeText,
  maxLength = DESC_MAX,
}: {
  value: string;
  onChangeText: (t: string) => void;
  maxLength?: number;
}) {
  return (
    <>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={DESC_PLACEHOLDER}
        placeholderTextColor={TXT_3}
        multiline
        maxLength={maxLength}
        textAlignVertical="top"
        style={[tokens.typography.body, styles.descInput]}
        accessibilityLabel="Favor description"
      />
      <Txt variant="bodySm" color={TXT_2} style={{ textAlign: 'right', marginTop: 6 }}>
        {maxLength - value.length} characters left.
      </Txt>
    </>
  );
});

export function FavorDescription({ navigation }: any) {
  const s = useStore();
  const [desc, setDesc] = useState(s.draftFavor?.description ?? '');
  // Rehydrate a previously-picked photo from the draft so back-navigation through
  // this step doesn't silently overwrite draft.images with [] on re-submit.
  const [image, setImage] = useState<string | null>(s.draftFavor?.images?.[0] || null);
  // Track a failed load so we degrade to the "Add Image" placeholder instead of a
  // broken tile (e.g. a stale local URI that no longer resolves).
  const [imgError, setImgError] = useState(false);

  const pickImage = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
      // NOTE: expo-image-picker returns a device-local file:// URI. Uploading it to
      // real storage/CDN (returning an https URL the Pal can load on their device)
      // is DEFERRED — no upload infra/deps available here. Until then the URI only
      // resolves on this device; rendering degrades gracefully via onError below.
      if (!res.canceled && res.assets?.[0]) { setImage(res.assets[0].uri); setImgError(false); }
    } catch {
      // image picker is optional — ignore failures (e.g. web / no permission)
    }
  };

  const canNext = desc.trim().length > 0;

  const onNext = () => {
    if (!canNext) return;
    s.setDraft({ description: desc.trim(), images: image ? [image] : [] });
    navigation.navigate('ConfirmAddress');
  };

  return (
    <DarkScreen>
      <DarkTopBar
        title="Favor Description"
        onBack={navigation.canGoBack() ? navigation.goBack : undefined}
      />
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: tokens.spacing.lg }} keyboardShouldPersistTaps="handled">
        <Txt variant="h3" color={TXT} style={{ marginTop: 8 }}>What is the favor?</Txt>
        <Txt variant="body" color={TXT_2} style={{ marginTop: tokens.spacing.base, marginBottom: tokens.spacing.base }}>
          Describe the favor you need.
        </Txt>

        <DescriptionField value={desc} onChangeText={setDesc} />

        <TouchableOpacity activeOpacity={0.8} onPress={pickImage} style={styles.addTile}>
          {image && !imgError ? (
            <Image
              source={{ uri: image }}
              onError={() => setImgError(true)}
              style={{ width: '100%', height: '100%', borderRadius: tokens.radius.md }}
              resizeMode="cover"
            />
          ) : (
            <>
              <Ionicons name="camera" size={26} color={TXT_3} />
              <Txt variant="caption" color={TXT_2} style={{ marginTop: 6 }}>Add Image</Txt>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Footer>
        <Button title="NEXT" variant="white" disabled={!canNext} onPress={onNext} />
      </Footer>
    </DarkScreen>
  );
}

// ---------------------------------------------------------------------------
// 3. Negotiate — time-based pricing slider
// ---------------------------------------------------------------------------
const HOURLY_RATE = 100; // $/hr — 2hrs => $200 (matches reference thumb).
const BUBBLE = 48;
const MIN_HOURS = 1; // A favor must cost something — no $0/0hr request.
const MAX_HOURS = 24;

// The slider + price bubble + derived labels own their own `hours` state and are
// memoized, so dragging (which fires on every tick) never re-renders the parent
// Negotiate screen or its description TextInput. The committed price is reported
// up via onChange (the parent keeps it in a ref to avoid re-rendering on drag).
const PriceSlider = React.memo(function PriceSlider({
  onChange,
}: {
  onChange: (hours: number, price: number) => void;
}) {
  const [hours, setHours] = useState(2);
  const [trackW, setTrackW] = useState(0);

  const rounded = Math.max(MIN_HOURS, Math.round(hours));
  const price = rounded * HOURLY_RATE;
  const frac = (hours - MIN_HOURS) / (MAX_HOURS - MIN_HOURS);
  const bubbleLeft = frac * Math.max(0, trackW - BUBBLE);

  const handleValue = (v: number) => {
    setHours(v);
    const r = Math.max(MIN_HOURS, Math.round(v));
    onChange(r, r * HOURLY_RATE);
  };

  return (
    <>
      <View
        style={{ height: BUBBLE, justifyContent: 'center', marginTop: tokens.spacing.xxl }}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
      >
        <Slider
          style={{ width: '100%', height: 40 }}
          minimumValue={MIN_HOURS}
          maximumValue={MAX_HOURS}
          step={1}
          value={hours}
          onValueChange={handleValue}
          minimumTrackTintColor={BRAND}
          maximumTrackTintColor="rgba(255,255,255,0.18)"
          thumbTintColor={BRAND}
          accessibilityRole="adjustable"
          accessibilityLabel="Favor duration"
          accessibilityValue={{ text: `${rounded} hours, $${price}` }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: bubbleLeft,
            width: BUBBLE,
            height: BUBBLE,
            borderRadius: BUBBLE / 2,
            backgroundColor: BRAND,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Txt variant="caption" color="#FFFFFF" style={{ fontSize: 12 }}>${price}</Txt>
        </View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: tokens.spacing.sm }}>
        <Txt variant="h6" color={TXT}>{MIN_HOURS}hr</Txt>
        <Txt variant="h6" color={TXT}>{rounded}hrs</Txt>
        <Txt variant="h6" color={TXT}>{MAX_HOURS}hrs</Txt>
      </View>

      <Txt variant="body" color={TXT_2} center style={{ marginTop: tokens.spacing.base }}>
        {rounded}hrs x ${HOURLY_RATE} = ${price}
      </Txt>
    </>
  );
});

export function Negotiate({ navigation }: any) {
  const s = useStore();
  const [desc, setDesc] = useState(s.draftFavor?.description ?? '');
  // Hold the slider's committed price in a ref so drags don't re-render this screen.
  // Matches PriceSlider's initial value (2hrs) so an un-dragged slider reports it.
  const priceRef = useRef({ hours: 2, price: 2 * HOURLY_RATE });

  const handlePrice = useCallback((hours: number, price: number) => {
    priceRef.current = { hours, price };
  }, []);

  const canNext = desc.trim().length > 0;

  const onNext = () => {
    // Description is required and a favor must cost something (>= $MIN_HOURS*rate).
    if (!canNext || priceRef.current.price <= 0) return;
    const { hours, price } = priceRef.current;
    s.setDraft({ tier: 'negotiate', hours, price, description: desc.trim() });
    navigation.navigate('ConfirmAddress');
  };

  return (
    <DarkScreen>
      <DarkTopBar
        title="Negotiate Your Favor"
        onBack={navigation.canGoBack() ? navigation.goBack : undefined}
      />
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: tokens.spacing.lg }} keyboardShouldPersistTaps="handled">
        <Txt variant="h3" color={TXT} style={{ marginTop: 8 }}>What is the favor?</Txt>
        <Txt variant="body" color={TXT_2} style={{ marginTop: tokens.spacing.base }}>
          Use the slider below to calculate your favor price based on the time you need
        </Txt>

        <PriceSlider onChange={handlePrice} />

        <Txt variant="body" color={TXT_2} style={{ marginTop: tokens.spacing.xxl, marginBottom: tokens.spacing.base }}>
          Describe the favor you need.
        </Txt>
        <DescriptionField value={desc} onChangeText={setDesc} />
      </ScrollView>

      <Footer>
        <Button title="NEXT" variant="white" disabled={!canNext} onPress={onNext} />
      </Footer>
    </DarkScreen>
  );
}

// ---------------------------------------------------------------------------
// 4. ConfirmAddress — map + floating location sheet
// ---------------------------------------------------------------------------
const MapMarker: React.FC<{ uri?: string }> = ({ uri }) => (
  <View style={styles.marker}>
    <Avatar uri={uri} size={38} />
  </View>
);

// Lightweight dark "map paper" backdrop (v.2): navy fill, faint street grid, a
// couple of arterials and a translucent red search radius — a web-safe stand-in
// for a real dark map (purely decorative; no logic depends on it).
const DarkMapBg: React.FC = () => (
  <View style={[StyleSheet.absoluteFill, { backgroundColor: MAP_BG }]}>
    {[0.16, 0.34, 0.52, 0.7, 0.88].map((x) => (
      <View key={`v${x}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${x * 100}%`, width: 2, backgroundColor: 'rgba(255,255,255,0.05)' }} />
    ))}
    {[0.12, 0.3, 0.48, 0.66, 0.84].map((y) => (
      <View key={`h${y}`} style={{ position: 'absolute', left: 0, right: 0, top: `${y * 100}%`, height: 2, backgroundColor: 'rgba(255,255,255,0.05)' }} />
    ))}
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: '30%', width: 5, backgroundColor: 'rgba(212,160,90,0.32)' }} />
    <View style={{ position: 'absolute', left: 0, right: 0, top: '46%', height: 5, backgroundColor: 'rgba(212,160,90,0.32)' }} />
  </View>
);

// Honest "When?" options that actually set draft.scheduledFor (requestFavor reads
// it). The clock icon now describes timing instead of the old mislabeled "Where to?".

export function ConfirmAddress({ navigation }: any) {
  const s = useStore();
  // Editable — default from the member's saved home address, fall back to the seed.
  const [address, setAddress] = useState(
    s.draftFavor?.location?.address ?? s.user?.homeAddress ?? '2099 Woodvine Rd, Lorman, MS'
  );
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const pals = s.pals;

  // Recent/saved addresses — the member's home plus distinct addresses from past
  // favors, so they can refill in one tap instead of retyping.
  const recentAddresses = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const home = s.user?.homeAddress?.trim();
    if (home) { seen.add(home); out.push(home); }
    for (const f of s.history) {
      const a = f.location?.address?.trim();
      if (a && !seen.has(a)) { seen.add(a); out.push(a); }
      if (out.length >= 5) break;
    }
    return out;
  })();

  // Parse the typed date + time into a future timestamp (NaN = unset/invalid).
  // Hermes (the on-device JS engine) only reliably parses ISO-8601 with the Date
  // string constructor, so `new Date("06/30/2026 2:30 PM")` returns Invalid Date
  // on a real device. Parse the locale fields explicitly instead.
  const parseSchedule = (d: string, t: string): number => {
    const dm = d.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const tm = t.trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
    if (!dm || !tm) return NaN;
    const mo = Number(dm[1]);
    const day = Number(dm[2]);
    const year = Number(dm[3]);
    let hour = Number(tm[1]);
    const min = Number(tm[2]);
    const isPM = tm[3].toUpperCase() === 'PM';
    // Range-check before constructing — reject out-of-range parts outright.
    if (mo < 1 || mo > 12 || day < 1 || day > 31) return NaN;
    if (hour < 1 || hour > 12 || min > 59) return NaN;
    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
    const dt = new Date(year, mo - 1, day, hour, min);
    // Guard against JS rolling overflow dates forward (e.g. 02/31 -> 03/03).
    if (dt.getMonth() !== mo - 1 || dt.getDate() !== day) return NaN;
    return dt.getTime();
  };
  const scheduleEntered = scheduleMode === 'later' && dateStr.trim() !== '' && timeStr.trim() !== '';
  const parsedSchedule = scheduleMode === 'later' ? parseSchedule(dateStr, timeStr) : NaN;
  // Minimum lead time so a Pal realistically has time to accept and travel — a
  // favor can't be scheduled for one minute from now.
  const MIN_LEAD_MS = 30 * 60 * 1000;
  // Require BOTH fields, a valid parse, and a far-enough-future timestamp.
  const scheduleValid =
    scheduleEntered && Number.isFinite(parsedSchedule) && parsedSchedule > Date.now() + MIN_LEAD_MS;
  const canConfirm = address.trim().length > 0 && (scheduleMode === 'now' || scheduleValid);

  const onConfirm = () => {
    if (!canConfirm) return;
    const scheduledFor = scheduleMode === 'later' && scheduleValid ? parsedSchedule : undefined;
    s.setDraft({
      location: { lat: 31.8069, lng: -91.0593, address: address.trim() },
      scheduledFor,
    });
    navigation.navigate('FavorSummary');
  };

  return (
    <DarkScreen>
      <View style={{ flex: 1, backgroundColor: MAP_BG }}>
        <DarkMapBg />

        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* translucent red search radius around the favor pin */}
          <View style={styles.radius} />
          <View style={{ position: 'absolute', top: '42%', left: '44%' }}>
            <Ionicons name="location" size={42} color={BRAND} />
          </View>
          <View style={{ position: 'absolute', top: '54%', left: '18%' }}>
            <MapMarker uri={pals[0]?.avatar} />
          </View>
          <View style={{ position: 'absolute', top: '60%', left: '64%' }}>
            <MapMarker uri={pals[1]?.avatar} />
          </View>
          <View style={{ position: 'absolute', top: '70%', left: '40%' }}>
            <MapMarker uri={pals[2]?.avatar} />
          </View>
        </View>

        {/* Scrollable so the schedule inputs + Confirm button stay reachable when
            the keyboard is up (the card floats at top:16, so padding-based KAV
            can't lift it). bottom:0 gives the ScrollView a bounded, scrollable
            height; keyboardShouldPersistTaps lets a single tap hit chips/fields. */}
        <ScrollView
          style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 0 }}
          contentContainerStyle={{ paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.addressCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt variant="label" color={TXT}>Location of your favor</Txt>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color={TXT_2} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: tokens.spacing.md }}>
              <Ionicons name="location" size={18} color={BRAND} />
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="Enter the favor address"
                placeholderTextColor={TXT_3}
                style={[tokens.typography.body, { flex: 1, marginLeft: 8, color: TXT, paddingVertical: 0 }]}
                returnKeyType="done"
                accessibilityLabel="Favor address"
              />
            </View>

            {recentAddresses.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {recentAddresses.map((a, i) => (
                  <TouchableOpacity
                    key={a}
                    onPress={() => setAddress(a)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Use address ${a}`}
                    style={{
                      backgroundColor: RAISED, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
                      borderWidth: 1, borderColor: BORDER,
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                    }}
                  >
                    <Ionicons name={i === 0 && a === s.user?.homeAddress ? 'home-outline' : 'time-outline'} size={13} color={TXT_2} />
                    <Txt variant="caption" color={TXT} numberOfLines={1} style={{ maxWidth: 180 }}>{a}</Txt>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <View
              style={{
                marginTop: tokens.spacing.md,
                paddingTop: tokens.spacing.md,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: BORDER,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="time-outline" size={18} color={TXT_2} />
                  <Txt variant="bodySm" color={TXT_2} style={{ marginLeft: 8 }}>When?</Txt>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {(['now', 'later'] as const).map((m) => {
                    const on = scheduleMode === m;
                    return (
                      <TouchableOpacity
                        key={m}
                        onPress={() => setScheduleMode(m)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={{
                          backgroundColor: on ? BRAND : RAISED,
                          paddingHorizontal: 16, paddingVertical: 7, borderRadius: tokens.radius.pill,
                        }}
                      >
                        <Txt variant="label" color={on ? '#FFFFFF' : TXT_2}>
                          {m === 'now' ? 'Now' : 'Schedule'}
                        </Txt>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {scheduleMode === 'later' ? (
                <>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <TextInput
                      value={dateStr}
                      onChangeText={setDateStr}
                      placeholder="MM/DD/YYYY"
                      placeholderTextColor={TXT_3}
                      style={[tokens.typography.body, { flex: 1, backgroundColor: RAISED, color: TXT, borderRadius: tokens.radius.md, paddingHorizontal: 14, paddingVertical: 12 }]}
                      accessibilityLabel="Favor date"
                    />
                    <TextInput
                      value={timeStr}
                      onChangeText={setTimeStr}
                      placeholder="2:30 PM"
                      placeholderTextColor={TXT_3}
                      style={[tokens.typography.body, { flex: 1, backgroundColor: RAISED, color: TXT, borderRadius: tokens.radius.md, paddingHorizontal: 14, paddingVertical: 12 }]}
                      accessibilityLabel="Favor time"
                    />
                  </View>
                  {!scheduleValid ? (
                    <Txt
                      variant="caption"
                      color={scheduleEntered ? BRAND : TXT_2}
                      style={{ marginTop: 6 }}
                    >
                      {scheduleEntered
                        ? 'Pick a valid date and time at least 30 minutes from now (e.g. 06/30/2026 and 2:30 PM).'
                        : 'Enter a date (MM/DD/YYYY) and time (e.g. 2:30 PM) at least 30 minutes out.'}
                    </Txt>
                  ) : null}
                </>
              ) : null}
            </View>

            <View style={{ marginTop: tokens.spacing.base }}>
              <Button title="Confirm Address" variant="white" uppercase={false} disabled={!canConfirm} onPress={onConfirm} />
            </View>
          </View>
        </ScrollView>
      </View>
    </DarkScreen>
  );
}

const styles = StyleSheet.create({
  topbar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    backgroundColor: SCREEN_BG,
  },
  footer: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    paddingBottom: tokens.spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    backgroundColor: SCREEN_BG,
  },
  tierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: tokens.spacing.base,
    backgroundColor: SHEET,
    borderRadius: tokens.radius.lg,
    ...tokens.shadow.card,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: tokens.radius.sm,
    backgroundColor: THUMB_BG,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  selectPill: {
    height: 27,
    paddingHorizontal: 14,
    borderRadius: 13.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  descInput: {
    backgroundColor: RAISED,
    color: TXT,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 120,
  },
  addTile: {
    width: 110,
    height: 110,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: tokens.spacing.base,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: BORDER,
    backgroundColor: RAISED,
    overflow: 'hidden',
  },
  addressCard: {
    backgroundColor: SHEET,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.base,
    borderWidth: 1,
    borderColor: BORDER,
    ...tokens.shadow.card,
  },
  radius: {
    position: 'absolute',
    top: '34%',
    left: '28%',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(237,28,36,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(237,28,36,0.32)',
  },
  marker: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 21,
    ...tokens.shadow.card,
  },
});
