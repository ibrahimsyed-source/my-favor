# My Favor — Build Contract (read fully before writing code)

You are implementing ONE feature module of the **My Favor** React Native (Expo, TypeScript)
app — a two-sided on-demand favors marketplace. Build your screens to **pixel-match the
Figma reference images** while using the shared foundation below. Do NOT reinvent styling.

## Golden rules
1. **Match the reference image** (`figma-ref/<name>.png`) — layout, spacing, copy text,
   colors, font weights, button styles, and element order must match what you see.
2. **Only edit your assigned file(s).** Never touch `src/theme/*`, `src/store/*`,
   `src/components/index.tsx`, `src/navigation/*`, `src/types/*`, or another module's file.
3. **Keep the exported component names and props identical** to the existing stub
   (the navigator imports them by name; each screen receives `{ navigation, route }`).
4. **Use only already-installed libraries** (listed below). Do not run npm/expo install.
5. Read exact copy text and hex colors from the reference; if unsure you MAY call
   `mcp__figma-framelink__get_figma_data({ fileKey, nodeId })` for your frame.
6. For a **custom illustration/photo/mascot** you cannot reproduce in code, export it:
   `mcp__figma-framelink__download_figma_images({ fileKey, localPath: 'my-favor/assets/img/<module>', pngScale: 2, nodes: [{ nodeId, fileName }] })`
   then embed via `require('../../assets/img/<module>/<file>.png')`. The brand logo already
   exists at `assets/img/logo.png` (red "f" square) — use it for auth screens.
   For people avatars you may use the seeded `https://i.pravatar.cc/...` URLs already in the store.

## Design language (from the Figma kit)
- **Primary CTA**: solid **black** pill, white UPPERCASE text → `<Button variant="primary" />`.
- **Secondary**: light-gray pill, dark text → `variant="secondary"`.
- **Brand red** `#ED1C24`: logo, the "+" avatar badge, message/phone accent icons, the
  red "Set Status" dot, notification badges → `variant="brand"` or `theme.primary`.
- **White button** (on dark map sheets) → `variant="white"`.
- **Inputs**: filled light-gray (`#EFEFEF`), no border, ~12px radius, bold dark label above
  → use `<Field />`. Placeholder text is gray.
- **Headings/wordmark**: Comfortaa (rounded) — handled by `Txt` variants `display`/`h1..h6`.
- **Body**: Open Sans — `Txt variant="body|bodySm|caption"`.
- **Cards**: white, ~16px radius, soft shadow → `<Card />`.
- **Dark surfaces** (side drawer, map bottom-sheets): navy `theme.surface` in dark usage;
  for map screens the bottom sheet sits on a dark map — see `MapPlaceholder`.
- Screen background is white unless the reference shows a map (then it's the map image).
- Status-bar row shows "9:41" + signal/wifi/battery — the safe-area handles spacing; do NOT
  redraw the OS status bar.

## Foundation API

### Theme — `import { useTheme, tokens } from '../theme'`
```ts
const { theme, isDark, toggleDark } = useTheme();
// theme: primary(#ED1C24) primaryDark cta(#141414) ctaText secondaryBtn(#EAEAEA) link
//        background surface surfaceAlt card text textSecondary textTertiary border divider
//        inputBg(#EFEFEF) success warning(star #FFBD00) danger star onPrimary disabled
// tokens.spacing: xxs2 xs4 sm8 md12 base16 lg20 xl24 xxl32 xxxl48 huge64
// tokens.radius: sm8 md12 lg16 xl22 pill999   tokens.shadow.card
// tokens.typography: display h1 h2 h3 h4 h6 body bodySm label caption button tab
```

### Components — `import { ... } from '../components'`
```tsx
<Screen scroll padded>            // SafeArea wrapper; scroll? keyboard-aware; padded default true
<Txt variant="body" color center numberOfLines={2}>text</Txt>
<Button title="LOGIN" variant="primary|secondary|brand|white|ghost|danger" onPress icon loading uppercase />
<Field label="Email Address" value={v} onChangeText={set} placeholder icon secureTextEntry keyboardType multiline maxLength />
<Card onPress style>...</Card>
<Avatar uri={url} size={48} name="A" />
<StarRating value={4.9} size={18} onChange={fn} />   // onChange omitted = display only
<TopBar title="Signup" onBack={() => navigation.goBack()} right={<...>} />   // back chevron + centered title + hairline
<MapPlaceholder height={260} label="Map">{overlays}</MapPlaceholder>  // web-safe map stand-in
<Row icon="time" title="Favor History" subtitle="" right={<...>} onPress />  // list item w/ chevron
```
Icons: `import { Ionicons } from '@expo/vector-icons'` (e.g. `home,chatbubble,time,person,
chevron-back,chevron-forward,eye,eye-off,call,mail,star,star-outline,add,close,menu,
checkmark,checkmark-circle,location,card,settings,help-circle,log-out,camera,pencil`).

### Store — `import { useStore } from '../store'`
```ts
const s = useStore();
// auth:    s.user, s.isAuthenticated, s.signup(data), s.verifyOtp(code), s.login(email,pw),
//          s.logout(), s.updateProfile(patch), s.setRole('member'|'pal'), s.setStatus('online'|'invisible'|'offline')
// favors:  s.pals, s.draftFavor, s.setDraft(patch), s.clearDraft(), s.activeFavor, s.history,
//          s.requestFavor(), s.advanceFavor(status), s.cancelFavor(), s.rateFavor(rating,fb,tip),
//          s.incomingFavors, s.acceptFavor(id)
// money:   s.cards, s.addCard({brand,last4,expMonth,expYear}), s.removeCard(id), s.transactions, s.earnings
// chat:    s.threads, s.messagesFor(threadId), s.sendMessage(threadId,text)
// notifs:  s.notifications, s.markNotificationRead(id)
import { FAVOR_TIERS, computeFees, FavorTier } from '../types';
// FAVOR_TIERS.tiny.price=20 small=50 big=100 huge=150 ; computeFees(base) -> {serviceFee, transactionFee, total}
```
Seed data lives in `src/data/mockData.ts` (currentUser "Anton Vanko", nearbyPals incl. "Fabrizio L.",
reviews, history, cards, threads...). Use real values where the reference shows them.

### Navigation
Each screen gets `{ navigation, route }`. Navigate with `navigation.navigate('RouteName', params)`
and `navigation.goBack()`. Route names are fixed — see the stub you are replacing for the
forward links already wired. Do not add or rename routes.

## What "done" means for your module
- Every screen in your assignment is implemented to match its reference image.
- It typechecks (no TS errors) and uses only the foundation + installed libs.
- Buttons are wired to navigate per the existing stub's forward route (and to store actions
  where it makes sense, e.g. login calls `s.login` then navigates).
- Return a short summary: screens done, any assets exported, any intentional deviations.

## Installed libraries (safe to import)
react, react-native, @react-navigation/native + native-stack + bottom-tabs,
react-native-safe-area-context, react-native-screens, @expo/vector-icons,
@react-native-async-storage/async-storage, react-native-svg,
@react-native-community/slider, expo-linear-gradient, expo-image-picker,
@expo-google-fonts/(roboto|open-sans|comfortaa), expo-status-bar.

Figma fileKey for asset export: **L8LkpFZh6PXFdJVMTH33ff**
