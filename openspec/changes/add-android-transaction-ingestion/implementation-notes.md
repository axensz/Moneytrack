# Implementation notes

## 2026-08-25 — baseline

- Base: `origin/main` at `cc19a63d57c118c42177fc2a73a9282eb28711d1`.
- Isolated worktree: `feature/android-transaction-ingestion`.
- Intentional starting files: `CONTEXT.md` and this OpenSpec change only.
- OpenSpec status: 4/4 artifacts complete; strict validation passed.
- Knowledge graph: 399 files parsed, 4,671 nodes, 46,333 edges, built at the base commit.

## Initial impact map

| Concern | Current authority / integration file |
| --- | --- |
| Authenticated financial commit | `src/hooks/firestore/ledgerMutationOrchestration.ts` |
| Existing transaction ingress | `src/hooks/firestore/useTransactionsCRUD.ts` |
| Account delete and credit-card merge | `src/hooks/firestore/accountOrchestration.ts` |
| Ledger/domain types | `src/types/finance.ts` |
| Transaction review surface | `src/components/views/transactions/TransactionsView.tsx` |
| Account management surface | `src/components/views/accounts/AccountsView.tsx` |

The graph confirms that current `main` already contains
`executeAuthenticatedLedgerMutation`, `deleteAccountCascade`, and
`mergeCreditCardsOrchestrated`. The new ingress can therefore extend the
existing ledger boundary without copying financial authority.

## Baseline verification

- Ledger boundary: 3 files passed, 119 tests passed.
- TypeScript: `npm.cmd run typecheck` passed.
- ESLint: `npm.cmd run lint` passed with no reported findings.

## Domain-contract slice

- RED: decoder and matching modules were absent; the Android ingress row also
  failed TypeScript because `LedgerMutationSource` did not include it.
- GREEN: 3 focused files passed, 77 tests passed; TypeScript passed.
- The decoder accepts only exact version-1 shapes and Firestore timestamp
  objects or `Date` values. It does not coerce strings/numbers into dates or
  malformed monetary values.
- Matching returns an account only for one active exact last-four match;
  duplicate active matches remain ambiguous.

## Firestore security slice

- RED: with the old default-deny rules, 8 positive import assertions failed
  while the original account-operation suite stayed green.
- The two emulator files must run without file parallelism because each owns and
  clears the same demo Firestore emulator.
- GREEN: 2 files passed, 49 tests passed.
- The composite index JSON parsed successfully; no deploy was performed.
- Confirmation requires a 64-character candidate ID, matching Android
  operation identity, active ledger lease, canonical transaction and exact
  release in the same batch. Terminal candidates cannot reopen.
- Scoped commit: `b2b6314 feat(import): define secure candidate contracts`.

## Payment-instrument persistence and account lifecycle

- RED: the new hook module was absent; merge/delete ignored linked instruments
  and passed batch limits that should include their writes.
- GREEN: 3 files passed, 41 tests passed; TypeScript passed.
- Every user switch unsubscribes and clears prior-user instrument state.
- Merge and cascade discover current instrument references from the server after
  acquiring the account-operation lease; React state is not treated as
  referential authority.

## Candidate subscription and canonical confirmation

- RED: both candidate-hook and confirmation modules were absent before their
  focused tests ran.
- GREEN: the bounded candidate hook passed 6 tests; canonical confirmation
  passed 8 focused tests and TypeScript passed.
- The existing shared `planCreditAuthorityChanges` primitive was already public,
  so no credit arithmetic was extracted or duplicated.
- The four ingress suites passed 129 tests. They cover the existing writer,
  normal transaction writes, ingress parity and the Android confirmation path.
- A successful confirmation uses `ledger-mutation:android:<candidateId>` for the
  operation and transaction identity, reloads the reviewed candidate after the
  lease, and stages transaction, credit authority, optional remembered medium,
  candidate terminal state and lease release in one commit.
- Retry recovery returns the canonical transaction only when candidate,
  transaction ID, operation ID, mutation kind and Android source all agree.
- The graph found no pre-existing create or credit-payment flow changed by the
  new isolated writer. It mapped 36 direct/indirect tests to the new module,
  including all 8 focused confirmation cases.

## Web management and review UI

- `PRODUCT.md` and `DESIGN.md` were re-read before JSX. The new surfaces reuse
  the system font, semantic tokens, existing modal focus management and 44 px
  controls; they add no color, gradient, motion library or shared primitive.
- The visual signature is a restrained violet intake rail: it identifies the
  phone-to-review boundary without presenting candidates as ledger metrics.
- RED: the payment-instrument section, candidate inbox and review modal modules
  were absent when their focused suites first ran.
- GREEN: the required 5 UI files passed 21 tests; TypeScript and ESLint passed.
  Three graph-identified shell/placement suites added 30 passing regression
  tests for routing, loading contracts and metric placement.
- The root authenticated shell passes its existing UID and online state down to
  the views. No extra auth listener was introduced, and guest rendering remains
  unchanged.
- Offline review preserves edits and blocks the financial action. Server
  failures remain visible and the synchronous guard permits only one canonical
  confirmation per submit gesture.

## Android project and pure capture core

- The isolated Android module uses AGP 9.3.0, Gradle 9.5.0, API 26–36 and
  Java 17 bytecode. Firebase main modules, Activity KTX and Credential Manager
  are pinned; Compose, Analytics, Crashlytics and dependency injection remain
  absent.
- The Google Services plugin is conditional on the ignored local
  `app/google-services.json`, so source verification does not require checking
  credentials into Git. Android Studio JBR 21.0.10 and Gradle 9.5.0 were
  verified; Gradle installed the missing API 36 platform locally.
- RED/GREEN evidence was captured independently for parser, SHA-256 fingerprint
  and eligibility policy. The final pure-core task passed all current Android
  unit tests.
- The parser accepts only unambiguous COP purchase notifications and rejects
  multiple amounts, foreign currency, malformed values, reversals, failures and
  security/OTP messages. Raw notification text never enters the fingerprint.
- Capture is fail-closed for signed-out, disabled, missing-access, empty-list
  and non-allowed-package states. Preferences are private, allowlist reads are
  defensive copies, and installation identity is a locally persisted random
  UUID.

## Android authenticated capture boundary

- RED/GREEN repository tests verify the exact user path, deterministic document
  ID, normalized pending payload, optional last-four behavior, forbidden raw
  keys and generic error mapping. Its public persistence input is the normalized
  candidate; Firestore receives no notification object or installation ID.
- Credential Manager uses the generated web OAuth client ID and exchanges only
  the Google ID token in memory for a Firebase credential. Sign-out clears both
  Firebase Auth and provider credential state, and application code logs no
  token or authentication exception content.
- A non-allowed package is remembered locally by package and label before any
  notification extra is read. The injectable coordinator proves that wrong
  packages, rejected parses and inspection errors never call the repository;
  repeated delivery produces the same 64-character document ID.
- The manifest exposes only the launcher activity. The listener is non-exported,
  guarded by `BIND_NOTIFICATION_LISTENER_SERVICE`, and the source declares none
  of the prohibited broad permissions. Private preferences are excluded from
  backup and device transfer.
- The Spanish XML status surface shows session, access, readiness, selected
  sources and generic last result. It uses resource strings, 48 dp controls,
  the existing violet brand hue, solid surfaces and no gradients.
- Exact phase command `testDebugUnitTest lintDebug` passed: 28 tests, zero test
  failures/errors and zero lint errors. The seven remaining lint findings are
  version-availability notices caused by the versions intentionally pinned in
  this OpenSpec change; there are no security or accessibility findings.
- Scoped commit: `c97c183 feat(android): capture normalized purchase notifications`.
  Its staged-file audit contained only `.gitignore` and `android-capture/`; the
  ignored Firebase config, local SDK path, keys and build directories were all
  absent.

## Android runbook and local artifact

- `android-capture/README.md` documents JDK/SDK prerequisites, same-project
  Firebase registration, ignored config placement, build/install commands,
  consent flow, privacy boundary and rollback. It explicitly distinguishes
  future Android notifications from unavailable Wallet history.
- `docs/android-capture-canary.md` permits only candidate prefix, package,
  parser code and yes/no outcomes. It prohibits raw text, merchant, amount,
  last-four, UID, notification key and installation ID, and defines the 14-day,
  50-event acceptance formulas.
- `signingReport` passed locally and produced debug SHA-1/SHA-256 values; they
  were not copied into repository evidence. Firebase Console registration and
  insertion of the ignored project config remain an external step.
- The exact clean matrix completed 54 tasks successfully in 1m58s. All 28 unit
  tests passed, lint had zero non-version findings, and the ignored debug APK
  was produced at `android-capture/app/build/outputs/apk/debug/app-debug.apk`
  (9,756,917 bytes; SHA-256
  `16ce327f9b84a41291cd7588232288657ed175f020efc62a28851ab2ecf00744`).
- This source-validation APK has no checked-in Firebase configuration and is
  therefore not evidence of working Google sign-in or a canary-ready build.

## Full local verification and handoff

- Every focused decoder, matching, rule, hook, account-lifecycle,
  orchestration and UI suite passed before the full regression. No snapshot was
  accepted as a substitute for behavioral or visual assertions.
- Firestore emulator verification passed 2 files and 49 tests. The complete
  Vitest run passed 163 files and 1,505 tests, with 2 files and 49 tests skipped
  by their existing environment gates. TypeScript, ESLint and the production
  Next.js build all passed; the static build emitted `/`, `/_not-found` and
  `/icon.svg`.
- The first final `test:rules` invocation stopped before starting the emulator
  because Java was absent from that process's `PATH`. Re-running the exact suite
  with Android Studio JBR set in `JAVA_HOME`/`PATH` passed all 49 assertions;
  this was an environment-only prerequisite failure, not a failed rule test.
- The clean Android matrix completed 54 tasks and 28 unit tests, with zero
  errors. Lint reported only seven availability notices for versions deliberately
  pinned by this change; it reported no security or accessibility finding.
- OpenSpec 1.6.0 strict validation reported the change valid and
  `git diff --check` reported no whitespace error. The required source scan
  found no `TBD`/`FIXME` planning placeholder and no persisted raw field in
  production. Remaining matches are intentional contract/tests, local Firebase
  setup documentation, transient in-memory notification parsing, rejection
  vocabulary, and pre-existing Spanish words such as “TODOS” outside this
  change.
- Browser verification used exact 390×844 and 1440×900 viewports in light and
  dark modes. Cuentas and Transacciones had no horizontal overflow, the account
  and transaction dialogs closed with Escape and returned focus to their
  launchers, and a clean guest origin produced no console warning or error.
- Authenticated payment-instrument, candidate-inbox and confirmation states were
  intentionally not exercised against live Firebase because this task did not
  authorize login, deployment or external data mutation. OpenSpec item 10.4
  therefore remains incomplete together with the device/canary items.

## Final graph review

- `detect_changes` against `origin/main` mapped 79 changed files, 350 changed
  functions/classes, 12 affected flows and a 0.70 review-risk score. The flows
  include account lifecycle, candidate review and transaction paths expected by
  the change.
- `tests_for` found 2 direct tests for `decodePaymentInstrument`, 26 for
  `confirmTransactionImport`, 12 at file level for
  `PaymentInstrumentsSection`, 36 for the orchestration module and 41 for the
  review modal.
- The graph did not attach a direct edge to the local `runAction` callback or
  private `requireCurrentPendingCandidate` helper, a documented limitation for
  TypeScript callbacks/private helpers. Their file-level suites cover every
  create/edit/toggle/delete action and every pending/terminal/server-reload
  confirmation branch, including retry idempotency and credit authority. No
  uncovered high-risk financial path remained.

## Remaining external gates

- Deploy the reviewed Firestore rules/index and PWA only through the normal
  release process, then install the configured APK on one authorized device.
- Complete authenticated browser states, device denial/offline/retry exercises
  and the private 14-day/50-event canary. Keep manual confirmation and leave the
  OpenSpec change unarchived until all thresholds pass.

## Firebase Android registration

- The authenticated Firebase CLI and Console both confirmed project
  `moneytrack-889fe`; Google remains an enabled Authentication provider.
- Android app `com.moneytrack.capture` was registered as
  `Moneytrack Capture Android`. The current debug certificate SHA-1 and
  SHA-256 were added and independently read back from Firebase.
- The SDK configuration was downloaded directly to the ignored
  `android-capture/app/google-services.json`. Its project, package, mobile app
  ID and Android/web OAuth client types were validated without printing keys.
- A clean configured build ran `processDebugGoogleServices`, all 28 unit tests,
  lint and `assembleDebug`: 55 Gradle tasks completed successfully. The local
  config and generated build outputs remain outside Git. The configured debug
  APK is 9,759,953 bytes with SHA-256
  `dbaabb3292dd2da0db6bbe6cdd7b508c61ad0911c4420d190bcd02286b315d6a`.
- Firebase CLI 15.24.0 emitted a Windows libuv assertion while closing the
  SHA-256 creation process after the API had reported success. A separate
  remote `apps:android:sha:list` query confirmed both SHA records, so no retry
  or duplicate mutation was performed.
