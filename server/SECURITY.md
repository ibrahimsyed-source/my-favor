# Security

This backend was built with security controls from the start (see the table in
[README.md](./README.md#security-posture)) and then put through an **adversarial
security audit**: six independent auditor agents each reviewed a different attack
dimension against the real source, and every reported issue was then re-checked
by a skeptic agent that tried to refute it. Only findings confirmed against the
actual code were kept.

**Result:** 11 real findings (1 high, 5 medium, 5 low). All actionable ones are
fixed below; the remainder are documented accepted tradeoffs. The fixes are
covered by regression tests in `tests/api.test.ts` (the `SECURITY:` tests).

## Fixed

| # | Sev | Issue | Fix |
| --- | --- | --- | --- |
| 1 | High | **Double-complete race** in `POST /favors/:id/finish` — concurrent requests duplicated the pal payout and member charge. | Completion is now an atomic conditional `updateMany` (status gate) *inside* the transaction; losers get `409` and write no ledger rows. (`favor.routes.ts`) |
| 2 | Med | OTP could act as a **passwordless login** for already-verified accounts via code-resend + brute force. | `resend-otp` now only issues a signup code for **unverified** accounts; the attempt cap is enforced atomically (#9). (`auth.routes.ts`, `otp.ts`) |
| 3 | Med | `/favors/incoming` disclosed every open favor's **exact GPS + street address** to any self-promoted pal. | The open feed now returns **coarse location** (rounded coords + area, no street line); exact address is revealed only to the matched pal. (`serialize.ts`, `favor.routes.ts`) |
| 4 | Med | `assign()` TOCTOU could **overwrite an atomically-accepted favor** (defeating accept's race-safety). | `assign` now uses the same conditional `updateMany` claim + `409` on conflict. |
| 5 | Med | Cancellation fee/refund was **computed but never persisted** — late cancels cost nothing. | Cancel now writes the fee as a member `payment` and credits a committed pal as `earning`, atomically with the status change. |
| 6 | Med | **Re-rate / double-tip TOCTOU** in `rate()` could credit the pal's tip multiple times. | Rating is an atomic conditional `updateMany` on `rating: null`; second rate gets `409`. |
| 7 | Low | `advance()` allowed redundant/racing transitions. | Each transition is gated on the exact current status atomically. |
| 8 | Low | **OTP attempt-cap TOCTOU** allowed > MAX_ATTEMPTS guesses per code under concurrency. | Attempt charge is a single atomic `updateMany` with an `attempts < MAX` predicate. |
| 9 | Low | `resend-otp` leaked account existence via a **response-timing side channel** (bcrypt only ran when the account existed). | The no-issue branch now performs an equivalent bcrypt hash to equalize timing. |
| 10 | Low | `GET /messages/threads` had **no result cap** (resource exhaustion). | Added `take: 100`. |

## Accepted / documented tradeoffs

- **Signup existence disclosure (low).** `POST /auth/signup` returns `409` when an
  email/phone is already registered. This is a standard, largely-inherent
  marketplace UX (the user needs to know their email is taken), and the message
  does not reveal *which* identifier collided. Login and `resend-otp` are
  deliberately generic, so this is the one intentional existence signal. If you
  want to remove it entirely, switch signup to an always-`202` "we sent you a
  code" response plus an out-of-band "you already have an account" email.
- **Self-assignable role.** The `member ↔ pal` toggle is intentional product UX,
  so `role` is not a hard trust boundary. The sensitive consequence (address
  exposure) is addressed by data-minimization in #3. **Before production**, gate
  truly pal-only/vetted capabilities on a server-controlled `palVerified` flag
  (set by your background-check flow), not on the self-mutable `role`.

## Notes for production hardening

- Add a persistent **per-account OTP lockout** with backoff (beyond the current
  single-live-code + atomic 5-attempt cap + IP rate limits) if you keep an
  OTP-based login path; consider 8-digit codes.
- Put the API behind a WAF / proxy rate-limiting keyed on more than client IP.
- Wire real Stripe so money actually moves (the ledger is currently the source of
  truth with no external settlement), and reconcile via the verified webhook.
