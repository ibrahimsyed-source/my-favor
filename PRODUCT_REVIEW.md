# My Favor — Product Improvement Report

## 1. Executive summary

My Favor is visually convincing but functionally a prototype: the screens render beautifully while the post-booking "spine" — booking → tracking → completion → payout — is built largely from hardcoded literals rather than the user's actual favor and chosen pal. The single most damaging theme is an **incoherent money model with a hidden ~50% platform take**: the same Tiny favor shows as `$20.88` to the member, `$10` to the pal, and `$33`/`$10` in seed earnings, computed by three different inline formulas (`checkout.tsx`, `tracking.tsx:104-107`, `pal.tsx:159-186`, `mockData.ts:101-104`). The second theme is **state that never connects**: the booked pal is discarded at `providers.tsx:192`, `FavorTracking` ignores `activeFavor` entirely, half the `FavorStatus` lifecycle is dead, and the member self-completes a favor no pal ever touched. The third theme is a **stack of trust/safety launch blockers** — no pal vetting/background check, no report/block/dispute, one-tap cancellation of a paid favor with no refund disclosure, raw PAN/CVC captured into app state, and a decorative Terms checkbox. Underneath are dozens of **cheap, embarrassing correctness bugs** (an inverted role-switch label, lorem-ipsum shown as the real task, paying with no card on file, a counter that reads "243 characters max") plus systemic UI drift (the entire display type is Comfortaa instead of the Figma geometric sans). **Focus order: first make the state spine and money model real and consistent; then clear the trust/safety blockers required for any real-money launch; then sweep the long tail of quick wins and visual fidelity fixes.**

---

## 2. Top 10 prioritized recommendations

**1. Unify the money model behind one canonical helper**
- *Problem:* The same favor shows $20 / $20.88 / $10 / $33 across screens and the ~50% platform take is hidden from both sides.
- *Change:* Add `PLATFORM_COMMISSION_RATE` + `computePayout(base)` to `src/types/index.ts` beside `computeFees`; drive `tracking.tsx:104-107`, `pal.tsx` `PalFavorInProgress` (159-186), and the `mockData.ts:101-104` seed from it. Never render the member's invoice total on a pal screen; show the member a "Pal receives $X / Service fee $Y" split.
- *Severity:* High · *Effort:* M · *Category:* Trust/Safety/Payments

**2. Wire tracking and history to the real booked favor and pal**
- *Problem:* `BOOK FAVOR PAL` discards the chosen pal (no store write), and `FavorTracking` renders literals — "Aditya Patil", "$10.00", a 2023 date, a Mississippi address — for whatever the member actually requested.
- *Change:* Add `assignPal(palId)` to the store (sets `palId` + `status:'matched'`); call it at `providers.tsx:192`; drive every tracking/active/history field from `activeFavor` + the resolved pal record, falling back to literals only when `activeFavor` is null. This also fixes the list-vs-detail pal mismatch (`history.tsx:157` `s.pals[0]` fabrication).
- *Severity:* High · *Effort:* M · *Category:* Logic/Data

**3. Make the booking happy-path actually advance (Searching → Tracking)**
- *Problem:* `Searching` has no timer and its only CTA is "CHOOSE ANOTHER FAVOR PAL" under "Taking too long?" — the happy path is disguised as an error fallback, so users think the funnel stalled right after paying.
- *Change:* In `checkout.tsx:259` add a `useEffect` that, after a short delay, calls `advanceFavor('matched')` and `navigation.replace('FavorTracking')`. Pixel-identical to `searching.png`; the "Choose another" button stays as the genuine impatient fallback.
- *Severity:* Medium · *Effort:* S · *Category:* UX/Logic

**4. Fix the inverted role-switch label**
- *Problem:* Home and Profile use exact-inverse ternaries, so a pal is told "Switch to be a Favor Pal" on one screen and "Switch to request a favor" on the other — contradictory instructions on the core mode toggle.
- *Change:* Adopt Home's correct logic at `profile.tsx:109`; extract one `roleSwitchLabel(role)` helper consumed by both `dashboard.tsx:131` and `profile.tsx` so they can't drift again.
- *Severity:* Medium · *Effort:* S · *Category:* Logic

**5. Stop lorem-ipsum standing in for the real favor text**
- *Problem:* A blank description silently becomes "Sum dolor sit amet…" and is shown — and saved — as the task the member pays for and the pal receives (`checkout.tsx:42`, `pal.tsx:83`).
- *Change:* Gate `NEXT` on a trimmed non-empty description (`request.tsx` `FavorDescription`/`Negotiate`); replace both Latin fallbacks with honest empty-state copy; call `clearDraft()` after a successful request so stale drafts don't bleed forward.
- *Severity:* Medium · *Effort:* S · *Category:* Content

**6. Add confirmation + refund disclosure to cancellation**
- *Problem:* After money is committed, a single tap on "CANCEL FAVOR" / "CANCEL THIS FAVOR" cancels with no confirm, no refund/fee, no receipt — a top chargeback driver. ("refund"/"cancellation fee" appear nowhere in `src`.)
- *Change:* (S layer) Wrap both handlers in a confirmation stating the outcome, reusing the `profile.tsx:295` Alert pattern. (M layer) Add `computeCancellation(favor)` keyed off status, write a ledger `Transaction`, and surface the result via `InfoModal`.
- *Severity:* High · *Effort:* M (S for the confirm layer) · *Category:* Trust/Safety/Payments

**7. Give pals a real accept/decline lifecycle**
- *Problem:* "Decline" only calls `goBack()` (so Home re-offers the identical job), "View More" is dead text, accept is one irreversible info-less tap, and a pal mid-favor has no resume card (`pal.tsx:86,95-97`, `dashboard.tsx:180-202`).
- *Change:* Add `declineFavor(id)` (removes + surfaces next), give decline equal visual weight, put distance/ETA/member-rating/net-payout on the quick-view, and render a "Resume active favor" card on Home when `activeFavor` exists.
- *Severity:* High · *Effort:* M · *Category:* Logic/Data

**8. Make Profile the account hub and resolve the dual-nav conflict**
- *Problem:* Settings, Help, cards, and Logout live *only* in a drawer that opens *only* from Home; from the Profile tab those are unreachable, and Profile's back chevron opens the drawer (`profile.tsx:116,153-156,449-464`).
- *Change:* Add real Settings/Payment/Help/Logout rows to the Profile tab; drop the back chevron on root tabs; expose the hamburger on Messages/History or remove the redundant drawer duplicates.
- *Severity:* High · *Effort:* M · *Category:* UX/Navigation

**9. Replace Comfortaa display type with the Figma geometric sans**
- *Problem:* `typography.ts:20-25` maps every heading to Comfortaa (and claims it "matches"), but every artboard uses a crisp Poppins/SF-style geometric sans — the single largest systemic visual deviation, on every screen including the 44px wordmark.
- *Change:* Register `@expo-google-fonts/poppins`, repoint `fonts.display`/`displayMedium`, retune line-heights (Poppins runs narrower), and delete the misleading comment. Pair with `ui-system-font-bleed` so the pal/profile screens stop falling back to the OS font.
- *Severity:* High · *Effort:* M · *Category:* UI/Visual

**10. Add report/block/dispute and gate signup on Terms**
- *Problem:* No way to report, block, or dispute anyone or any charge (the MessageThread "…" overflow is dead at `messages.tsx:167`), and the "I agree to Terms" checkbox doesn't gate `SIGNUP` (`authflow.tsx:282`) — no enforceable agreement governs payments.
- *Change:* Wire the overflow to Report/Block actions feeding a mock moderation queue; add a structured "Report an issue / dispute this charge" entry on OrderComplete and FavorHistoryDetail; add `disabled={!agree}` to SIGNUP and record `termsAcceptedAt`/`termsVersion`.
- *Severity:* High · *Effort:* M · *Category:* Trust/Safety

---

## 3. Quick wins (ship first — all S-effort, high value)

- **Auto-advance Searching → Tracking** so the booking happy-path works (`checkout.tsx:259`). *(#3 above)*
- **Fix the inverted role-switch label** (`profile.tsx:109`). *(#4)*
- **Gate NEXT on a non-empty description** to kill the lorem-ipsum task text (`request.tsx`). *(#5)*
- **Disable Pay until a card is selected** — a member can currently pay with `selected === null` after deleting their last card (`checkout.tsx:156,238`).
- **Add a loading/disabled guard to async submit buttons** (`onLogin`/`onSignup`/`onVerify`/`pay`) so double-taps don't fire duplicate requests/charges; reuse the AddCard `saving` pattern.
- **Single spec-correct disabled-button style** (light-gray pill) baked into `Button`; delete the one-off `#C4C4C4` override at `tracking.tsx:247-250`.
- **Relabel the member tracking screen** ("Payout"→"Total Paid", "CALL CLIENT"→"Call your Pal") and stop the member self-completing the favor (`tracking.tsx:104-131`).
- **Remove the redundant dead "home" square** on the floating bar (`dashboard.tsx:177-179,206-208`) or give it an `onPress`.
- **Wire the dead controls**: tracking hamburger → drawer, SHARE → `Share.share`, ACTIVITY → History, "Call About This Favor" → `tel:`/InfoModal (`tracking.tsx:35,137,151`, `pal.tsx:130`).
- **Two stable account rows** ("Payment Methods" / "Payouts & Bank") instead of one "Account" label that silently retargets by role (`profile.tsx:452-460`).
- **Darken placeholder/secondary text to ≥4.5:1** (`components/index.tsx:146`, `payouts.tsx:168,178`) and **enlarge sub-44px touch targets** (stars, eye toggle, the adjacent card edit/delete icons).
- **Copy fixes**: "{n} characters left" instead of "{n} characters max" (`request.tsx:190,297`); context-appropriate support placeholders (`profile.tsx:389`, `history.tsx:315`); "Okay"→"OKAY" to match `card-added.png` (`payment.tsx:166`); standardize back icon to `arrow-back` (`components:215`, `payouts.tsx:55`, `profile.tsx:32`).
- **Per-favor transaction ID** derived from `favor.id` instead of the shared `1234abcde56fg` literal on every receipt (`history.tsx:281`).
- **Derive card brand from the number prefix** instead of always "visa" (`payment.tsx:109`); replace the SVG-able flag emoji that degrades to "US"/tofu on web/Windows (`profile.tsx:83`, `authflow.tsx:246`).
- **Make logout reset session-scoped state** so favor/draft data doesn't bleed into the next login (`store/index.tsx:100`).

---

## 4. Bigger investments (M/L — plan these)

- **Pal vetting & supply-side onboarding (L, launch-blocking):** ID/selfie + background check, service categories/skills, and "go online" gated behind completed payout setup; surface "ID verified / background checked" badges on ProviderResults/Detail and history (`verify-vetting`).
- **Stripe tokenization & Connect (L):** Replace the hand-rolled AddCard (holds PAN/CVC in state) with PaymentSheet/CardField and BankInfo with Connect onboarding, removing the app from PCI scope and adding "Secured by Stripe" signaling (`pci-tokenization`).
- **Status lifecycle + live ETA (M):** Drive a member timeline (Accepted → On the way → Arrived → In progress → Done) off `activeFavor.status`, read the stored `etaWindow`, and gate completion behind a real pal-initiated transition (`logic-status`).
- **Working tipping (M):** Make the "Other" chip take a numeric amount, confirm the incremental charge, and fold tips into the charged total and the pal's earnings ledger (`tip-broken`).
- **Earnings clarity (M):** Add balance / pending / next-payout-date / cadence and replace the per-row "Apple Pay" label with the real bank/Stripe destination (`earnings-info`); make `earnings` stateful so completed jobs actually appear (`pal-success-earnings`).
- **Role as a first-class mode (M):** One shared RoleSwitch component, a role-aware tab set (Earnings becomes a tab for pals), and a switch confirmation (`role-switch-ux`).
- **Editable/collected address (M):** Make ConfirmAddress editable and collect a home/service address at signup so favors stop defaulting to a hardcoded Mississippi address (`confirm-address`).
- **OTP escape hatch (M):** Inline "Incorrect code" on failure, real countdown + resend, back/close, masked destination (`otp-deadend`).
- **Cross-platform confirm primitive (M):** Extend `InfoModal` into a `ConfirmModal`; use it for card delete and the Delete-Account action that currently no-ops on web via `Alert.alert` (`card-delete-confirm`).
- **Real reputation + rebook loop (M):** Per-pal bios/reviews (data already exists, `mockData.ts:40-55`), a "Request again" CTA, and a favorites list (`reputation-rebook`).
- **In-favor safety toolkit (M):** SOS / share-trip / emergency contact on every live-favor screen, plus counterparty rating before meeting (`safety-toolkit`).
- **Pricing & take-rate rebalance (M):** Pal counter-offer or transparent pal-side fee breakdown before ACCEPT, and a take rate nearer category norms (~15-30%) to avoid a decline/churn spiral (`pricing-model`).
- **List virtualization (M):** Convert Messages/History/Earnings/Thread to FlatList/SectionList before real data lands (`perf-lists`).

---

## 5. By theme

**UI & visual**
- Fragmented dark palette — 4-6 near-duplicate hexes per role (blacks, navies, grays, 6 divider values); promote to named tokens in `colors.ts` and consume everywhere (`ui-dark-palette`, M).
- Map rendering swings between a rich stylized backdrop and a clip-art `MapPlaceholder` with a literal red "map" glyph on the core request flow; add a light street variant and hide the glyph when children exist (`ui-map-inconsistent`, M).
- Pal/profile screens bypass the `Txt` type system and render in the OS font; route through tokens (`ui-system-font-bleed`, M).
- Black shadows on dark sheets give no elevation; hand-rolled CTAs drift (radius 14 vs 12) — add an on-dark elevation treatment and reuse shared `Button` (`ui-elevation-geometry`, S).
- Mirror completion screens diverge (40px Comfortaa vs 26px system font) — at minimum route PalFavorComplete's "Rating"/feedback through tokens (`ui-completion-divergence`, S).
- Inconsistent tab-root chrome; keep Figma-exact titles but fix the shared fake data (`ui-tab-chrome`, S).

**UX & navigation**
- One "Account" label retargets to Payment vs StripeOnboarding by a toggle set elsewhere (`ia-account-label`, S).
- Two stacked bottom bars on Home with an inert red home button (`home-double-bar`, S).
- Decorative nav/contact controls that silently fail teach users the UI is unreliable (`dead-controls`, S).
- Payment screen has a dead "Payment History" row and an "edit" pencil that opens a blank AddCard instead of editing (`payment-screen`, M).
- Forced single-role choice + hard signup wall before any value is shown; at minimum make the Welcome role choice actually carry through (`onboarding-wall`, S).

**Logic & data**
- Half the `FavorStatus` lifecycle is dead and the member self-completes a favor (`logic-status`, M).
- Money captured before a pal is confirmed (`pay-before-match`, S).
- List-vs-detail show different fabricated pals for one record (`history-pal`, S).
- Availability status is written but never read — Home always says "YOU'RE ONLINE" and offline pals still get offered work (`pal-availability`, M).
- "Change Password" collects passwords that `onSave` silently drops; blank email/phone saves persist (`change-password`, M).

**Accessibility**
- Custom toggles/checkboxes/radios never expose role or selected state to assistive tech (`a11y-controls-state`, M) — fails WCAG 1.4.1.
- Gray placeholder/tertiary text fails contrast and is sometimes the only label (`a11y-contrast-text`, S).
- Multiple targets below 44×44, with adjacent card edit/delete icons (`a11y-touch-targets`, S).
- Status badges/dots/links communicate state by color alone at sub-AA contrast (`a11y-color-only`, S).

**Content**
- Member tracking screen wears pal-side labels ("CALL CLIENT", "Payout", "I'M HERE") (`track-02`, S).
- AddCard ships an expired default expiry and Zip = "Chicago" (`addcard-defaults`, S).
- Counter reads "characters max" while counting down; support box reuses the favor-description placeholder; button casing flip-flops "SUBMIT"/"Submit" (`content-char-counter`, `content-support-placeholder`, `content-button-casing` — all S).

**Performance**
- `Dimensions` captured once at module load isn't responsive to web resize/rotation; use `useWindowDimensions` + flex (`perf-dimensions`, S).
- Negotiate slider re-renders the whole screen (incl. a TextInput) each drag tick; isolate into a memoized subcomponent (`perf-slider`, S).
- Oversized/duplicate PNGs — `tier-big.png` is ~20× its siblings for an identical 60px slot, and celebration.png == launch-people.png byte-for-byte (`perf-assets`, S).

**Trust / Safety / Payments**
- Payout setup over-claims (pre-connected "Stripe *1234", pre-filled fake bank) and under-delivers (SAVE with no validation/persistence) (`payout-setup`, S).
- Dead Privacy/Terms links in Settings (`profile.tsx:323-324`); pair with the Terms gate in #10 (`terms-legal`, M).
- Personal phone and exact home address exposed to unvetted strangers with no masking or approximate-location-until-matched (`privacy-masking`, M).

**Product / Growth**
- Zero-supply is discovered only at the bottom of a 5-screen funnel with no recovery; plot real pal pins + an "N nearby" count and make the dead-end actionable (`zero-supply`, M).
- Tiers have no examples and payment precedes seeing any pal; add tier examples and a "you'll choose your Pal next" reassurance (`tier-guidance`, S).
- Scheduling is stubbed to NOW-only with a mislabeled "Where to?" pill; relabel to "When?" and persist `scheduledFor`, or remove the row (`scheduling-stub`, S).
- Notification model exists but nothing renders it; either surface an inbox or remove the dead code/silent Settings toggle (`notifications`, S).
- No referral/first-favor incentive and the one share affordance is dead; wire SHARE and backlog a two-sided referral (`growth-loops`, S).

---

## 6. Suggested sequencing

**Now (this sprint — make the spine real + clear the cheapest blockers).** Stand up the canonical money model (#1) and wire tracking/history off `activeFavor` + the booked pal (#2), since almost everything downstream depends on real state. In parallel, batch the highest-value S-effort fixes: auto-advance Searching (#3), inverted label (#4), lorem-ipsum gate (#5), pay-without-card, async double-tap guard, disabled-button spec, dead-control wiring, and the placeholder/counter/casing copy fixes. These are low-risk, Figma-safe, and remove the most visible "this feels broken" signals.

**Next (1-2 sprints — trust/safety to clear a real-money bar).** Cancellation confirm + refund ledger (#6), pal accept/decline lifecycle (#7), Profile-as-account-hub nav cleanup (#8), the Comfortaa→Poppins type swap with the system-font cleanup (#9), report/block/dispute + Terms gate (#10), working tips, status lifecycle + live ETA, OTP escape hatch, editable address, and the cross-platform confirm primitive. Fold in the accessibility set (control state, contrast, touch targets) here since it touches shared components.

**Later (planning required — launch-grade marketplace mechanics).** Pal vetting/background checks (L), Stripe tokenization + Connect (L), in-favor safety toolkit, number masking / progressive address disclosure, pricing & take-rate rebalance with pal-side transparency, earnings balance/cadence, real per-pal reputation + rebook/favorites, zero-supply liquidity recovery, list virtualization, and the referral/growth loop. These are the items an insurer, payments partner, or app-store review will gate on before a real two-sided launch.