import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, Image, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { useFonts, Poppins_400Regular, Poppins_400Regular_Italic } from '@expo-google-fonts/poppins';
import { useStore } from '../store';
import { FAVOR_TIERS } from '../types';

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
const TIERS: Record<TierKey, { img: any; w: number; h: number; dx: number; dy: number }> = {
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
          minimumValue={0}
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
// ---------------------------------------------------------------------------
export function ConfirmAddress({ navigation }: any) {
  const s = useStore();
  const fontsLoaded = usePoppinsRegular();
  const insets = useSafeAreaInsets();
  const [address, setAddress] = useState(
    s.draftFavor?.location?.address ?? s.user?.homeAddress ?? '2099 Woodvine Rd, Lorman…'
  );

  const canConfirm = address.trim().length > 0;
  const onConfirm = () => {
    if (!canConfirm) return;
    s.setDraft({ location: { lat: 31.8069, lng: -91.0593, address: address.trim() } });
    navigation.navigate('FavorSummary');
  };

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: WHITE }} />;

  return (
    <View style={{ flex: 1, backgroundColor: WHITE }}>
      <MapBackdrop userAvatar={s.user?.avatar} />

      {/* Top address panel */}
      <View style={[styles.addressPanel, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.panelLabel}>Location of your favor</Text>
        <View style={styles.addressField}>
          <Ionicons name="locate" size={20} color={RED} style={{ marginLeft: 16 }} />
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="Enter the favor address"
            placeholderTextColor={PLACEHOLDER}
            numberOfLines={1}
            style={styles.addressInput}
            returnKeyType="done"
            accessibilityLabel="Favor address"
          />
          <Ionicons name="chevron-down" size={12} color={INK} style={{ marginRight: 16 }} />
        </View>
        <BlackButton title="Confirm Address" disabled={!canConfirm} onPress={onConfirm} style={{ marginTop: 16 }} />
      </View>

      {/* Bottom tab bar (HOME / REQUEST A FAVOR) exactly as the frame */}
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation.navigate('Tabs')}
          accessibilityRole="button"
          accessibilityLabel="Home"
        >
          <Ionicons name="home" size={24} color={INK} />
          <Text style={styles.tabLabelHome}>HOME</Text>
        </TouchableOpacity>
        <View style={styles.tabItem} accessibilityLabel="Request a favor">
          <View style={styles.tabRequestBadge}>
            <Text style={styles.tabRequestF}>f</Text>
          </View>
          <Text style={styles.tabLabelRequest}>REQUEST A FAVOR</Text>
        </View>
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
    fontFamily: 'Roboto_400Regular',
    fontSize: 12,
    color: WHITE,
  },
  sliderLabel: {
    fontFamily: 'Roboto_400Regular',
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
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: WHITE,
    flexDirection: 'row',
    justifyContent: 'center',
    columnGap: 24,
    paddingTop: 9,
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
    color: INK,
  },
  tabRequestBadge: {
    width: 40,
    height: 32,
    borderRadius: 8,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -3,
  },
  tabRequestF: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 18,
    lineHeight: 24,
    color: WHITE,
    fontStyle: 'italic',
  },
  tabLabelRequest: {
    marginTop: 3,
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 8,
    lineHeight: 12,
    color: RED,
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
