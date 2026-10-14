import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, Image, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, useWindowDimensions, Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { useFonts, Poppins_400Regular, Poppins_400Regular_Italic } from '@expo-google-fonts/poppins';
import { useStore } from '../store';
import { FAVOR_TIERS } from '../types';
import { geocodeAddress, GEOCODE_FALLBACK } from '../lib/geocode';
import { getCurrentLocation } from '../lib/location';
import { suggestAddressesApi, resolvePlaceApi, reverseGeocodeApi, AddressSuggestion } from '../api/endpoints';
import { MapPicker } from '../components/MapPicker';

// ---------------------------------------------------------------------------
// Request flow — rebuilt to the v.2 Figma frames (light theme):
//   Favor Cost #100:12594 / Favor Cost - Selected #100:12661  -> SelectFavor
//   Favor Description #125:10981                              -> FavorDescription
//   Favor Description - Negotiate #130:10114                  -> Negotiate
//   Confirm Address #125:11243                                -> ConfirmAddress
//   Reblast #149:9998                                         -> Reblast
// All colours / copy / spacing below are read from the node data.
// ---------------------------------------------------------------------------
const INK = '#0D0A0A';         // headings, buttons, pills
const SUB = '#484747';         // secondary text
const FIELD = '#EEEEEE';       // input fills / dividers
const HAIRLINE = '#D7D7D7';    // topbar divider
const PLACEHOLDER = '#9E9E9E'; // textbox placeholder
const RED = '#D40000';         // map pins / request tab accent
const STAR = '#FFBD00';        // rating star
const MAP_BASE = '#D8D8D8';    // map backdrop under the bitmap
const WHITE = '#FFFFFF';

// Poppins Regular / Italic are not loaded app-wide (App.tsx only loads 500/600/700),
// so the flow loads them itself; expo caches globally so this resolves instantly
// after the first mount. Screens render a white flash-guard until ready.
function usePoppinsRegular() {
  const [loaded] = useFonts({ Poppins_400Regular, Poppins_400Regular_Italic });
  return loaded;
}

type TierKey = keyof typeof FAVOR_TIERS; // 'tiny' | 'small' | 'big' | 'huge'

// Tier illustrations exported from Figma (node 100:12594). Each sits inside a
// 75x75 mask (radius 5) slightly oversized/offset exactly like the frame.
// Exported: the Dashboard Main v2 home screen (1660:15783) renders the same
// illustrations in its tier tiles.
export const TIERS: Record<TierKey, { img: any; w: number; h: number; dx: number; dy: number }> = {
  tiny: { img: require('../../assets/img/request/tier-tiny.png'), w: 94, h: 94, dx: -9, dy: -10 },
  small: { img: require('../../assets/img/request/tier-small.png'), w: 94, h: 94, dx: -9, dy: -10 },
  big: { img: require('../../assets/img/request/tier-big.png'), w: 78, h: 78, dx: -1, dy: -1 },
  huge: { img: require('../../assets/img/request/tier-huge.png'), w: 79, h: 79, dx: -2, dy: -2 },
};

const MAP_IMG = require('../../assets/img/request/map-light.png');
const PIN_AVATAR = require('../../assets/img/request/pin-avatar.png');
const PAL_PHOTO = require('../../assets/img/request/pal-photo.png');

// ---------------------------------------------------------------------------
// Shared chrome (local — the shared TopBar/Button use a different design language)
// ---------------------------------------------------------------------------
const LightScreen: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <SafeAreaView style={{ flex: 1, backgroundColor: WHITE }} edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {children}
    </KeyboardAvoidingView>
  </SafeAreaView>
);

// 64-tall white topbar: back arrow at x16, Poppins Medium 18 centered title,
// 1px #D7D7D7 hairline (per topbar component 100:7524).
const TopBar: React.FC<{ title: string; onBack?: () => void }> = ({ title, onBack }) => (
  <View style={styles.topbar}>
    <Text style={styles.topbarTitle}>{title}</Text>
    {onBack ? (
      <TouchableOpacity
        onPress={onBack}
        hitSlop={12}
        style={styles.topbarBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="arrow-back" size={24} color={INK} />
      </TouchableOpacity>
    ) : null}
  </View>
);

// btn/solid/2/black (100:7437): 48 tall, #0D0A0A, radius 8, Poppins Medium 16
// white UPPERCASE. Disabled state = 25% opacity (Favor Cost frame).
const BlackButton: React.FC<{
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: any;
}> = ({ title, onPress, disabled, style }) => (
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={disabled ? undefined : onPress}
    disabled={disabled}
    style={[styles.blackBtn, disabled && { opacity: 0.25 }, style]}
    accessibilityRole="button"
    accessibilityState={{ disabled: !!disabled }}
  >
    <Text style={styles.blackBtnText}>{title.toUpperCase()}</Text>
  </TouchableOpacity>
);

// Footer wrapper: button x23/y798 of the 896 frame => 23px sides, 16px above
// the home-indicator zone. No divider line in the v.2 frames.
const Footer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={{ paddingHorizontal: 23, paddingTop: 12, paddingBottom: 16, backgroundColor: WHITE }}>
    {children}
  </View>
);

// 75x75 tier illustration in a radius-5 mask, image oversized per the frame crop.
const TierThumb: React.FC<{ tier: TierKey; shadow?: boolean }> = ({ tier, shadow }) => {
  const t = TIERS[tier];
  return (
    <View style={[styles.tierThumb, shadow && styles.thumbShadow]}>
      <Image
        source={t.img}
        style={{ position: 'absolute', left: t.dx, top: t.dy, width: t.w, height: t.h, opacity: 0.9 }}
        resizeMode="stretch"
      />
    </View>
  );
};

// SELECT / SELECTED pill (73/78 x 27, #0D0A0A, radius 13.5, Poppins 12 white)
const SelectPill: React.FC<{ selected: boolean }> = ({ selected }) => (
  <View style={[styles.selectPill, { width: selected ? 78 : 73 }]}>
    <Text style={styles.selectPillText}>{selected ? 'SELECTED' : 'SELECT'}</Text>
  </View>
);

// ---------------------------------------------------------------------------
// 1. SelectFavor — "Favor Cost" #100:12594 / "Favor Cost - Selected" #100:12661
// ---------------------------------------------------------------------------
const TierCard: React.FC<{
  tier: TierKey;
  selected: boolean;
  dimmed: boolean;
  onPress: () => void;
}> = ({ tier, selected, dimmed, onPress }) => (
  <TouchableOpacity
    activeOpacity={0.9}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    // Non-selected cards drop to 50% opacity once a tier is chosen (frame 100:12661)
    style={[styles.tierCard, dimmed && { opacity: 0.5 }]}
  >
    <TierThumb tier={tier} />
    <View style={{ marginLeft: 24, flex: 1 }}>
      <Text style={styles.tierTitle}>{FAVOR_TIERS[tier].label}</Text>
      <Text style={styles.tierPrice}>${FAVOR_TIERS[tier].price.toFixed(2)}</Text>
    </View>
    <SelectPill selected={selected} />
  </TouchableOpacity>
);

export function SelectFavor({ navigation }: any) {
  const s = useStore();
  const fontsLoaded = usePoppinsRegular();
  const [selected, setSelected] = useState<TierKey | null>(null);

  const tierKeys: TierKey[] = ['tiny', 'small', 'big', 'huge'];

  const onNext = () => {
    if (!selected) return;
    s.setDraft({ tier: selected, price: FAVOR_TIERS[selected].price });
    navigation.navigate('FavorDescription');
  };

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: WHITE }} />;

  return (
    <LightScreen>
      <TopBar title="Select Favor" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.h1, { marginTop: 40 }]}>How big is the favor?</Text>
        <Text style={[styles.leadText, { marginTop: 16 }]}>
          Choose the cost of favor based on the amount of effort required.
        </Text>

        <View style={{ marginTop: 40 }}>
          {tierKeys.map((key) => (
            <TierCard
              key={key}
              tier={key}
              selected={selected === key}
              dimmed={selected !== null && selected !== key}
              onPress={() => setSelected(key)}
            />
          ))}
        </View>
      </ScrollView>

      <Footer>
        <BlackButton title="next" disabled={!selected} onPress={onNext} />
      </Footer>
    </LightScreen>
  );
}

// ---------------------------------------------------------------------------
// Shared description block ("Describe the favor you need." + 160-tall #EEEEEE
// textbox + "250 characters max.") — identical in frames 125:10981 & 130:10114.
// ---------------------------------------------------------------------------
const DESC_PLACEHOLDER =
  'Provide as much detail as possible about your favor!  Let your provider know about what they will be doing, what they will need to bring, special requirements, etc.';
const DESC_MAX = 250;

// Memoized so parent re-renders (e.g. slider drags) never re-render the TextInput.
const DescriptionBlock = React.memo(function DescriptionBlock({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (t: string) => void;
}) {
  return (
    <>
      <Text style={styles.descLabel}>Describe the favor you need.</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={DESC_PLACEHOLDER}
        placeholderTextColor={PLACEHOLDER}
        multiline
        maxLength={DESC_MAX}
        textAlignVertical="top"
        style={styles.descInput}
        accessibilityLabel="Favor description"
      />
      <Text style={styles.descMax}>250 characters max.</Text>
    </>
  );
});

// ---------------------------------------------------------------------------
// 2. FavorDescription — "Favor Description" #125:10981
// ---------------------------------------------------------------------------
export function FavorDescription({ navigation }: any) {
  const s = useStore();
  const fontsLoaded = usePoppinsRegular();
  const [desc, setDesc] = useState(s.draftFavor?.description ?? '');

  const draftTier = s.draftFavor?.tier;
  const tierKey: TierKey | null = draftTier && draftTier in TIERS ? (draftTier as TierKey) : null;
  const tierShort = tierKey ? FAVOR_TIERS[tierKey].label.replace(' Favor', '') : 'Custom';
  const price = s.draftFavor?.price ?? (tierKey ? FAVOR_TIERS[tierKey].price : 0);

  const canNext = desc.trim().length > 0;
  const onNext = () => {
    if (!canNext) return;
    s.setDraft({ description: desc.trim() });
    navigation.navigate('ConfirmAddress');
  };

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: WHITE }} />;

  return (
    <LightScreen>
      <TopBar title="Favor Description" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 21, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {/* Selected tier summary: 75px thumb, tier + price, SELECTED pill (row @ y144) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 33 }}>
          {tierKey ? <TierThumb tier={tierKey} shadow /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginLeft: 24 }}>
            <View>
              <Text style={styles.tierTitle}>{tierShort}</Text>
              <Text style={styles.tierTitle}>${price}</Text>
            </View>
            <View style={{ marginLeft: 12 }}>
              <SelectPill selected />
            </View>
          </View>
        </View>

        <Text style={[styles.h1, { marginTop: 32 }]}>What is the favor?</Text>

        <View style={{ marginTop: 12 }}>
          <DescriptionBlock value={desc} onChangeText={setDesc} />
        </View>
      </ScrollView>

      <Footer>
        <BlackButton title="next" disabled={!canNext} onPress={onNext} />
      </Footer>
    </LightScreen>
  );
}

// ---------------------------------------------------------------------------
// 3. Negotiate — "Favor Description - Negotiate" #130:10114
//    Track: 10px, radius 34, active #0D0A0A / inactive white w/ 1px ink border.
//    Thumb: 37px ink circle with the $ price inside. Labels: 0 / {n}hrs / 24hrs.
// ---------------------------------------------------------------------------
const HOURLY_RATE = 100; // 2hrs => $200 in the frame
const THUMB = 37;
const MAX_HOURS = 24;

const PriceSlider = React.memo(function PriceSlider({
  onChange,
}: {
  onChange: (hours: number, price: number) => void;
}) {
  const [hours, setHours] = useState(2);
  const [trackW, setTrackW] = useState(0);

  const price = hours * HOURLY_RATE;
  const frac = hours / MAX_HOURS;
  const thumbLeft = frac * Math.max(0, trackW - THUMB);

  const handleValue = (v: number) => {
    const r = Math.round(v);
    setHours(r);
    onChange(r, r * HOURLY_RATE);
  };

  return (
    <View style={{ marginTop: 40 }}>
      <View
        style={{ height: THUMB, justifyContent: 'center' }}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
      >
        {/* custom track (white w/ ink border; ink fill up to the thumb) */}
        <View style={styles.trackBase} />
        <View style={[styles.trackFill, { width: thumbLeft + THUMB / 2 }]} />
        <Slider
          style={{ width: '100%', height: THUMB, position: 'absolute' }}
          // A favor must cost something, so 1hr ($100) is the floor — this makes
          // $0 unreachable and the onNext price guard can never dead-end the NEXT
          // button (which can't dim on price since price lives in a ref).
          minimumValue={1}
          maximumValue={MAX_HOURS}
          step={1}
          value={hours}
          onValueChange={handleValue}
          minimumTrackTintColor="transparent"
          maximumTrackTintColor="transparent"
          thumbTintColor="transparent"
          accessibilityRole="adjustable"
          accessibilityLabel="Favor duration"
          accessibilityValue={{ text: `${hours} hours, $${price}` }}
        />
        {/* $ thumb bubble */}
        <View pointerEvents="none" style={[styles.sliderThumb, { left: thumbLeft }]}>
          <Text style={styles.sliderThumbText}>${price}</Text>
        </View>
      </View>

      <View style={{ height: 28, marginTop: 5 }}>
        <Text style={styles.sliderLabel}>0</Text>
        <Text
          style={[
            styles.sliderLabel,
            {
              position: 'absolute',
              left: thumbLeft + THUMB / 2 - 30,
              width: 60,
              textAlign: 'center',
            },
          ]}
        >
          {hours}hrs
        </Text>
        <Text style={[styles.sliderLabel, { position: 'absolute', right: 0 }]}>24hrs</Text>
      </View>
    </View>
  );
});

export function Negotiate({ navigation }: any) {
  const s = useStore();
  const fontsLoaded = usePoppinsRegular();
  const [desc, setDesc] = useState(s.draftFavor?.description ?? '');
  // Committed slider value lives in a ref so drags never re-render this screen.
  const priceRef = useRef({ hours: 2, price: 2 * HOURLY_RATE });
  const handlePrice = useCallback((hours: number, price: number) => {
    priceRef.current = { hours, price };
  }, []);

  const canNext = desc.trim().length > 0;
  const onNext = () => {
    // A favor must cost something — block $0 (slider at 0hrs).
    if (!canNext || priceRef.current.price <= 0) return;
    const { hours, price } = priceRef.current;
    s.setDraft({ tier: 'negotiate', hours, price, description: desc.trim() });
    navigation.navigate('ConfirmAddress');
  };

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: WHITE }} />;

  return (
    <LightScreen>
      <TopBar title="Negotiate Your Favor" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.h1, { marginTop: 40 }]}>What is the favor?</Text>
        <Text style={[styles.leadText, { marginTop: 16 }]}>
          Use the slider below to calculate your favor price based on the time you need
        </Text>

        <PriceSlider onChange={handlePrice} />

        <View style={{ marginTop: 35 }}>
          <DescriptionBlock value={desc} onChangeText={setDesc} />
        </View>
      </ScrollView>

      <Footer>
        <BlackButton title="next" disabled={!canNext} onPress={onNext} />
      </Footer>
    </LightScreen>
  );
}

// ---------------------------------------------------------------------------
// Shared map backdrop (Confirm Address #125:11243 / Reblast #149:9998):
// light map bitmap positioned exactly like the frame (1605.79x1038 @ -861,-142
// of a 414x896 viewport), 4 red pals pins, radial vignette, red user pin.
// ---------------------------------------------------------------------------
const PIN_SPOTS = [
  { x: 84, y: 179 },
  { x: 350, y: 667 },
  { x: 44, y: 549 },
  { x: 322, y: 131 },
];

// favor-pal-map-icon (100:8280) — red 40x48 pin, drawn in code (SVG export is
// blocked by the Figma render quota): red disc + white person + pointer tail.
const MapPin: React.FC = () => (
  <View style={{ width: 40, height: 48, alignItems: 'center' }}>
    <View style={styles.pinDisc}>
      <Ionicons name="person" size={20} color={WHITE} />
    </View>
    <View style={styles.pinTail} />
  </View>
);

const MapBackdrop: React.FC<{ userAvatar?: string }> = ({ userAvatar }) => {
  const { width } = useWindowDimensions();
  const k = width / 414; // frame-space scale
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: MAP_BASE, overflow: 'hidden' }]}>
      <Image
        source={MAP_IMG}
        resizeMode="stretch"
        style={{ position: 'absolute', left: -861 * k, top: -142 * k, width: 1605.79 * k, height: 1038 * k }}
      />
      {PIN_SPOTS.map((p, i) => (
        <View key={i} style={{ position: 'absolute', left: `${(p.x / 414) * 100}%`, top: `${(p.y / 896) * 100}%` }}>
          <MapPin />
        </View>
      ))}
      {/* 240px radial vignette around the user pin (Oval 125:11258) */}
      <Svg
        pointerEvents="none"
        width={240 * k}
        height={240 * k}
        style={{ position: 'absolute', left: 87 * k, top: '36.6%' }}
      >
        <Defs>
          <RadialGradient id="vignette" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#000000" stopOpacity="0" />
            <Stop offset="1" stopColor="#000000" stopOpacity="0.45" />
          </RadialGradient>
        </Defs>
        <Circle cx={120 * k} cy={120 * k} r={120 * k} fill="url(#vignette)" />
      </Svg>
      {/* user-pin (100:8288): 40px red ring + 32px avatar */}
      <View style={[styles.userPin, { left: 187 * k, top: '47.8%' }]}>
        <Image
          source={userAvatar ? { uri: userAvatar } : PIN_AVATAR}
          style={{ width: 32, height: 32, borderRadius: 16 }}
        />
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// 4. ConfirmAddress — "Confirm Address" #125:11243
//    White top panel (label + address field + CONFIRM ADDRESS) over the map,
//    HOME / REQUEST A FAVOR tab bar at the bottom.
//
//    Native: the backdrop is a REAL pannable map (MapPicker, Apple Maps on
//    iOS) with a fixed center pin — drag the map and the address field updates
//    via reverse geocoding. Typing shows live suggestions from the server's
//    /api/geo proxy; picking one glides the map there. Web keeps the Figma
//    static backdrop (MapBackdrop) and the type-then-confirm flow.
// ---------------------------------------------------------------------------
export function ConfirmAddress({ navigation }: any) {
  const s = useStore();
  const fontsLoaded = usePoppinsRegular();
  const insets = useSafeAreaInsets();
  const [address, setAddress] = useState(
    s.draftFavor?.location?.address ?? s.user?.homeAddress ?? ''
  );
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  // Coordinates that match the CURRENT address text (from a picked suggestion
  // or a map pan). Typing clears them — Confirm then forward-geocodes the text.
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(
    s.draftFavor?.location ? { lat: s.draftFavor.location.lat, lng: s.draftFavor.location.lng } : null
  );
  // Where the map sits. Only ever moves forward (pick/pan) — never snaps back.
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>(
    s.draftFavor?.location
      ? { lat: s.draftFavor.location.lat, lng: s.draftFavor.location.lng }
      : { ...GEOCODE_FALLBACK }
  );

  // One epoch guards ALL background lookups (suggest / resolve / reverse): any
  // newer user action — typing, picking a suggestion, panning the map — bumps
  // it, and a response only applies if the epoch it was born under is still
  // current. This is what keeps a slow response (cold Render dyno + Google
  // round trip) from clobbering text the user has since changed, re-opening a
  // dismissed dropdown, or attaching stale coordinates to new text.
  const geoEpoch = useRef(0);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True from a pan settling until its address label lands (or fails) — the
  // Confirm button is held in 'Locating…' so the member can't save fresh
  // coordinates paired with the previous location's text.
  const [reversePending, setReversePending] = useState(false);

  const supersedeLookups = useCallback(() => {
    geoEpoch.current += 1;
    if (suggestTimer.current) {
      clearTimeout(suggestTimer.current);
      suggestTimer.current = null;
    }
    if (reverseTimer.current) {
      clearTimeout(reverseTimer.current);
      reverseTimer.current = null;
    }
    setReversePending(false);
  }, []);
  useEffect(() => () => supersedeLookups(), [supersedeLookups]); // unmount: drop everything in flight

  const onChangeAddress = useCallback((t: string) => {
    supersedeLookups();
    setAddress(t);
    setCoord(null); // edited text no longer matches any picked/panned point
    const q = t.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    const epoch = geoEpoch.current;
    suggestTimer.current = setTimeout(async () => {
      try {
        const { suggestions: list } = await suggestAddressesApi(q);
        if (epoch === geoEpoch.current) setSuggestions(list);
      } catch {
        // Suggestions are best-effort — typing + Confirm keeps working.
      }
    }, 350);
  }, [supersedeLookups]);

  const pickSuggestion = useCallback(async (sug: AddressSuggestion) => {
    supersedeLookups();
    const epoch = geoEpoch.current;
    setSuggestions([]);
    setAddress(sug.description);
    Keyboard.dismiss();
    try {
      const { location } = await resolvePlaceApi(sug.id);
      if (epoch !== geoEpoch.current || !location) return; // superseded / unresolvable
      const c = { lat: location.lat, lng: location.lng };
      setCoord(c);
      setMapCenter(c); // MapPicker glides there
    } catch {
      // Keep the description text; Confirm will forward-geocode it.
    }
  }, [supersedeLookups]);

  // A map pan settled (native only). The panned point is the source of truth;
  // the reverse-geocoded label is display-only — but Confirm is gated until it
  // lands so the saved address text always describes the pinned coordinates.
  const onCenterChange = useCallback((c: { lat: number; lng: number }) => {
    supersedeLookups();
    const epoch = geoEpoch.current;
    setCoord(c);
    setMapCenter(c); // keep the prop in sync so a later same-coords pick still glides
    setSuggestions([]);
    setReversePending(true);
    reverseTimer.current = setTimeout(async () => {
      let label: string | null = null;
      try {
        const { location } = await reverseGeocodeApi(c.lat, c.lng);
        label = location?.address ?? null;
      } catch {
        label = null;
      }
      if (epoch !== geoEpoch.current) return; // a newer action took over
      // No nameable address for this point (rural pin, lookup failure): show
      // honest coordinates rather than leaving the previous location's text.
      setAddress(label ?? `Pinned location (${c.lat.toFixed(5)}, ${c.lng.toFixed(5)})`);
      setReversePending(false);
    }, 400);
  }, [supersedeLookups]);

  // First open with no saved draft location: center the picker on the device's
  // real position (asks for foreground location permission — the contextual
  // moment to ask). Runs through onCenterChange so the map glides there and
  // the member's actual street address fills the field. Denied / unavailable /
  // web → silently keep the prefill + fallback center; typing still works.
  const triedGps = useRef(false);
  useEffect(() => {
    if (triedGps.current || Platform.OS === 'web' || s.draftFavor?.location) return;
    triedGps.current = true;
    let cancelled = false;
    void getCurrentLocation().then((c) => {
      if (c && !cancelled) onCenterChange(c);
    });
    return () => {
      cancelled = true;
    };
  }, [onCenterChange, s.draftFavor?.location]);

  const canConfirm = address.trim().length > 0 && !reversePending;
  const onConfirm = useCallback(async () => {
    if (!canConfirm || geocoding) return;
    setGeocoding(true);
    const trimmed = address.trim();
    // A picked suggestion / panned pin already carries exact coordinates; only
    // free-typed text needs the server geocode (which falls back to the demo
    // point if the server has no key).
    const { lat, lng } = coord ?? (await geocodeAddress(trimmed));
    s.setDraft({ location: { lat, lng, address: trimmed } });
    setGeocoding(false);
    navigation.navigate('FavorSummary');
  }, [address, canConfirm, coord, geocoding, navigation, s]);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: WHITE }} />;

  return (
    <View style={{ flex: 1, backgroundColor: WHITE }}>
      {Platform.OS === 'web' ? (
        <MapBackdrop userAvatar={s.user?.avatar} />
      ) : (
        <MapPicker center={mapCenter} onCenterChange={onCenterChange} pinAvatar={s.user?.avatar} />
      )}

      {/* Top address panel */}
      <View style={[styles.addressPanel, { paddingTop: insets.top + 8 }]}>
        {navigation.canGoBack() ? (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4, marginLeft: -6 }}
          >
            <Ionicons name="chevron-back" size={24} color={INK} />
          </TouchableOpacity>
        ) : null}
        <Text style={styles.panelLabel}>Location of your favor</Text>
        <View style={styles.addressField}>
          <Ionicons name="locate" size={20} color={RED} style={{ marginLeft: 16 }} />
          <TextInput
            value={address}
            onChangeText={onChangeAddress}
            placeholder="Enter the favor address"
            placeholderTextColor={PLACEHOLDER}
            numberOfLines={1}
            style={styles.addressInput}
            returnKeyType="done"
            accessibilityLabel="Favor address"
          />
          <TouchableOpacity
            onPress={() => onChangeAddress('')}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Clear address"
            style={{ marginRight: 16 }}
          >
            <Ionicons name="close" size={18} color={INK} />
          </TouchableOpacity>
        </View>
        {suggestions.length > 0 ? (
          <View style={styles.suggestBox}>
            {suggestions.map((sug, i) => (
              <TouchableOpacity
                key={sug.id}
                style={[styles.suggestRow, i > 0 && styles.suggestDivider]}
                onPress={() => void pickSuggestion(sug)}
                accessibilityRole="button"
                accessibilityLabel={`Use address ${sug.description}`}
              >
                <Ionicons name="location-outline" size={16} color={RED} />
                <Text style={styles.suggestText} numberOfLines={1}>{sug.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        <BlackButton title={geocoding || reversePending ? 'Locating…' : 'Confirm Address'} disabled={!canConfirm || geocoding} onPress={() => void onConfirm()} style={{ marginTop: 16 }} />
      </View>

      {/* Bottom tab bar (HOME / REQUEST A FAVOR) exactly as the frame */}
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => navigation.navigate('Tabs')}
            accessibilityRole="button"
            accessibilityLabel="Home"
          >
            <Ionicons name="home" size={24} color={WHITE} />
            <Text style={styles.tabLabelHome}>HOME</Text>
          </TouchableOpacity>
          {/* Current-screen indicator (decorative per the frame) — not a button. */}
          <View style={styles.tabItem} accessibilityRole="text" accessibilityLabel="Request a favor, current screen">
            <Text style={styles.tabRequestF}>F</Text>
            <Text style={styles.tabLabelRequest}>REQUEST A FAVOR</Text>
          </View>
        </View>
        {/* white home-indicator line, part of the frame's bar */}
        <View style={styles.tabIndicator} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 5. Reblast — "Reblast" #149:9998
//    Map + pal sheet (Fabrizio card / How I can help? / BOOK NOW) dimmed under
//    a scrim, with the "We are still looking for a Favor Pal near you" modal.
// ---------------------------------------------------------------------------
export function Reblast({ navigation }: any) {
  const s = useStore();
  const fontsLoaded = usePoppinsRegular();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pal = s.pals?.[0]; // Fabrizio L. — matches the frame's copy

  const onCancel = () => {
    // Give up on the reblast: cancel the outstanding request and go home.
    s.cancelFavor();
    navigation.navigate('Tabs');
  };

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: WHITE }} />;

  return (
    <View style={{ flex: 1, backgroundColor: WHITE }}>
      <MapBackdrop userAvatar={s.user?.avatar} />

      {/* Map chrome behind the scrim: menu button + "Switch to be a favor pal" */}
      <View style={[styles.mapMenuBtn, { top: insets.top + 14 }]}>
        <Ionicons name="menu" size={22} color={INK} />
      </View>
      <View style={[styles.switchPill, { top: insets.top + 14 }]}>
        <Text style={styles.switchPillText}>Switch to be a favor pal</Text>
        <View style={styles.switchTrack}>
          <View style={styles.switchKnob} />
        </View>
      </View>

      {/* Found-pal bottom sheet (under the scrim) */}
      <View style={[styles.palSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.sheetHandle} />

        <View style={{ paddingHorizontal: 24 }}>
          <View style={{ flexDirection: 'row', marginTop: 24 }}>
            <Image source={pal?.avatar ? { uri: pal.avatar } : PAL_PHOTO} style={styles.palPhoto} />
            <View style={{ flex: 1, marginLeft: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.tierTitle, { flex: 1 }]}>
                  {pal ? `${pal.firstName} ${pal.lastName}` : 'Fabrizio L.'}
                </Text>
                <Ionicons name="star" size={24} color={STAR} />
                <Text style={[styles.tierTitle, { marginLeft: 8 }]}>{pal?.rating ?? 4.9}</Text>
              </View>
              <Text style={[styles.smallSub, { marginTop: 8 }]}>3 Miles away</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                <Ionicons name="medal-outline" size={24} color={INK} />
                <Text style={[styles.smallSub, { marginLeft: 8 }]}>{pal?.reliability ?? 92}% Reliable</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
                <Ionicons name="medal-outline" size={24} color={INK} />
                <Text style={[styles.smallSub, { marginLeft: 8 }]}>
                  {pal?.positiveReviews ?? 100}% Positive Reviews
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.sheetDivider} />

          <Text style={styles.helpHeading}>How I can help?</Text>
          <Text style={styles.helpBody}>
            Experienced with repairing doors , closets, fixing electronics, cabinets & pictures.  Professional &
            congenial inventor, designer and part-time tinkerer, a lifetime of experience of assembling and
            disassembling with own tools.
          </Text>
          <Text style={styles.helpQuote}>
            {'“Fabrizio did a terrific job repairing a broken doorknob. Our condo association will definitely hire him in the future whenever repairs are needed!”\n– Karen U., 15 March 2021'}
          </Text>
        </View>

        <View style={{ paddingHorizontal: 23, marginTop: 32 }}>
          {/* Static under the scrim in this state, exactly like the frame */}
          <View style={styles.blackBtn}>
            <Text style={styles.blackBtnText}>BOOK NOW</Text>
          </View>
        </View>
      </View>

      {/* Scrim + "still looking" modal */}
      <View style={styles.scrim} />
      <View style={styles.modalWrap} pointerEvents="box-none">
        <View style={[styles.modalCard, { width: Math.min(351, width - 64) }]}>
          <Text style={styles.modalTitle}>{'We are still looking for\na Favor Pal near you'}</Text>
          <Text style={styles.modalSub}>Taking too long?</Text>
          <BlackButton title="Cancel Favor" onPress={onCancel} style={{ marginTop: 14, marginHorizontal: 24 }} />
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles — values lifted from the Figma node data
// ---------------------------------------------------------------------------
const cardShadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.25,
  shadowRadius: 16,
  elevation: 8,
};

const styles = StyleSheet.create({
  topbar: {
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: HAIRLINE,
  },
  topbarBack: {
    position: 'absolute',
    left: 16,
    height: 64,
    justifyContent: 'center',
  },
  topbarTitle: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 18,
    lineHeight: 27,
    color: INK,
    textAlign: 'center',
  },
  h1: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 24,
    lineHeight: 36,
    color: INK,
  },
  leadText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 16,
    lineHeight: 24,
    color: INK,
  },
  blackBtn: {
    height: 48,
    borderRadius: 8,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blackBtnText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 16,
    color: WHITE,
  },
  // tier cards (368x107, white, radius 8, 0 8 16 25% shadow)
  tierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 107,
    paddingHorizontal: 16,
    marginBottom: 8,
    backgroundColor: WHITE,
    borderRadius: 8,
    ...cardShadow,
  },
  tierThumb: {
    width: 75,
    height: 75,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: FIELD,
  },
  thumbShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  tierTitle: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 18,
    lineHeight: 27,
    color: INK,
  },
  tierPrice: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    lineHeight: 18,
    color: SUB,
    marginTop: 8,
  },
  selectPill: {
    height: 27,
    borderRadius: 13.5,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectPillText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    lineHeight: 18,
    color: WHITE,
  },
  // description block
  descLabel: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 16,
    color: INK,
  },
  descInput: {
    marginTop: 15,
    height: 160,
    backgroundColor: FIELD,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: 'Poppins_400Regular',
    fontSize: 18,
    lineHeight: 27,
    color: INK,
  },
  descMax: {
    marginTop: 16,
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    lineHeight: 18,
    color: SUB,
    textAlign: 'right',
  },
  // negotiate slider
  trackBase: {
    height: 10,
    borderRadius: 34,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: INK,
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 10,
    borderRadius: 34,
    backgroundColor: INK,
  },
  sliderThumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderThumbText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
    color: WHITE,
  },
  sliderLabel: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 18,
    color: INK,
  },
  // map pieces
  pinDisc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinTail: {
    marginTop: -3,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: RED,
  },
  userPin: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // confirm address panel
  addressPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: WHITE,
    paddingHorizontal: 23,
    paddingBottom: 24,
    ...cardShadow,
  },
  panelLabel: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 16,
    color: '#000000',
  },
  addressField: {
    marginTop: 3,
    height: 48,
    borderRadius: 8,
    backgroundColor: FIELD,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressInput: {
    flex: 1,
    marginLeft: 11,
    marginRight: 8,
    paddingVertical: 0,
    fontFamily: 'Poppins_400Regular',
    fontSize: 18,
    color: INK,
  },
  // Live address suggestions (server /api/geo proxy) under the address field.
  suggestBox: {
    marginTop: 8,
    backgroundColor: WHITE,
    borderRadius: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  suggestDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5E5',
  },
  suggestText: {
    flex: 1,
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: INK,
  },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0A0808',
    paddingTop: 9,
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    columnGap: 24,
  },
  tabItem: {
    width: 138,
    alignItems: 'center',
  },
  tabLabelHome: {
    marginTop: 8,
    fontFamily: 'Poppins_500Medium',
    fontSize: 8,
    lineHeight: 12,
    color: WHITE,
  },
  tabRequestF: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 20,
    lineHeight: 24,
    color: RED,
  },
  tabLabelRequest: {
    marginTop: 8,
    fontFamily: 'Poppins_500Medium',
    fontSize: 8,
    lineHeight: 12,
    color: RED,
  },
  tabIndicator: {
    alignSelf: 'center',
    width: 134,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: WHITE,
    marginTop: 8,
  },
  // reblast chrome
  mapMenuBtn: {
    position: 'absolute',
    left: 25,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  switchPill: {
    position: 'absolute',
    right: 23,
    width: 244,
    height: 40,
    borderRadius: 20,
    backgroundColor: WHITE,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  switchPillText: {
    marginLeft: 24,
    flex: 1,
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    lineHeight: 18,
    color: INK,
  },
  switchTrack: {
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    marginRight: 24,
  },
  switchKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: WHITE,
    marginLeft: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  // reblast pal sheet
  palSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: WHITE,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 16,
  },
  sheetHandle: {
    alignSelf: 'center',
    marginTop: 23,
    width: 80,
    height: 5,
    borderRadius: 2,
    backgroundColor: INK,
  },
  palPhoto: {
    width: 75,
    height: 75,
    borderRadius: 40,
    backgroundColor: FIELD,
  },
  smallSub: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    lineHeight: 18,
    color: SUB,
  },
  sheetDivider: {
    marginTop: 16,
    height: 1,
    backgroundColor: FIELD,
  },
  helpHeading: {
    marginTop: 18,
    fontFamily: 'Poppins_500Medium',
    fontSize: 14,
    lineHeight: 21,
    color: INK,
  },
  helpBody: {
    marginTop: 8,
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    lineHeight: 21.56,
    color: SUB,
  },
  helpQuote: {
    marginTop: 24,
    fontFamily: 'Poppins_400Regular_Italic',
    fontSize: 14,
    lineHeight: 21.56,
    color: SUB,
  },
  // reblast modal
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    paddingBottom: 24,
  },
  modalTitle: {
    marginTop: 57,
    fontFamily: 'Poppins_500Medium',
    fontSize: 24,
    lineHeight: 36,
    color: INK,
    textAlign: 'center',
  },
  modalSub: {
    marginTop: 53,
    fontFamily: 'Poppins_500Medium',
    fontSize: 16,
    lineHeight: 24,
    color: INK,
    textAlign: 'center',
  },
});
