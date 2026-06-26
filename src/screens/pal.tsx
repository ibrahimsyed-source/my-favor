import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Txt, InfoModal } from '../components';
import { useStore } from '../store';
import { computePayout } from '../types';
import { darkTokens, tokens } from '../theme';

// Favor Pal (provider) active-favor flow. All screens sit on a dark map.
// Dark surfaces come from darkTokens so they match the other navy screens.
const DARK_BG = darkTokens.bg;
const SHEET = darkTokens.surface;
const SHEET_ALT = darkTokens.surfaceAlt;
const RED = '#ED1C24';
const STAR = '#FFBD00';
const SUBTLE = darkTokens.textSubtle;
const DIVIDER = darkTokens.divider;

const CHARACTERS = require('../../assets/img/onboarding/launch-people.png');

// ---- shared dark-map backdrop -------------------------------------------------
function MapBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: darkTokens.bgAlt }]} />
      <View style={{ position: 'absolute', top: 90, left: 40, width: 3, height: 600, backgroundColor: '#2A3240', transform: [{ rotate: '8deg' }] }} />
      <View style={{ position: 'absolute', top: 120, left: -20, right: 0, height: 8, backgroundColor: '#7A5A1E', opacity: 0.5 }} />
      <View style={{ position: 'absolute', top: 240, left: 120, width: 3, height: 500, backgroundColor: '#2A3240' }} />
      <View style={{ position: 'absolute', top: 260, left: 0, right: 30, height: 3, backgroundColor: '#2A3240' }} />
    </View>
  );
}

function MapTopBar({ navigation, banner }: any) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0, paddingHorizontal: 16 }}>
      {banner ? (
        <View style={st.navBanner}>
          <Ionicons name="arrow-up" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', marginLeft: 10 }}>{banner}</Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity style={st.iconBtn} onPress={() => navigation.navigate('SideDrawer')}>
            <Ionicons name="menu" size={22} color="#141414" />
          </TouchableOpacity>
          <View style={st.switchPill}>
            <Text style={{ color: '#141414', fontWeight: '600', fontSize: 13 }}>Switch to request a favor</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      )}
    </View>
  );
}

function Handle() {
  return <View style={st.handle} />;
}

// ===========================================================================
// 1. PalFavorDetail — incoming favor quick view (figma 97:5700)
// ===========================================================================
export const PalFavorDetail = ({ navigation, route }: any) => {
  const s = useStore();
  const [expanded, setExpanded] = useState(false);
  const favor = s.incomingFavors.find((f) => f.id === route?.params?.favorId) ?? s.incomingFavors[0];
  const base = favor?.price ?? 20;
  const title = `Tiny Favor $${base}`;
  // Pal-side economics: what THEY take home (never the member invoice total).
  const { payout } = computePayout(base);
  const distance = '3 miles away';

  return (
    <View style={{ flex: 1, backgroundColor: DARK_BG }}>
      <MapBackdrop />
      <MapTopBar navigation={navigation} />
      <View style={st.sheet}>
        <Handle />
        <Txt variant="h3" color="#fff" center style={{ marginVertical: 14 }}>{title}</Txt>
        <View style={st.divider} />
        <View style={{ flexDirection: 'row', marginTop: 16 }}>
          <Image source={{ uri: 'https://i.pravatar.cc/150?img=52' }} style={st.avatar} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>Aditya Patil</Text>
            <Text style={{ color: SUBTLE, fontSize: 14, marginTop: 4 }} numberOfLines={expanded ? undefined : 2}>
              {favor?.description || 'No details provided yet.'}
            </Text>
            <Text style={{ color: SUBTLE, fontSize: 13, marginTop: 6 }}>22 Nov 2021, 1:00PM</Text>
            <Text style={{ fontSize: 14, marginTop: 6 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{`You earn $${payout.toFixed(2)}`}</Text>
              <Text style={{ color: SUBTLE }}>{`   ·   ${distance}`}</Text>
            </Text>
            <TouchableOpacity
              onPress={() => setExpanded((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={expanded ? 'View less favor detail' : 'View more favor detail'}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, marginTop: 8 }}>
                {expanded ? 'View Less' : 'View More'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {expanded && (
          <View style={{ marginTop: 16 }}>
            <View style={st.divider} />
            <QuickRow label="Arrival window" value={favor?.etaWindow ?? '1:00PM'} />
            {/* Privacy: precise address is withheld until the pal accepts the favor. */}
            <QuickRow label="Pickup area" value="Within ~3 mi · exact address shared once you accept" />
            <QuickRow label="You earn (after 20% commission)" value={`$${payout.toFixed(2)}`} />
          </View>
        )}

        <TouchableOpacity
          style={st.whiteBtn}
          accessibilityRole="button"
          accessibilityLabel="Accept this favor"
          onPress={() => { if (favor) s.acceptFavor(favor.id); navigation.navigate('Navigation'); }}
        >
          <Text style={st.whiteBtnTxt}>ACCEPT</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { if (favor) s.declineFavor(favor.id); navigation.goBack(); }}
          style={{ alignSelf: 'center', marginTop: 14 }}
          accessibilityRole="button"
          accessibilityLabel="Decline this favor"
        >
          <Text style={{ color: SUBTLE, fontWeight: '600' }}>decline this favor</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

function QuickRow({ label, value }: any) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: SUBTLE, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color: '#fff', fontSize: 14, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

// ===========================================================================
// 2. Navigation — accepted favor w/ directions banner (figma 181:10690)
// ===========================================================================
export const Navigation = ({ navigation }: any) => {
  const s = useStore();
  const [callOpen, setCallOpen] = useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: DARK_BG }}>
      <MapBackdrop />
      <MapTopBar navigation={navigation} banner="Head west on 2nd St." />
      <View style={st.sheet}>
        <Handle />
        <Txt variant="h6" color="#fff" center style={{ marginVertical: 12 }}>Favor Booked</Txt>
        <View style={st.divider} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
          <View>
            <Image source={{ uri: 'https://i.pravatar.cc/150?img=47' }} style={st.avatar} />
            <View style={st.redBadge}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>2</Text></View>
          </View>
          <View style={{ marginLeft: 14 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>Stephanie</Text>
            <Text style={{ color: SUBTLE, fontSize: 14, marginTop: 2 }}>Tiny Favor</Text>
            <Text style={{ color: SUBTLE, fontSize: 13, marginTop: 2 }}>3 miles away</Text>
          </View>
        </View>
        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 18 }}>11:50 - 12:10PM</Text>
        <View style={st.windowPill}><Text style={{ color: '#fff', fontSize: 13 }}>Arrival Window</Text></View>

        <ActionRow icon="call" label="Call About This Favor" onPress={() => setCallOpen(true)} />
        <ActionRow icon="mail" label="Message Favor Member" red onPress={() => navigation.navigate('MessageThread', { threadId: 'th1' })} />

        <TouchableOpacity
          style={st.whiteBtn}
          accessibilityRole="button"
          accessibilityLabel="I have arrived"
          onPress={() => { s.advanceFavor('arrived'); navigation.navigate('PalFavorInProgress'); }}
        >
          <Text style={st.whiteBtnTxt}>I AM HERE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={st.blackBtn}
          accessibilityRole="button"
          accessibilityLabel="Cancel this favor"
          onPress={() => { s.cancelFavor(); navigation.navigate('Tabs'); }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', letterSpacing: 0.5 }}>CANCEL THIS FAVOR</Text>
        </TouchableOpacity>
      </View>
      {/* Privacy: the call is relayed — the pal never sees the member's real number. */}
      <InfoModal
        visible={callOpen}
        title="Calling privately"
        message="We connect you and the Favor Member through a private relay, so neither of you ever sees the other's real phone number."
        buttonLabel="OK"
        onClose={() => setCallOpen(false)}
      />
    </View>
  );
};

function ActionRow({ icon, label, red, onPress }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={st.actionRow}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={red ? RED : '#fff'} />
      <Text style={{ color: '#fff', fontSize: 15, marginLeft: 14, flex: 1 }}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={SUBTLE} />
    </TouchableOpacity>
  );
}

// ===========================================================================
// 3. PalFavorInProgress — doing the favor (figma 523:17839)
// ===========================================================================
export const PalFavorInProgress = ({ navigation }: any) => {
  const s = useStore();
  const fav = s.activeFavor;
  const base = fav?.price ?? 20;
  // Pal-side breakdown — what the pal takes home, NOT the member's invoice.
  const { payout, commission } = computePayout(base);
  const description = fav?.description || 'Pick up package from Amazon Hub Lockers';
  // Exact address is appropriate here: the pal has already accepted the favor.
  const address = fav?.location?.address || '2099 Woodvine Rd, Lorman';
  return (
    <View style={{ flex: 1, backgroundColor: DARK_BG }}>
      <MapBackdrop />
      <MapTopBar navigation={navigation} />
      <ScrollView style={st.scrollSheet} contentContainerStyle={{ paddingBottom: 24 }}>
        <Handle />
        <Txt variant="h6" color="#fff" center style={{ marginVertical: 12 }}>You are currently doing a favor.</Txt>
        <View style={st.divider} />
        <View style={{ flexDirection: 'row', marginTop: 16 }}>
          <Image source={{ uri: 'https://i.pravatar.cc/150?img=52' }} style={st.avatar} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>Aditya Patil</Text>
            <Text style={{ color: SUBTLE, fontSize: 14, marginTop: 4 }}>{description}</Text>
            <Text style={{ color: SUBTLE, fontSize: 13, marginTop: 4 }}>16 February 2023, 1:00PM</Text>
          </View>
        </View>
        <View style={[st.divider, { marginTop: 18 }]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
          <Image source={require('../../assets/img/request/tier-tiny.png')} style={{ width: 44, height: 44, marginRight: 12 }} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <CostRow label="Tiny Favor" value={`$${base.toFixed(2)}`} bold />
            <CostRow label="Platform commission (20%)" value={`-$${commission.toFixed(2)}`} />
            <CostRow label="You earn" value={`$${payout.toFixed(2)}`} bold />
          </View>
        </View>
        <Section icon="document-text" title="Description" body={description} />
        <Section icon="location" title="Address" body={address} />
        <TouchableOpacity
          style={st.whiteBtn}
          accessibilityRole="button"
          accessibilityLabel="Mark favor done and get paid"
          onPress={() => {
            const earned = s.finishFavorAsPal();
            navigation.navigate('PalFavorSuccess', { payout: earned });
          }}
        >
          <Text style={st.whiteBtnTxt}>MARK FAVOR DONE</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

function CostRow({ label, value, bold }: any) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 }}>
      <Text style={{ color: bold ? '#fff' : SUBTLE, fontSize: 14, fontWeight: bold ? '700' : '400' }}>{label}</Text>
      <Text style={{ color: bold ? '#fff' : SUBTLE, fontSize: 14, fontWeight: bold ? '700' : '400' }}>{value}</Text>
    </View>
  );
}

function Section({ icon, title, body }: any) {
  return (
    <View style={{ marginTop: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name={icon} size={18} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: 8 }}>{title}</Text>
      </View>
      <Text style={{ color: SUBTLE, fontSize: 14, marginTop: 6, marginLeft: 26 }}>{body}</Text>
    </View>
  );
}

// ===========================================================================
// 4. PalFavorSuccess — "You just got paid!" confirmation (figma pal-success)
// ===========================================================================
export const PalFavorSuccess = ({ navigation, route }: any) => {
  const payout = route?.params?.payout;
  const paid = typeof payout === 'number';
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: DARK_BG }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Ionicons name="checkmark-circle-outline" size={120} color="#4CAF50" />
        <Txt variant="h2" color="#fff" center style={{ marginTop: 24 }}>
          {paid ? `You just got paid $${payout.toFixed(2)}!` : 'You just got paid!'}
        </Txt>
        {paid && (
          <Txt variant="body" color={SUBTLE} center style={{ marginTop: 10 }}>
            {`$${payout.toFixed(2)} was added to your Earning History.`}
          </Txt>
        )}
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: 12 }}>
        <TouchableOpacity
          style={st.whiteBtn}
          accessibilityRole="button"
          accessibilityLabel="Add feedback"
          onPress={() => navigation.navigate('PalFavorComplete')}
        >
          <Text style={st.whiteBtnTxt}>ADD FEEDBACK</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// ===========================================================================
// 5. PalFavorComplete — Thank You / feedback (figma 97:6337 / 97:6307)
// ===========================================================================
export const PalFavorComplete = ({ navigation }: any) => {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  // The favor was already recorded by finishFavorAsPal() at MARK FAVOR DONE, so
  // submitting here only dismisses the flow — do NOT rate/record it a second time.
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: DARK_BG }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, flexGrow: 1 }}>
        <Txt variant="h2" color="#fff" center style={{ marginTop: 24 }}>Thank You!</Txt>
        <Image source={CHARACTERS} style={{ width: '100%', height: 320, marginTop: 12 }} resizeMode="contain" />
        <View style={[st.divider, { marginTop: 8 }]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 20 }}>
          <Txt variant="h4" color="#fff" style={{ marginRight: 24 }}>Rating</Txt>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <TouchableOpacity
                key={i}
                onPress={() => setRating(i)}
                accessibilityRole="button"
                accessibilityLabel={`Rate ${i} ${i === 1 ? 'star' : 'stars'}`}
                accessibilityState={{ selected: i <= rating }}
              >
                <Ionicons name={i <= rating ? 'star' : 'star-outline'} size={30} color={STAR} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={[st.divider, { marginTop: 20 }]} />
        <Txt variant="body" color="#fff" style={{ marginTop: 20 }}>Tell us about your experience</Txt>
        <View style={st.feedbackBox}>
          <TextInput
            style={[tokens.typography.body, { color: '#fff', minHeight: 120, textAlignVertical: 'top' }]}
            multiline
            maxLength={700}
            value={feedback}
            onChangeText={setFeedback}
            placeholder="Write your feedback..."
            placeholderTextColor="#6B7280"
          />
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[st.whiteBtn, { marginTop: 28, opacity: rating ? 1 : 0.5 }]}
          disabled={!rating}
          accessibilityRole="button"
          accessibilityLabel="Submit feedback"
          accessibilityState={{ disabled: !rating }}
          onPress={() => navigation.navigate('Tabs')}
        >
          <Text style={st.whiteBtnTxt}>SUBMIT FEEDBACK</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const st = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  switchPill: { backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
  navBanner: { backgroundColor: '#1C2331', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: SHEET, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 36 },
  scrollSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '78%', backgroundColor: SHEET, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 12 },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#3A4250' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: DIVIDER },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  redBadge: { position: 'absolute', top: -4, right: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: RED, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: SHEET },
  windowPill: { alignSelf: 'center', backgroundColor: SHEET_ALT, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6, marginTop: 8 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DIVIDER },
  whiteBtn: { backgroundColor: '#fff', borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  whiteBtnTxt: { color: '#141414', fontWeight: '700', fontSize: 16, letterSpacing: 0.5 },
  blackBtn: { backgroundColor: '#000', borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  feedbackBox: { backgroundColor: SHEET_ALT, borderRadius: 16, padding: 16, marginTop: 12 },
});
