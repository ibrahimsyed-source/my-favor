export const meta = {
  name: 'my-favor-build',
  description: 'Build all 13 My Favor screen modules pixel-faithfully from Figma references',
  phases: [{ title: 'Build', detail: 'one agent per feature module, parallel' }],
}

const ROOT = 'C:/Users/Ibrahim Syed/my-favor'
const REF = ROOT + '/figma-ref'
const FILEKEY = 'L8LkpFZh6PXFdJVMTH33ff'

const MODULES = [
  {
    key: 'onboarding', file: 'src/screens/onboarding.tsx',
    note: 'Onboarding carousel screens. White bg. Pager dots at bottom (3 dots). Use the real logo asset at assets/img/logo.png. Export hero illustrations you cannot draw (the lawnmower person on Welcome, the two characters on Launch) via download_figma_images into assets/img/onboarding/.',
    screens: [
      { name: 'Launch', route: 'Launch', node: '181:9575', ref: 'launch.png', note: 'Red f logo square (assets/img/logo.png) centered upper, two cartoon characters illustration, "My Favor" wordmark (Comfortaa bold) below, pager dots (1st active). Splash feel. The stub already links Launch to Welcome via a Get Started action.' },
      { name: 'Welcome', route: 'Welcome', node: '181:9594', ref: 'welcome.png', note: 'Lawnmower-person illustration top. Headline "Ask for all the favors you need, or earn $$ doing favors for others." with the two dollar signs colored GREEN (theme.success). Two buttons: "ASK A FAVOR" (primary black, calls setRole member) and "BE A FAVOR PAL" (secondary gray, calls setRole pal) side by side; both navigate to SignupLogin. Pager dots (2nd active).' },
      { name: 'SignupLogin', route: 'SignupLogin', node: '181:9613', ref: 'signup-login.png', note: 'Logo + "My Favor" wordmark centered. Two stacked buttons near bottom: "LOGIN" (primary black) to Login, "SIGNUP" (secondary gray) to Signup. Pager dots (3rd active).' },
    ],
  },
  {
    key: 'authflow', file: 'src/screens/authflow.tsx',
    note: 'Auth forms. White bg, TopBar with back chevron + centered title. Filled gray Field inputs with bold labels.',
    screens: [
      { name: 'Login', route: 'Login', node: '97:6819', ref: 'login.png', note: 'Title "Login to your account". Email + Password fields (password has eye toggle). A "Forgot Password?" link (theme.link) navigates to ForgotPassword. Big black "LOGIN" button calls useStore().login(email,password) then navigation.navigate("Tabs").' },
      { name: 'ForgotPassword', route: 'ForgotPassword', node: '97:6858', ref: 'forgot-password.png', note: 'Instruction text, single Email field, black "SUBMIT" navigates to NewPassword.' },
      { name: 'NewPassword', route: 'NewPassword', node: '97:6878', ref: 'new-password.png', note: 'New Password + Confirm/Re-type fields (eye toggles), black "SUBMIT"/"submit" navigates to Login.' },
      { name: 'Signup', route: 'Signup', node: '181:9630', ref: 'signup-empty.png', note: 'Avatar circle with red plus badge at top. First Name + Last Name side by side. Email Address. Phone Number with US flag emoji + "+1" dropdown + placeholder "0000 - 000 - 000". Set Password with eye. Checkbox + "I agree to Terms & Conditions" (the Terms & Conditions tail bold). Bottom black "SIGNUP" calls useStore().signup({firstName,lastName,email,phone,password}) then navigate("OtpVerify").' },
      { name: 'OtpVerify', route: 'OtpVerify', node: '181:9767', ref: 'signup-otp.png', note: 'Centered white rounded modal card over a dim background. Title "Verification" (Comfortaa). Body "Please enter 4 digit code to verify your account." then "Code expires in 00:43". Four large gray code boxes (single-digit TextInputs that auto-advance). A line that reads did not receive a code, plus bold "Resend". Black "VERIFY" calls useStore().verifyOtp(code) then navigate("Tabs").' },
    ],
  },
  {
    key: 'dashboard', file: 'src/screens/dashboard.tsx',
    note: 'Home tab = full-bleed MAP screen. Use <MapPlaceholder> filling the screen (dark map look). Role-aware via useStore().user.role.',
    screens: [
      { name: 'Home', route: 'Home', node: '97:4774', ref: 'dashboard.png', note: 'Full-screen map. Top-left rounded white hamburger button navigates to "SideDrawer". Top-center white pill toggle showing "Switch to request a favor" (when role is pal) / "Switch to be a Favor Pal" (when role is member) that calls setRole to flip. A red translucent radius circle with the user avatar pin near center. Bottom bar: red home icon + (member) a black "REQUEST A FAVOR" action that navigates to "SelectFavor"; (pal) when useStore().incomingFavors[0] exists show a card to view it that navigates to "PalFavorDetail" with favorId. Keep it clean and faithful.' },
    ],
  },
  {
    key: 'request', file: 'src/screens/request.tsx',
    note: 'Member request-a-favor flow. White bg, TopBar back+title. Use setDraft to accumulate the favor draft.',
    screens: [
      { name: 'SelectFavor', route: 'SelectFavor', node: '100:12594', ref: 'select-favor.png', note: 'Heading "How big is the favor?" + subtitle "Choose the cost of favor based on the amount of effort required." Selectable tier cards: Tiny $20.00, Small $50.00, Big $100.00, Huge $150.00, plus a Custom "$ Set your price" option. Selected card highlighted. Black "SELECT"/"next" sets draft tier+price then navigates to FavorDescription. FAVOR_TIERS in ../types has the prices.' },
      { name: 'FavorDescription', route: 'FavorDescription', node: '100:12728', ref: 'favor-description.png', note: 'Heading "Describe the favor you need." Multiline Field (maxLength 250) with a "250 characters max." counter. An "Add Image" tile (expo-image-picker optional). Black "next" sets draft.description then navigates to ConfirmAddress.' },
      { name: 'Negotiate', route: 'Negotiate', node: '130:10114', ref: 'negotiate.png', note: 'Time-based pricing. Use @react-native-community/slider (0 to 24 hrs). Show "Use the slider below to calculate your favor price based on the time you need." Show computed e.g. "2hrs x $50 = $100". Black next sets draft.hours/price then navigates to FavorSummary.' },
      { name: 'ConfirmAddress', route: 'ConfirmAddress', node: '1:20452', ref: 'confirm-address.png', note: 'Map (MapPlaceholder) with "Location of your favor", an address line (e.g. "2099 Woodvine Rd, Lorman..."), a "Where to?" / time "NOW" control. Black "Confirm Address" sets draft.location then navigates to FavorSummary.' },
    ],
  },
  {
    key: 'checkout', file: 'src/screens/checkout.tsx',
    note: 'Member checkout. Reads draftFavor + computeFees. Searching is a modal-like screen.',
    screens: [
      { name: 'FavorSummary', route: 'FavorSummary', node: '100:12743', ref: 'favor-summary.png', note: 'Cost breakdown card: base (e.g. "Tiny $20"), "Service Fee @ 2.9% $0.61", "Transaction Fee $0.30", "Total Cost $20.91" (use computeFees(base)). Description + Address sections. Black "pay now"/"REQUEST FAVOR" navigates to SelectPayment.' },
      { name: 'SelectPayment', route: 'SelectPayment', node: '100:12792', ref: 'select-payment.png', note: 'Choose payment method: list saved cards from useStore().cards (radio select), a "+ Add" card row, and an Apple Pay row. Black "Pay US$20.91" calls requestFavor() then navigates to Searching.' },
      { name: 'Searching', route: 'Searching', node: '100:12455', ref: 'searching.png', note: 'Centered modal card: "YOUR FAVOR HAS BEEN REQUESTED" + "Please wait while we search for a favor pal near you!" with a spinner. Provide a "View Pals" action that navigates to ProviderResults.' },
    ],
  },
  {
    key: 'providers', file: 'src/screens/providers.tsx',
    note: 'Map + bottom-sheet pal discovery. Use useStore().pals.',
    screens: [
      { name: 'ProviderResults', route: 'ProviderResults', node: '125:8687', ref: 'provider-results.png', note: 'Map (MapPlaceholder) with red pins. White rounded bottom sheet (drag handle) titled "Click on a Favor Pal near you to do your favor!". Horizontal scroll of pal cards (Avatar, name e.g. "Fabrizio L.", star+rating, "1 mile away") from useStore().pals; tapping a card navigates to ProviderDetail with palId.' },
      { name: 'ProviderDetail', route: 'ProviderDetail', node: '125:8762', ref: 'provider-detail.png', note: 'Blurred map top, white bottom-sheet card (drag handle): Avatar left, name bold + star rating top-right, "1 mile away", a reliable percentage line, a positive reviews line, a "How can help?" heading + bio, then a Reviews section (italic quote + reviewer name and date) from useStore() seed reviews. Black "book now"/"BOOK FAVOR PAL" navigates to FavorTracking. Pull the pal by route.params.palId from useStore().pals.' },
    ],
  },
  {
    key: 'tracking', file: 'src/screens/tracking.tsx',
    note: 'Member live tracking + completion. favor-booked-member is a DARK map bottom-sheet.',
    screens: [
      { name: 'FavorTracking', route: 'FavorTracking', node: '523:17533', ref: 'favor-booked-member.png', note: 'Dark map screen. Top dark pill nav banner. Dark bottom sheet "Favor Booked": pal avatar with red badge, name (e.g. "Fabrizio L."), tier, "1 mile away", big arrival window "11:50 - 12:10PM" + "Arrival Window" pill, rows "Call your Favor Pal" / "Message your Favor Pal" (red icons), and "cancel this favor". Provide a "Complete" action that navigates to OrderComplete. Use white/ghost buttons on the dark sheet.' },
      { name: 'OrderComplete', route: 'OrderComplete', node: '100:11517', ref: 'order-complete.png', note: '"Thank You! Favor Pal has completed your favor." Star rating (StarRating onChange), feedback Field (700 char max), tipping options ($2 / $4 / $6 / Other) under "Great Pal? Consider giving a tip!". Black submit calls useStore().rateFavor(rating,feedback,tip) then navigates to "Tabs".' },
    ],
  },
  {
    key: 'pal', file: 'src/screens/pal.tsx',
    note: 'Favor Pal (provider) active-favor flow. Dark map sheets + some white screens. Uses incomingFavors/activeFavor/acceptFavor/advanceFavor.',
    screens: [
      { name: 'PalFavorDetail', route: 'PalFavorDetail', node: '97:5700', ref: 'pal-quickview.png', note: 'Incoming favor quick view: requester name, favor type + payout, schedule, description, "View More". Black "ACCEPT" calls acceptFavor(favorId) then navigates to PalFavorInProgress; a "decline this favor" secondary action.' },
      { name: 'PalFavorInProgress', route: 'PalFavorInProgress', node: '523:17839', ref: 'pal-inprogress.png', note: '"You are currently doing a favor." dark sheet, "MARK FAVOR IN PROGRESS". Provide a "Navigate" action that navigates to Navigation.' },
      { name: 'Navigation', route: 'Navigation', node: '181:10690', ref: 'favor-booked.png', note: 'Dark map with top pill nav banner "Head west on 2nd St." (up arrow). Dark bottom sheet: client avatar with red badge "2", name "Stephanie", tier, "3 miles away", "11:50 - 12:10PM" + Arrival Window pill, rows "Call About This Favor", "Message Favor Member" (red), a white "I AM HERE" button (calls advanceFavor("arrived")) and a black "CANCEL THIS FAVOR". "I AM HERE" navigates to PalFavorComplete.' },
      { name: 'PalFavorComplete', route: 'PalFavorComplete', node: '97:6337', ref: 'pal-complete.png', note: 'Mark favor done (with optional proof image), then a success state ("You just got paid! Thank You!") + leave feedback (use pal-success.png as the success/feedback reference). Black "MARK AS DONE" / "SUBMIT FEEDBACK" navigates to "Tabs". You may reference both pal-complete.png and pal-success.png.' },
    ],
  },
  {
    key: 'payouts', file: 'src/screens/payouts.tsx',
    note: 'Provider payouts/earnings. White bg, TopBar.',
    screens: [
      { name: 'Earnings', route: 'Earnings', node: '97:4489', ref: 'earnings.png', note: 'Earning History: total balance header, list grouped by month with rows (e.g. "Apple Pay $33.00") from useStore().earnings. A "Set Up Payouts" action navigates to StripeOnboarding.' },
      { name: 'StripeOnboarding', route: 'StripeOnboarding', node: '2:4379', ref: 'stripe-account.png', note: 'Account Detail / Stripe account setup screen with a "Set Up Account" CTA that navigates to BankInfo. Keep Stripe branding subtle.' },
      { name: 'BankInfo', route: 'BankInfo', node: '97:4972', ref: 'bank-info.png', note: 'Bank Information form: Account Name, Bank Name, Routing Number, Account Number, Confirm Account Number, and a Savings/Checking account-type selector. Black save navigates to "Tabs".' },
    ],
  },
  {
    key: 'messages', file: 'src/screens/messages.tsx',
    note: 'Messaging. Messages list has no dedicated frame; build a clean iOS-style list from useStore().threads matching the app aesthetic; MessageThread matches message-thread.png.',
    screens: [
      { name: 'Messages', route: 'Messages', node: '97:7340', ref: 'message-thread.png', note: 'Tab screen. Title "Messages" + an "Unread" filter chip. List rows from useStore().threads: avatar, name, last message preview, time, red unread badge when unread is greater than 0. Row navigates to MessageThread with threadId.' },
      { name: 'MessageThread', route: 'MessageThread', node: '97:7340', ref: 'message-thread.png', note: 'Chat thread: TopBar with the other user name. Message bubbles from useStore().messagesFor(threadId) (mine = right/dark, theirs = left/gray). Bottom input "Type something..." + send (calls sendMessage). Match message-thread.png.' },
    ],
  },
  {
    key: 'profile', file: 'src/screens/profile.tsx',
    note: 'Profile, edit, settings, help, and the navy Side Drawer.',
    screens: [
      { name: 'Profile', route: 'Profile', node: '100:13030', ref: 'profile.png', note: 'Tab screen. Avatar + name + bio. Stats row: "129 Total Favors", "4.9 Rating", "2.5 Years" from useStore().user. Info rows: Email, Phone, Home address, Password change. A "Switch to request a favor"/"Switch to be a Favor Pal" action (calls setRole). "Edit Profile" navigates to EditProfile. favor-member-profile.png is a cross-reference.' },
      { name: 'EditProfile', route: 'EditProfile', node: '97:4909', ref: 'edit-profile.png', note: 'Editable fields: First/Last Name, City, State, Email, Bio (multiline), Home Address, Zip, Phone, Current Password, New Password. Avatar with camera "Add Image" (expo-image-picker optional). Black "SAVE" calls updateProfile(patch) then goBack.' },
      { name: 'Settings', route: 'Settings', node: '97:4297', ref: 'settings.png', note: 'Settings list rows (toggles + links), including an option leading to account deletion. Use <Row> items.' },
      { name: 'Help', route: 'Help', node: '2:4291', ref: 'help.png', note: '"Need help or have a question?" + a message Field (700 char max) + black "send". On send show a success state.' },
      { name: 'SideDrawer', route: 'SideDrawer', node: '181:10620', ref: 'side-drawer.png', note: 'A LEFT navy drawer panel (~80% width) presented as a transparent modal over the map; tapping the dark right backdrop area calls navigation.goBack(). Navy bg #1C2331. Centered avatar with red edit badge, "Anton" white bold, "View Profile" gray, red Set Status dot+label. Divider. White menu rows (icon+text): Favor History (navigate to "Tabs"), Help (navigate to "Help"), Settings (navigate to "Settings"), Account/Payment (navigate to "Payment"). Bottom "Logout" calls useStore().logout(). Implement with a Pressable backdrop.' },
    ],
  },
  {
    key: 'payment', file: 'src/screens/payment.tsx',
    note: 'Payment methods. White bg, TopBar.',
    screens: [
      { name: 'Payment', route: 'Payment', node: '100:8965', ref: 'payment.png', note: 'List saved cards from useStore().cards (brand + last4 + exp), each with edit/delete. "Add New Card"/"+ Add" navigates to AddCard. If empty show a "No record" empty state.' },
      { name: 'AddCard', route: 'AddCard', node: '1449:17701', ref: 'add-card.png', note: 'Card form: Card Number (e.g. 4242 4242 4242 4242), expiry MM/YY, CVC, and "Your payment info will be stored securely". Black save calls addCard({brand:"visa",last4,expMonth,expYear}) then goBack.' },
    ],
  },
  {
    key: 'history', file: 'src/screens/history.tsx',
    note: 'Favor/payment history. White bg, TopBar.',
    screens: [
      { name: 'History', route: 'History', node: '1:23225', ref: 'favor-history.png', note: 'Tab screen. List past favors from useStore().history with color-coded status badges (Completed green, Cancelled red, In Progress amber, etc.), title, date, amount. Row navigates to FavorHistoryDetail with favorId.' },
      { name: 'FavorHistoryDetail', route: 'FavorHistoryDetail', node: '100:8484', ref: 'payment-history-detail.png', note: 'Full favor record: type, schedule (e.g. "Monday, Feb. 16, 2021 12:00PM"), Description, Address, Payment breakdown, Transaction ID, Feedback + Rating (StarRating display), Favor Pal/Member info. Pull favor by route.params.favorId from useStore().history.' },
    ],
  },
]

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['module', 'screensDone', 'summary'],
  properties: {
    module: { type: 'string' },
    screensDone: { type: 'array', items: { type: 'string' } },
    assetsExported: { type: 'array', items: { type: 'string' } },
    deviations: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
}

function buildPrompt(m) {
  const screenLines = m.screens.map((s, i) =>
    (i + 1) + '. export const ' + s.name + '  (route "' + s.route + '", figma node ' + s.node + ')\n   Reference image: ' + REF + '/' + s.ref + '\n   Spec: ' + s.note
  ).join('\n')
  return 'You are the build agent for the ' + m.key + ' module of the My Favor app.\n\n' +
    'STEP 1 - Read the build contract IN FULL: ' + ROOT + '/BUILD_CONTRACT.md\n' +
    'STEP 2 - Read your current stub to see the exact export names + already-wired forward routes: ' + ROOT + '/' + m.file + '\n' +
    'STEP 3 - Read EACH reference image listed below (use the Read tool on the .png path; it renders the image). Study layout, spacing, copy text, colors, button styles.\n' +
    'STEP 4 - (Optional) For exact copy text or hex colors, call mcp__figma-framelink__get_figma_data({ fileKey: "' + FILEKEY + '", nodeId: "<node>" }). Load figma MCP tools via ToolSearch first if needed (query: "select:mcp__figma-framelink__get_figma_data,mcp__figma-framelink__download_figma_images").\n' +
    'STEP 5 - If a screen contains a custom illustration/photo you cannot reproduce with code+icons, export that node as PNG into ' + ROOT + '/assets/img/' + m.key + '/ via mcp__figma-framelink__download_figma_images and require() it. Otherwise use Ionicons, colored shapes, the logo at assets/img/logo.png, and the pravatar avatar URLs already in the store.\n' +
    'STEP 6 - WRITE the complete module file ' + ROOT + '/' + m.file + ', implementing every screen below to MATCH its reference, using ONLY the foundation (src/theme, src/components, src/store, src/types) + installed libs. Keep the SAME exported component names. Each screen component signature: function Name({ navigation, route }) (plain JS-style, but this is a .tsx file so you may annotate props as any).\n\n' +
    'Module styling note: ' + m.note + '\n\n' +
    'SCREENS TO IMPLEMENT:\n' + screenLines + '\n\n' +
    'CONSTRAINTS:\n' +
    '- Only write ' + m.file + ' and assets under assets/img/' + m.key + '/. Do NOT edit theme, store, components/index.tsx, navigation, or types - they are fixed shared files.\n' +
    '- Do not install packages. Do not add new routes. Keep forward navigation per the stub (and wire store actions where the spec says).\n' +
    '- Make it typecheck (TypeScript). Prefer <Screen>, <Txt>, <Button>, <Field>, <Card>, <Avatar>, <StarRating>, <TopBar>, <MapPlaceholder>, <Row> from ../components.\n' +
    '- Faithfulness to the reference image is the priority. Match copy text exactly.\n\n' +
    'When done, return the structured summary.'
}

phase('Build')
log('Building ' + MODULES.length + ' feature modules in parallel from Figma references...')

const results = await parallel(
  MODULES.map((m) => () =>
    agent(buildPrompt(m), {
      label: 'build:' + m.key,
      phase: 'Build',
      agentType: 'general-purpose',
      schema: SCHEMA,
    })
  )
)

const done = results.filter(Boolean)
log('Completed ' + done.length + '/' + MODULES.length + ' modules.')
return {
  modulesBuilt: done.length,
  modules: done.map((r) => ({ module: r.module, screens: r.screensDone, deviations: r.deviations || [] })),
}
