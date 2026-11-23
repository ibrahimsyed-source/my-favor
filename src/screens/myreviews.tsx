import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getPalReviewsApi, getMemberReviewsApi } from '../api/endpoints';
import { useStore } from '../store';
import { Review } from '../types';

// MyReviews — the reviews the SIGNED-IN user has received, with the aggregate
// rating. Role-aware like every other profile surface: a Favor Pal sees reviews
// members left them (dark pal language); a Favor Member sees reviews pals left
// them (light member language). Reuses the existing per-role review endpoints
// (they accept any authenticated caller with any id, so we pass our own).

const STAR = '#FFBD00';
const P400 = 'Poppins_400Regular';
const P500 = 'Poppins_500Medium';
const P600 = 'Poppins_600SemiBold';

// Light (member) vs dark (pal) palettes — mirrors profile.tsx's L/D kits.
const LIGHT = {
  page: '#FFFFFF',
  card: '#F6F6F6',
  text: '#0D0A0A',
  subtle: 'rgba(13,10,10,0.55)',
  divider: 'rgba(13,10,10,0.08)',
};
const DARK = {
  page: '#0D0A0A',
  card: '#252A38',
  text: '#FFFFFF',
  subtle: 'rgba(255,255,255,0.64)',
  divider: 'rgba(255,255,255,0.10)',
};

export const MyReviews = ({ navigation }: any) => {
  const { user } = useStore();
  const isPal = user?.role === 'pal';
  const c = isPal ? DARK : LIGHT;
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const aggregate = (isPal ? user?.rating : user?.memberRating) ?? 0;

  useEffect(() => {
    if (!user?.id) { setLoading(false); setErrored(true); return; }
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    (async () => {
      try {
        const r = isPal ? await getPalReviewsApi(user.id) : await getMemberReviewsApi(user.id);
        if (!cancelled) setReviews(r.reviews);
      } catch {
        if (!cancelled) setErrored(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, isPal, attempt]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[st.page, { backgroundColor: c.page }]}>
      <View style={st.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={st.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={[st.topTitle, { color: c.text }]}>My Reviews</Text>
        <View style={st.backBtn} />
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator color={c.text} /></View>
      ) : errored ? (
        <View style={st.center}>
          <Ionicons name="star-outline" size={56} color={c.subtle} />
          <Text style={[st.emptyTitle, { color: c.text }]}>Reviews unavailable</Text>
          <Text style={[st.emptySub, { color: c.subtle }]}>We couldn't load your reviews. Please try again.</Text>
          <TouchableOpacity
            onPress={() => setAttempt((a) => a + 1)}
            style={[st.retryBtn, { backgroundColor: isPal ? '#FFFFFF' : '#0D0A0A' }]}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={[st.retryText, { color: isPal ? '#000000' : '#FFFFFF' }]}>TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
          {/* Aggregate header */}
          <View style={[st.summary, { backgroundColor: c.card }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="star" size={22} color={STAR} />
              <Text style={[st.summaryValue, { color: c.text }]}>
                {'  '}{aggregate > 0 ? aggregate.toFixed(1) : 'New'}
              </Text>
            </View>
            <Text style={[st.summaryLabel, { color: c.subtle }]}>
              {reviews.length === 0
                ? (isPal ? 'No reviews from Favor Members yet' : 'No reviews from Favor Pals yet')
                : `${reviews.length} review${reviews.length === 1 ? '' : 's'} ${isPal ? 'from Favor Members' : 'from Favor Pals'}`}
            </Text>
          </View>

          {reviews.length > 0 ? (
            <View style={[st.sheet, { backgroundColor: c.card }]}>
              {reviews.map((r, i) => (
                <View key={r.id} style={[st.review, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Ionicons key={n} name={n <= r.rating ? 'star' : 'star-outline'} size={14} color={STAR} />
                    ))}
                    <Text style={[st.reviewMeta, { color: c.subtle }]}>
                      {'   '}{r.authorName}{' · '}
                      {new Date(r.date).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  {r.comment ? <Text style={[st.reviewComment, { color: c.text }]}>{r.comment}</Text> : null}
                </View>
              ))}
            </View>
          ) : (
            <Text style={[st.hint, { color: c.subtle }]}>
              {isPal
                ? 'Complete favors to start collecting reviews from the members you help.'
                : 'Reviews appear here after a Favor Pal rates a favor you requested.'}
            </Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const st = StyleSheet.create({
  page: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, fontSize: 17, fontFamily: P600, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontFamily: P600, marginTop: 14 },
  emptySub: { fontSize: 14, lineHeight: 20, fontFamily: P400, textAlign: 'center', marginTop: 6 },
  retryBtn: { marginTop: 20, height: 44, borderRadius: 8, paddingHorizontal: 36, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontSize: 14, fontFamily: P500, letterSpacing: 1 },
  summary: { borderRadius: 16, padding: 20, marginTop: 10, alignItems: 'center' },
  summaryValue: { fontSize: 30, fontFamily: P600 },
  summaryLabel: { fontSize: 13, fontFamily: P400, marginTop: 6, textAlign: 'center' },
  sheet: { borderRadius: 16, padding: 16, marginTop: 14 },
  review: { paddingVertical: 12 },
  reviewMeta: { fontSize: 12, fontFamily: P400 },
  reviewComment: { fontSize: 14, lineHeight: 21, fontFamily: P400, marginTop: 6 },
  hint: { fontSize: 14, lineHeight: 21, fontFamily: P400, marginTop: 20, textAlign: 'center' },
});

export default MyReviews;
