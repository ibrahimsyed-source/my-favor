# v.2 Fidelity Audit — canvas-verified specs & work queue

Source of truth: the **User App v.2** (label 125:8366) and **Provider App v.2** (label 181:11602)
sections of the Mockup page, fileKey `L8LkpFZh6PXFdJVMTH33ff`, surveyed frame-by-frame in Figma web
(2026-07-02). REST API rate-limited; all node IDs below verified via canvas URLs.
Status: `MATCHES` (ship as-is) · `DRIFT` (targeted fixes listed) · `REBUILD` (rewrite to spec).

Shared v.2 language: Poppins everywhere (400/500/600). Ink `#0D0A0A`. Red pins/tab accent `#D40000`.
Buttons: black 48h r8, white Poppins Medium ~15-16 uppercase. White modal card: 351w r16, title
Poppins Medium 24/36, body 16/24, over rgba(0,0,0,0.5) scrim; primary black btn, secondary gray
`#E5E5E5` btn (label "CLOSE"). Frames are 414w (some taller than 896 = scrollable).

## USER APP v.2

### Row: Launch/Welcome — onboarding.tsx — MATCHES (verify copy/dots only)
- Launch `125:8371`: red F tile logo, two illustrated people, "My Favor", 3 page dots.
- Welcome `125:8386`: mowing-man illustration, "Ask for all the favors you need, or earn $$ doing
  favors for others.", buttons ASK A FAVOR (black) / BE A FAVOR PAL (light gray), dots.

### Row: Register — authflow.tsx / legal.tsx / notifications.tsx — DRIFT
- Sign Up / Login `125:8404`: logo + "My Favor", SHARE THIS APP (outlined), SIGNUP (gray), LOGIN (black), dots. MATCHES.
- Sign Up Empty/Filled/Terms-Filled `125:8421/8550/8593`: avatar+red plus, First/Last, Email,
  Phone (+1 flag), Set Password, 2 checkboxes, SIGNUP. MATCHES (app verified live).
- **DRIFT → OtpVerify: design is a 4-DIGIT code** ("Please enter 4 digit code to verify your
  account.", 4 boxes, "Code expires in 00:43", Resend, VERIFY) — app has 6 boxes/copy. Server must
  issue 4-digit OTPs (server change: OTP generator + validation length).
- **DRIFT → OTP success**: design = green check circle + "Account Verified" + CONTINUE (black,
  full-width) — app copy differs ("Success! Your account has been verified successfully.").
- Notifications Modal `125:8532`: matches app's permission dialog.
- Terms `125:8639` / Privacy `125:8663`: blue masthead ("Terms and Conditions for MyFavor App",
  `#0452A5`-ish blue + navy "English" strip). legal.tsx already follows this. MATCHES.

### Row: Dashboard — dashboard.tsx / navigation / profile.tsx / payment.tsx / history.tsx — DRIFT/REBUILT
- **Dashboard Main v2 `1660:15783` (437×1232)** — REBUILT this session. Remaining diffs:
  hamburger = white bars, NO tile behind it (remove `#221E1E` tile); verify tile row/labels
  ("Tiny/Small/Big/Huge" + $20/$50/$100/$150 prices, white cards, soft shadow); NOW pill inside
  search field right; address "2099 Woodvine Rd, Lorman"; light map w/ 6 red person-pins + soft
  gray radius circle + avatar-in-red-ring pin.
- **Tab bar (bottom group 414×88)** — REBUILT: black bar; HOME = red rounded-square tile (~41pt,
  white house outline) + red label; ACCOUNT person; ACTIVITY history-clock + red badge; labels
  Poppins Medium 8; white home-indicator line. NOTE: request-flow screens (ConfirmAddress
  `125:11243`) show a 2-item bar variant: HOME + REQUEST A FAVOR (red F icon + red label).
- Favor Pal Modal v2 `130:9983`: white card "Be A Favor Pal / Earn some cash while doing favors
  for others! / Use the switch button on the dashboard to become a Favor Pal" + embedded
  "Switch to be a Favor Pal" pill w/ toggle. In providers.tsx — verify copy + pill-in-modal.
- Side Drawer `125:7342` (light): big avatar, name, "View Profile", items Favor History/Help/
  Settings/Payment, Logout bottom. profile.tsx has it. Check: NO Messages item.
- Help `125:7401` / Help-Success `125:7430`: "Need help or have a question?" + "Send us a message"
  field (700 chars max) + SUBMIT; success = green check + "You've succesfully submitted your
  question!" (sic) + CONTINUE.
- Settings-Revised `125:7465`: title "Profile", avatar+name+lorem bio, "Switch to be a favor pal"
  pill, stats row 129 Total Favors / ★4.9 Rating / 2.5 Years, rows Email/Phone/Home/Password
  (Change Password), black DELETE MY ACCOUNT. Delete confirm `1196:18885`: white card
  "DELETE MY ACCOUNT" + explanation (45 days), checkbox "Yes, I want to permanently delete...",
  DELETE MY ACCOUNT black btn.
- Edit Profile `125:7568` (414×1522): avatar+pencil, First/Last, Bio (gray filled), Email, Phone,
  Home Address, City/State, Zip, SAVE; then Current/New Password + second SAVE. Success modal
  `125:7632`: "Success! / User Profile has been Successfully updated / OK". profile.tsx close —
  verify layout order + copy.
- Payment `125:7756` list: "Payment Methods" rows — Visa *4242 (red minus), + Add Payment Method,
  Payment History. Empty `1690:15798`: "No Information To Be Displayed". Choose method `125:7830`:
  "This will be used for ride payments, but only after the ride is done" (sic) + "Credit or Debit
  Card >" row. Device verify `1357:17714`: red F + "Verify Device / Before we can add a card
  payment we need to verify your device." + VERIFY MY DEVICE. Code `1357:17757`: "Verification
  Code / We sent a code to your device. Please enter the code here." + 4 boxes + Resend + VERIFY.
  Card form `1449:17701` (414×1158): "Payment Information" + Name/Card Number/Expiration/CVC/
  Address 1/2/City/State/Zip/Country + SUBMIT. Add success `1449:17785`: "Success / You have
  successfully added a card payment! / CLOSE". Card Added (edit) `125:7999`: "Card Added / You
  have successfully added your Bank / Card information / OKAY". payment.tsx implements all —
  verify visual details/copy per above.
- Payment History `125:8089` ("Transactions" title): month sections (March 2021...), rows: icon,
  date, status chip (Incomplete=red flag, Completed=green, In Progress=yellow, Cancelled=red),
  $amount, chevron. Detail completed `125:7216` (414×1618): favor header (Tiny Favor + datetime),
  Description, Address, Favor Pal (Fabrizio ★4.9, 3 Miles away, 92% Reliable, 100% Positive
  Reviews), Payment (+$20.00, Date&Time, Transaction ID), Feedback (Rating stars + Comment), then
  "Need help or have a question with this favor? Send us a message." + field + SEND. Incomplete
  `880:18160`: adds tip chips $2/$4/$6/Other + feedback + MARK FAVOR COMPLETE. history.tsx —
  verify against this.

### Row: Dashboard modals (fire in-flow) — checkout.tsx / tracking.tsx / notifications.tsx — DRIFT
- Match Alert `125:10778`: **"Fabrizio has accepted your favor!" / "You favor pal is on their
  way." / OKAY** over blurred map. App shows "Favor matched! / X accepted your favor." → fix copy
  to "{firstName} has accepted your favor!" + "Your favor pal is on their way." (fixing design typo).
- Immediate Book `125:10708`: "You have asked a favor from Fabrizio / Please wait while we
  confirm. / Taking too long? / CHOOSE ANOTHER FAVOR PAL". MATCHES (Searching).
- Scheduled request modal: "YOUR FAVOR HAS BEEN REQUESTED / [Feb 16, 12:00PM ASAP chip] / Please
  wait while we search for a favor pal near you!" — over Favor Summary. App's scheduled state
  differs → align copy.
- No Pal `125:11190`: "No Favor Pal Available / We are sorry that there are no FavorPals in your
  area at the moment.  Please try again later. / CLOSE". Verify copy.
- Reblast `149:9998`: "We are still looking for a Favor Pal near you / Taking too long? / CANCEL
  FAVOR" over tracking. Cancelled w/o charge `149:10128`: "Cancelled. / REQUEST ANOTHER FAVOR".
- Cancel confirm (**"Cancellation Alert" `125:9157`**): "Cancel favor? / If you decide to cancel
  the request after 5minutes, you will be automatically charged a cancellation fee. / Service and
  Transaction Fee are non-refundable. / NO (gray) | YES (black)" — TWO half-width buttons.
  App's cancel modal differs ("Are you sure you want to cancel?" is the OTHER frame): Cancel Favor
  Modal: "Are you sure you want to cancel? / You will be charged the full amount if you cancel
  this favor. / CANCEL FAVOR". Map both states correctly in tracking.tsx.
- Cancelled (charged) `125:10210`: "Cancelled. / Your account has been charged. / REQUEST ANOTHER FAVOR".
- Repost `125:10601`: "Your Favor has been cancelled by your favor pal. / REPOST FAVOR / CLOSE".
- Pal Arrived `125:10406`: "Your Favor Pal has arrived. / OK".

### Row: Favor flow — request.tsx / checkout.tsx / providers.tsx / tracking.tsx — mostly MATCHES
- Favor Description `125:10981`: thumb+Tiny $20+SELECTED chip, "What is the favor?", field, NEXT. MATCHES.
- Negotiate `130:10114`: "Negotiate Your Favor", "What is the favor?", slider 0–24hrs w/ $-bubble,
  describe field, NEXT. MATCHES-ish; verify slider look.
- Confirm Address `125:11243`: white top card "Location of your favor" + address row with X +
  CONFIRM ADDRESS; map fills below w/ radius+avatar+pins; **2-item tab bar HOME | REQUEST A FAVOR**.
- Favor Summary `125:10996` + Negotiate variant: thumb, "Tiny Favor/2hrs x $50" + $20/$100,
  Service Fee @ 2.9% $0.61, Transaction Fee $0.30, Total Cost $20.91, Description, Address,
  REQUEST FAVOR NOW. MATCHES (app verified live).
- Select payment `125:11045`: sheet w/ X + Edit, "+Add" tile, VISA •4242 green check, blue
  "Pay US$20.91" + lock. MATCHES (app verified live).
- Provider Results `125:8687`: blurred map + sheet "Click on a Favor Pal near you to do your
  favor!" + avatar row (Fabrizio 4.9/John D. 4.5/May S. 4.5/Love E. 4.3 + distances). Check app.
- Provider Detail `125:8762`: sheet — avatar, Fabrizio L., ★4.9, 1 mile away, 92% Reliable, 100%
  Positive Reviews, "How I can help?" bio, testimonial quote + attribution.
- Favor Pal Profile `125:11283`: full screen — avatar, name, distance, stats 129/4.9/2.5, Reviews
  list (name + 5 stars + text + date).
- Favor Booked minimized `125:8826`: light map, red route + car icon, chips "N Flagler Dr." /
  "13 mins ETA" / "2nd St.", bottom mini card: avatar, Fabrizio L. ★4.9, "11:50 - 12:10", "1 mile
  away". Expanded `125:8968`: sheet "Favor Booked" + pal row + big "11:50 - 12:10PM" + [Arrival
  Window] chip + bell note "You'll be notified when your favor pal is on the way" + Call your
  Favor Pal / Message your Favor Pal rows + CANCEL THIS FAVOR. tracking.tsx close — verify.
- Favor Arrived `125:9610` + Message variant `125:9354`: sheet "Your Favor Pal has arrived." +
  pal row (0 miles away) + Call / Message rows (message row red w/ badge in Message variant).
- Order Complete `125:9770` (414×1015): "Thank You! / Favor Pal has completedyour favor." (sic)
  + celebration illustration + Rating stars + "Great Pal? Consider giving a tip!" + chips
  $2.00/$4.00/$6.00/Other + Feedback field ("Please tell us about your experience", 700 chars)
  + SUBMIT FEEDBACK (disabled until input). Tip Other `125:9841`: "$ Other..." input appears.
  MATCHES-ish; verify chips/disabled state/copy.

### Row: Login/Forgot — authflow.tsx — DRIFT (4-digit only)
- Login `125:11391`/Filled: Email Address + Password (eye) + "Forgot Password" + LOGIN. MATCHES.
- Forgot Password `125:11435`/filled: "Enter Email to reset password" + Email + SUBMIT. MATCHES.
- **Enter Code `125:11525`/Filled: "Please enter 4 digit code to reset password" — 4 boxes.** App = 6.
- New Password `125:11455`/Filled: "Enter your new password" + Enter New/Confirm New + SUBMIT. MATCHES.
- Reset Success `125:11567`: green check + "You've successfully updated your password." + LOGIN
  TO YOUR ACCOUNT. App shows modal — design is full screen. DRIFT.

### Row: Messages — messages.tsx — DRIFT (inbox theme)
- Messages Detail `125:11582` (light chat): back + avatar + "John" + ⋯; bubbles gray-left /
  light-right with small avatars; "Type something..." pill + emoji + send. MessageThread matches.
- **Messages INBOX: app renders DARK (#0C0C0C) — no dark inbox frame exists on the user canvas.
  Restyle inbox LIGHT to match the v.2 light chat language.**

## PROVIDER APP v.2 (pal mode — pal.tsx / payouts.tsx / profile-side reuse) — REBUILD (dark, navy sheets)

Palette verified: page fill `#0D0A0A`; sheets/modals dark navy (sample `#252A38`-ish); white
primary buttons (black label); red accent `#ED1C24`/`#D40000`; white text, gray secondary.

### Row: Launch/Welcome + Register — same as user side (shared screens OK). Provider signup
  differs: LOGIN button before SIGNUP on Sign Up/Login `181:9613`; single checkbox "I agree to
  Terms & Conditions"; Terms = plain white "My Favor Terms & Conditons of Service" + PROCEED
  (`181:9921`), no blue masthead. 4-digit verification, "Account Verified" + CONTINUE.
- Extra: background-check "Driver Information" screen (X close, "Personal Information" + legal
  first/middle/last name, SSN 3-part, DOB) → Vetting scaffold restyle. Lock-screen favor-blast
  notification frame = push mock (skip). "Driver Requirements / Finish applying / 5 items
  required" checklist screen exists (Approval pending flow).
- Dashboard - Approval pending. (frame exists — pal home gated until vetting approved.)

### Row: Dashboard (dark) — REBUILD pal.tsx home + payouts + dark profile screens
- **Dashboard Main v2 (provider)**: DARK map full-bleed, white hamburger bars (no tile),
  white pill "Switch to request a favor" (toggle off), red price pins ($20/$30/$50/$100/$150),
  avatar in red ring at center of red-tinted radius circle, dark 3-tab bar (HOME red tile /
  ACCOUNT / ACTIVITY). This is the pal-mode Home (the app's PRE-rebuild home was this design —
  resurrect it for pal mode, keep member Home as rebuilt).
- **Favor Blast sheet** (Dashboard-Main v Favor Blast): bottom navy sheet: "Tiny Favor $20" +
  requester (Aditya Patil + lorem + datetime + View More) + white ACCEPT btn. Expanded variant
  exists. This replaces the current BrowseFavors card list as the incoming-favor UX (keep Browse
  as the board behind it).
- Favor Member Modal v2 (`181:10516`): navy "Request A Favor / Request favors from other Favor
  Pals! Notifications may include alerts, sounds, and icon badges. These can be configured in
  Settings." + white pill "Switch to request a favor" w/ toggle.
- Card Added - Modal (dark): "Card Added / You have successfully added your Bank / Card
  information / OKAY" (white btn on navy card).
- **Side Drawer (dark)**: avatar, Anton, View Profile, red "● Set Status" row, Favor History,
  Help, Settings, Account, Logout. Set Status popup `181:10437`: navy card "Set Status" +
  ● Online (green) / Invisible / Offline. (payouts/profile: SetStatus exists — restyle navy.)
- **Settings/Profile (dark)**: same structure as user Settings-Revised but dark: "Switch to
  request a favor" pill, stats, Email/Phone/Home/Password rows, red Set Status under name.
- **Edit Profile (dark)** — dark inputs (`#1C2331`-ish fills), same fields incl. password saves.
- **Accounts `181:10039` (dark)**: "Accounts" title, "Bank Information" section: Bank >, + Add
  Payment Method >, Earning History >, then radio Savings account ◉ / Checking account ○.
  (payouts.tsx StripeOnboarding → restyle to this.)
- **Earning History (dark)**: month sections, rows: icon + date + "Apple Pay" sub + $amount +
  chevron. Detailed View (dark): favor detail w/ Description/Address/Favor Member/Payment/
  Feedback+Rating/Comment. (payouts.tsx Earnings → restyle; keep cash-out as app addition.)

### Row: Favor flow (dark) — pal.tsx — REBUILD to navy-sheet language
- Favor Quick View (`181:10645`): blurred dark bg + navy sheet "Tiny Favor $20" + requester info
  + ACCEPT (white); bottom bar shows HOME + red-F REQUEST A FAVOR variant.
- Favor Booked (`181:10690`): dark map + navy banner "↑ Head west on 2nd St." + sheet:
  "Favor Booked" / Stephanie (Tiny Favor, 3 miles away) / "11:50 - 12:10PM" + Arrival Window chip
  / "Call About This Favor >" / red "Message Favor Member" / I AM HERE (white) / CANCEL THIS FAVOR.
- Favor In Progress - Minimized: dark map + red route + car + locate FAB; bottom mini: Stephanie,
  11:50 - 12:10, 1 mile away + MARK AS DONE (white). En-route variants exist.
- Arrived (`181:10783`): banner "You have arrived." + pin; mini card 0 mile away + MARK AS DONE.
- Arrive Modal: navy "You have arrived to your destination / Notify Stephanie that you have
  arrived. / I AM HERE".
- Favor Success: black screen, green check, "You just got paid!", ADD FEEDBACK (white) +
  FIND ANOTHER FAVOR (dark). 
- Favor Complete (`181:11282`): "Thank You!" + celebration illustration + Rating stars + "Tell us
  about your experience" navy field + SUBMIT FEEDBACK (white).
- Cancel Favor Modal (pal): "Are you sure you want to cancel? / You will not receive payment for
  this favor if you cancel. / AGREE". Cancellation Confirmed: "Cancelled. / Notification of
  cancelled favor was sent to favor member. / FIND ANOTHER FAVOR".
- Feedback Submitted Success frames exist (green check variant).

### Row: Login/Forgot (provider) — same as user but with logo header on Login. Messages row: one
  dark chat frame (capture when fixing).

## Priority queue (Phase 3)
1. Home polish (remove hamburger tile) + Favor Pal Modal + drawer check. [dashboard/providers/profile]
2. 4-digit OTP end-to-end (server gen/validate + both OtpVerify UIs + payment device-verify boxes
   already 4) + "Account Verified" success + reset-success full screen. [server/authflow]
3. Match-alert & cancel/cancelled modal copy set in tracking/checkout per specs above.
4. Messages inbox → light.
5. Provider section rebuild: pal home (dark map + price pins + blast sheet) → pal favor flow
   (booked/in-progress/arrived/success/complete + modals) → Accounts/Earning History dark →
   dark drawer/Set Status/Settings/Edit Profile → provider auth deltas (LOGIN-first, single
   checkbox, plain terms, Driver Information vetting).
6. History/payment detail polish per specs; Order Complete chips/disabled state.
