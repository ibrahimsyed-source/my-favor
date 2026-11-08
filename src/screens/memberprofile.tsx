import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../components';
import { getMemberApi, getMemberReviewsApi, MemberProfile as MemberProfileData } from '../api/endpoints';
import { Review } from '../types';

// MemberProfile — a favor member's public profile as seen by PALS deciding
// whether to take (or keep) their favor: identity, aggregate rating from past
// pals, and the reviews pals left for them. Dark provider-side language
// (page ink + navy sheet) to match the rest of the pal flow.

const PAGE_BG = '#0D0A0A';
const SHEET = '#252A38';
const TEXT = '#FFFFFF';
const SUBTLE = 'rgba(255,255,255,0.64)';
const DIVIDER = 'rgba(255,255,255,0.10)';
const STAR = '#FFBD00';
const P400 = 'Poppins_400Regular';
const P500 = 'Poppins_500Medium';
const P600 = 'Poppins_600SemiBold';

export const MemberProfile = ({ navigation, route }: any) => {
  const userId: string | undefined = route?.params?.userId;
  const [member, setMember] = useState<MemberProfileData | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  // Bumped by TRY AGAIN — re-runs the fetch effect without re-navigating.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId) { setLoading(false); setErrored(true); return; }
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    (async () => {
      try {
        const [m, r] = await Promise.all([getMemberApi(userId), getMemberReviewsApi(userId)]);
        if (cancelled) return;
        setMember(m.member);
        setReviews(r.reviews);
      } catch {
        if (!cancelled) setErrored(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, attempt]);

  const name = member ? `${member.firstName} ${member.lastName}`.trim() : 'Favor Member';
  const sinceYear = member ? new Date(member.memberSince).getFullYear() : undefined;
  const locality = member && (member.city || member.state)
    ? [member.city, member.state].filter(Boolean).join(', ')
    : undefined;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={st.page}>
      <View style={st.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={st.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <Text style={st.topTitle}>Favor Member</Text>
        <View style={st.backBtn} />
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator color={TEXT} /></View>
      ) : errored || !member ? (
        <View style={st.center}>
          <Ionicons name="person-circle-outline" size={56} color={SUBTLE} />
          <Text style={st.emptyTitle}>Profile unavailable</Text>
          <Text style={st.emptySub}>We couldn't load this member's profile. Please try again.</Text>
          {/* Dead-end fix: the fetch only re-ran on a userId change, so "try
              again" used to require backing out and re-opening the screen. */}
          {userId ? (
            <TouchableOpacity
              onPress={() => setAttempt((a) => a + 1)}
              style={st.retryBtn}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <Text style={st.retryText}>TRY AGAIN</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
          <View style={{ alignItems: 'center', marginTop: 18 }}>
            <Avatar uri={member.avatar} size={88} name={name} />
            <Text style={st.name} numberOfLines={1}>{name}</Text>
            {locality ? <Text style={st.locality} numberOfLines={1}>{locality}</Text> : null}
          </View>

          <View style={st.statsRow}>
            <View style={st.stat}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="star" size={15} color={STAR} />
                <Text style={st.statValue}>
                  {'  '}{member.memberRating > 0 ? member.memberRating.toFixed(1) : 'New'}
                </Text>
              </View>
              <Text style={st.statLabel}>Rating</Text>
            </View>
            <View style={st.statDivider} />
            <View style={st.stat}>
              <Text style={st.statValue}>{member.completedFavors}</Text>
              <Text style={st.statLabel}>Favors done</Text>
            </View>
            <View style={st.statDivider} />
            <View style={st.stat}>
              <Text style={st.statValue}>{sinceYear ?? '—'}</Text>
              <Text style={st.statLabel}>Member since</Text>
            </View>
          </View>

          {member.bio ? (
            <View style={st.sheet}>
              <Text style={st.sectionTitle}>About</Text>
              <Text style={st.bio}>{member.bio}</Text>
            </View>
          ) : null}

          <View style={st.sheet}>
            <Text style={st.sectionTitle}>Reviews from Favor Pals</Text>
            {reviews.length === 0 ? (
              <Text style={st.bio}>No reviews yet.</Text>
            ) : (
              reviews.map((r, i) => (
                <View key={r.id} style={[st.review, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DIVIDER }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Ionicons key={n} name={n <= r.rating ? 'star' : 'star-outline'} size={14} color={STAR} />
                    ))}
                    <Text style={st.reviewMeta}>
                      {'   '}{r.authorName}{' · '}
                      {new Date(r.date).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  {r.comment ? <Text style={st.reviewComment}>{r.comment}</Text> : null}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: PAGE_BG },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, color: TEXT, fontSize: 17, fontFamily: P600, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { color: TEXT, fontSize: 17, fontFamily: P600, marginTop: 14 },
  emptySub: { color: SUBTLE, fontSize: 14, lineHeight: 20, fontFamily: P400, textAlign: 'center', marginTop: 6 },
  // Provider v.2 primary CTA — white pill, black label.
  retryBtn: {
    marginTop: 20, height: 44, borderRadius: 8, paddingHorizontal: 36,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  retryText: { color: '#000000', fontSize: 14, fontFamily: P500, letterSpacing: 1 },
  name: { color: TEXT, fontSize: 22, fontFamily: P600, marginTop: 12 },
  locality: { color: SUBTLE, fontSize: 14, fontFamily: P400, marginTop: 2 },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: SHEET, borderRadius: 16,
    paddingVertical: 16, marginTop: 20,
  },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: DIVIDER },
  statValue: { color: TEXT, fontSize: 17, fontFamily: P600 },
  statLabel: { color: SUBTLE, fontSize: 12, fontFamily: P400, marginTop: 4 },
  sheet: { backgroundColor: SHEET, borderRadius: 16, padding: 16, marginTop: 14 },
  sectionTitle: { color: TEXT, fontSize: 15, fontFamily: P600, marginBottom: 10 },
  bio: { color: SUBTLE, fontSize: 14, lineHeight: 21, fontFamily: P400 },
  review: { paddingVertical: 12 },
  reviewMeta: { color: SUBTLE, fontSize: 12, fontFamily: P400 },
  reviewComment: { color: TEXT, fontSize: 14, lineHeight: 21, fontFamily: P400, marginTop: 6 },
});

export default MemberProfile;
