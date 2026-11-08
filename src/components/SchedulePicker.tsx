import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ---------------------------------------------------------------------------
// SchedulePicker — shared "When do you need this favor?" modal, v.2 member
// light kit (white 351w r16 card over a 50% scrim). Two paths:
//   NOW      -> onPick(undefined)  (clears any schedule; the store's setDraft
//               spread copies the explicit undefined over the old value, and
//               requestFavor's body builder treats undefined as absent)
//   Schedule -> a real date/time picker; CONFIRM validates the moment is in
//               the future and within 90 days, then returns an ms epoch via
//               onPick(ms). Invalid picks show an inline error instead.
// Dismissing without choosing calls onClose. The CALLER closes the modal from
// its onPick handler (setDraft + setVisible(false)) — this component never
// self-dismisses a successful pick.
//
// Native: @react-native-community/datetimepicker — iOS renders the inline
// datetime picker in the card; Android walks its two system dialogs (date,
// then time) and recaps before CONFIRM. Web (dev-only): two plain text inputs
// (YYYY-MM-DD / HH:MM 24h) with a strict parse. The native module is
// require()d behind a Platform guard because the package's web support is
// unreliable — the web branch never touches it.
// ---------------------------------------------------------------------------

const INK = '#0D0A0A';
const SUB = '#484747';
const FIELD = '#EEEEEE';
const PLACEHOLDER = '#9E9E9E';
const RED = '#D40000';
const WHITE = '#FFFFFF';
const P400 = 'Poppins_400Regular';
const P500 = 'Poppins_500Medium';

// Guarded require: only the native bundles load the module (see header note).
const DateTimePicker: any =
  Platform.OS === 'web' ? null : require('@react-native-community/datetimepicker').default;

// Scheduling horizon — mirrors the server's create-route validation (future,
// at most 90 days out).
const MAX_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

// Shared display label for a draft schedule: "NOW" or "Nov 12, 4:30 PM".
export const formatScheduledFor = (ms?: number) =>
  ms != null
    ? new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'NOW';

const pad2 = (n: number) => String(n).padStart(2, '0');

// Opening the schedule path with nothing picked yet proposes one hour from
// now, rounded up to the next 5 minutes — always a valid starting point.
const defaultProposal = () => {
  const step = 5 * 60 * 1000;
  return Math.ceil((Date.now() + 60 * 60 * 1000) / step) * step;
};

export function SchedulePicker({ visible, value, onClose, onPick }: {
  visible: boolean;
  value?: number;
  onClose: () => void;
  onPick: (scheduledFor: number | undefined) => void;
}) {
  // 'menu' = NOW vs Schedule choice · 'date'/'time' = Android's two system
  // dialogs · 'pick' = the editor (iOS inline picker / web inputs / Android
  // recap) with the CONFIRM button.
  const [step, setStep] = useState<'menu' | 'date' | 'time' | 'pick'>('menu');
  const [pending, setPending] = useState<number>(value ?? defaultProposal());
  const [error, setError] = useState('');
  // Web-only input text (kept in sync with `pending` on open).
  const [dateText, setDateText] = useState('');
  const [timeText, setTimeText] = useState('');

  // Every open resets to the menu, seeded from the current draft value.
  useEffect(() => {
    if (!visible) return;
    const seed = value ?? defaultProposal();
    setStep('menu');
    setPending(seed);
    setError('');
    const d = new Date(seed);
    setDateText(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);
    setTimeText(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
  }, [visible, value]);

  const startSchedule = () => {
    setError('');
    setStep(Platform.OS === 'android' ? 'date' : 'pick');
  };

  // Final gate for every path: future-only, at most 90 days out.
  const confirm = (ms: number) => {
    if (Number.isNaN(ms) || ms <= Date.now()) {
      setError('Please pick a time in the future.');
      return;
    }
    if (ms > Date.now() + MAX_AHEAD_MS) {
      setError('Favors can be scheduled up to 90 days ahead.');
      return;
    }
    onPick(ms);
  };

  const confirmWeb = () => {
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
    const tm = /^(\d{1,2}):(\d{2})$/.exec(timeText.trim());
    if (!dm || !tm) {
      setError('Enter the date as YYYY-MM-DD and the time as HH:MM (24h).');
      return;
    }
    const d = new Date(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2]);
    // Reject rolled-over nonsense (e.g. 2026-02-31, 25:70) — Date would
    // silently normalize it to a moment the member never typed.
    if (d.getMonth() !== +dm[2] - 1 || d.getDate() !== +dm[3] || +tm[1] > 23 || +tm[2] > 59) {
      setError('That date and time don’t look valid.');
      return;
    }
    confirm(d.getTime());
  };

  // Android two-step: the native pickers are system DIALOGS (no inline view);
  // each fires onChange exactly once with 'set' or 'dismissed'.
  const onAndroidDate = (event: { type: string }, picked?: Date) => {
    if (event.type !== 'set' || !picked) { setStep('menu'); return; }
    const base = new Date(pending);
    base.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    setPending(base.getTime());
    setStep('time');
  };
  const onAndroidTime = (event: { type: string }, picked?: Date) => {
    if (event.type !== 'set' || !picked) { setStep('menu'); return; }
    const base = new Date(pending);
    base.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    setPending(base.getTime());
    setStep('pick'); // recap + CONFIRM (the validation runs there)
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim} accessibilityViewIsModal>
        <View style={styles.card}>
          <Text style={styles.title}>When do you need this favor?</Text>

          {step === 'menu' || step === 'date' || step === 'time' ? (
            <>
              {/* NOW — clears any schedule */}
              <TouchableOpacity
                style={styles.option}
                onPress={() => onPick(undefined)}
                accessibilityRole="button"
                accessibilityState={{ selected: value == null }}
                accessibilityLabel="Now — as soon as a Favor Pal is matched"
              >
                <Ionicons name="flash-outline" size={22} color={INK} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.optionTitle}>Now</Text>
                  <Text style={styles.optionSub}>As soon as a Favor Pal is matched</Text>
                </View>
                {value == null ? <Ionicons name="checkmark" size={20} color={INK} /> : null}
              </TouchableOpacity>

              {/* Schedule — into the date/time editor */}
              <TouchableOpacity
                style={styles.option}
                onPress={startSchedule}
                accessibilityRole="button"
                accessibilityState={{ selected: value != null }}
                accessibilityLabel={
                  value != null
                    ? `Scheduled for ${formatScheduledFor(value)}. Change the schedule`
                    : 'Schedule for later'
                }
              >
                <Ionicons name="calendar-outline" size={22} color={INK} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.optionTitle}>Schedule for later</Text>
                  <Text style={styles.optionSub}>
                    {value != null ? formatScheduledFor(value) : 'Pick a date and time'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={SUB} />
              </TouchableOpacity>
            </>
          ) : Platform.OS === 'web' ? (
            <>
              {/* Web (dev-only) fallback — two strict text inputs */}
              <Text style={styles.fieldLabel}>Date (YYYY-MM-DD)</Text>
              <View style={styles.field}>
                <TextInput
                  value={dateText}
                  onChangeText={(t) => { setDateText(t); setError(''); }}
                  placeholder="2026-11-12"
                  placeholderTextColor={PLACEHOLDER}
                  style={styles.fieldInput}
                  accessibilityLabel="Schedule date, year dash month dash day"
                />
              </View>
              <Text style={styles.fieldLabel}>Time (HH:MM, 24h)</Text>
              <View style={styles.field}>
                <TextInput
                  value={timeText}
                  onChangeText={(t) => { setTimeText(t); setError(''); }}
                  placeholder="16:30"
                  placeholderTextColor={PLACEHOLDER}
                  style={styles.fieldInput}
                  accessibilityLabel="Schedule time, 24 hour clock"
                />
              </View>
            </>
          ) : Platform.OS === 'ios' ? (
            // iOS: the inline datetime picker lives right in the card.
            <View style={{ alignSelf: 'stretch', marginTop: 12, marginHorizontal: -8 }}>
              <DateTimePicker
                value={new Date(pending)}
                mode="datetime"
                display="inline"
                themeVariant="light"
                minimumDate={new Date()}
                maximumDate={new Date(Date.now() + MAX_AHEAD_MS)}
                onChange={(_e: unknown, d?: Date) => { if (d) { setPending(d.getTime()); setError(''); } }}
              />
            </View>
          ) : (
            // Android recap after the two dialogs: the chosen moment + a way back.
            <>
              <View style={styles.recapChip}>
                <Ionicons name="time-outline" size={16} color={INK} />
                <Text style={styles.recapText}>{formatScheduledFor(pending)}</Text>
              </View>
              <TouchableOpacity
                onPress={startSchedule}
                style={{ marginTop: 10, alignSelf: 'center', paddingVertical: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Change the date and time"
              >
                <Text style={styles.linkText}>Change date &amp; time</Text>
              </TouchableOpacity>
            </>
          )}

          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>
          ) : null}

          {step === 'pick' ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => (Platform.OS === 'web' ? confirmWeb() : confirm(pending))}
              style={styles.confirmBtn}
              accessibilityRole="button"
              accessibilityLabel="Confirm schedule"
            >
              <Text style={styles.confirmText}>CONFIRM</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            onPress={onClose}
            style={{ marginTop: 14, alignSelf: 'center', paddingVertical: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Close without changing the schedule"
          >
            <Text style={styles.linkText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {/* Android's system dialogs (rendered invisibly while their step is up) */}
        {Platform.OS === 'android' && step === 'date' ? (
          <DateTimePicker
            value={new Date(pending)}
            mode="date"
            minimumDate={new Date()}
            maximumDate={new Date(Date.now() + MAX_AHEAD_MS)}
            onChange={onAndroidDate}
          />
        ) : null}
        {Platform.OS === 'android' && step === 'time' ? (
          <DateTimePicker
            value={new Date(pending)}
            mode="time"
            onChange={onAndroidTime}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 31,
  },
  card: {
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
  title: { fontFamily: P500, fontSize: 20, lineHeight: 30, color: INK, textAlign: 'center' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: FIELD,
  },
  optionTitle: { fontFamily: P500, fontSize: 15, lineHeight: 22, color: INK },
  optionSub: { fontFamily: P400, fontSize: 12, lineHeight: 18, color: SUB, marginTop: 1 },
  fieldLabel: { fontFamily: P400, fontSize: 13, lineHeight: 19, color: SUB, marginTop: 14 },
  field: {
    marginTop: 6,
    height: 44,
    borderRadius: 8,
    backgroundColor: FIELD,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  fieldInput: { paddingVertical: 0, fontFamily: P400, fontSize: 16, color: INK },
  recapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'stretch',
    height: 40,
    borderRadius: 6,
    backgroundColor: FIELD,
    marginTop: 16,
    paddingHorizontal: 12,
  },
  recapText: { fontFamily: P500, fontSize: 15, color: INK },
  error: { marginTop: 10, fontFamily: P400, fontSize: 13, lineHeight: 19, color: RED, textAlign: 'center' },
  confirmBtn: {
    height: 48,
    borderRadius: 8,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  confirmText: { fontFamily: P500, fontSize: 16, color: WHITE, letterSpacing: 0.5 },
  linkText: { fontFamily: P500, fontSize: 14, lineHeight: 21, color: INK, textAlign: 'center' },
});
