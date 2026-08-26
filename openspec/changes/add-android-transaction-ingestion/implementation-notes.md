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
- At this checkpoint, authenticated payment-instrument, candidate-inbox and
  confirmation states were intentionally not exercised against live Firebase
  because the task had not yet authorized login, deployment or external data
  mutation. That restriction was later superseded by the explicit authorization
  and live evidence recorded below; OpenSpec item 10.4 remains incomplete.

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

- Integrate and release the PWA through the normal branch-review process. The
  reviewed Firestore rules/index and configured canary APK were deployed and
  installed only after explicit authorization, as recorded below.
- Complete the live confirmation/lost-response exercise, device
  denial/offline/retry exercises, the remaining browser matrix and the private
  14-day/50-event canary. Keep manual confirmation and leave the OpenSpec change
  unarchived until all thresholds pass.

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

## Live Firestore deployment and device bootstrap

- The user authorized the production target `moneytrack-889fe`. A Firestore
  dry run compiled the rules and indexes before the real deployment. Firebase
  then released `firestore.rules` and deployed `firestore.indexes.json` with
  exit code 0.
- Post-action Console verification showed the new rules release as the active
  version from the current session and the
  `transactionImportCandidates(status ASC, occurredAt DESC)` index as
  `Habilitado` after its asynchronous build completed.
- Windows and ADB identified the authorized POCO canary without recording its
  serial number. The first install was correctly blocked by HyperOS until the
  user enabled its explicit “Instalar vía USB” control; the next single retry
  returned `Success`.
- Package Manager verified `com.moneytrack.capture` version `0.1.0`, version
  code 1, minimum API 26 and target API 36. `MainActivity` opened in the
  foreground with no fatal Android runtime entry.
- The user granted notification-listener access, completed Google sign-in and
  explicitly selected one discovered source package. The app then reported an
  active Moneytrack session and active capture.
- One privacy-safe synthetic accepted fixture synchronized exactly one
  64-character pending candidate. A fixture containing an excluded status was
  rejected locally and did not increase the remote candidate count.
- Firebase Auth and the candidate path proved that Android and the authenticated
  local PWA used the same user UID without recording it. The PWA showed exactly
  one pending candidate together with the explicit no-balance-effect message.
  Its review dialog opened and returned to the inbox; no confirm or dismiss
  action was invoked, so the candidate remained pending and no ledger mutation
  occurred.

## 2026-08-25 — UX feedback intake (pending design approval)

### User-requested experience

- Replace the single long Android setup screen with a progressive experience:
  MoneyTrack-branded launch, session, notification access, capture/source
  selection and a ready-state home.
- Explain the purpose and privacy boundary at the step where each permission or
  choice is requested. Re-check the real state on launch; completed steps should
  not block returning users.
- Keep all content clear of the Android status, cutout and gesture/navigation
  bars. Support a coherent light and dark appearance.
- When signed out, show the Google sign-in action. When signed in, do not keep a
  redundant disabled sign-in control next to sign-out.
- Open the canonical PWA at `https://axensz.github.io/Moneytrack/`.
- Remove parser confidence and raw Android package IDs from the normal purchase
  row. A technical package such as `com.android.shell` is diagnostic metadata,
  not user-facing product language.
- Remove the prominent “Revisión humana obligatoria” explanation from the
  review modal while preserving the canary rule that a pending candidate only
  enters the ledger after an explicit confirmation.
- Prefer a useful payment-method label such as `Oro` or `Nu` and recommend the
  linked account automatically when the evidence is unambiguous.
- Make the captured-purchase amount input follow the established MoneyTrack
  money-input behavior and reject or normalize invalid characters visibly.

### Verified current-state gaps

- `MainActivity` renders auth, permission, capture, sources and operational
  status in one `ScrollView`; it enables/disables both auth buttons instead of
  rendering only the applicable action.
- The Android theme is fixed to `Theme.Material.Light.NoActionBar`; no night
  resource set or explicit system-bar inset handling exists. With target SDK 36,
  the current top-level layout can render under system bars, matching the
  overlap in the supplied screenshots.
- The Android web URL still points to the previous Firebase Hosting origin.
- The listener already discovers an application label locally, but the
  normalized candidate persists only `sourcePackage`; the web inbox exposes
  that raw package together with parser confidence.
- Account recommendation already works for one unique active payment instrument
  with matching last four digits. A missing or ambiguous match correctly leaves
  the account unselected.
- Wallet card nickname and Android application label are different domain
  concepts. A nickname observed inside notification text is optional,
  untrusted evidence and cannot replace an exact instrument identity without a
  documented, ambiguity-safe rule.
- The import review amount field is an isolated outlier: it stores
  `event.target.value` directly. Other MoneyTrack monetary fields normalize with
  `unformatNumber` and display with `formatNumberForInput`. As a result, invalid
  letters remain visible here and lenient submit parsing can silently reinterpret
  a malformed value as a different amount.

### Decisions still requiring design approval

- Returning behavior: skip directly to the ready-state home when every
  prerequisite remains satisfied, and reopen only the first missing step.
- Theme control: follow the phone by default, with or without an additional
  in-app `Sistema / Claro / Oscuro` preference.
- Payment-instrument hint: keep exact last-four matching as primary and add an
  optional normalized Wallet nickname only after a sanitized real notification
  fixture proves a stable phrase; never match an account from a non-unique
  nickname.
- Contract update: hide confidence/package in standard UI while retaining them
  in the normalized canary record for diagnostics; decide separately whether an
  optional bounded `observedInstrumentLabel` is justified.

No implementation or OpenSpec requirement was changed by this intake. The
approved design must amend the existing unarchived change before code work.

## 2026-08-25 — UX design approved

- The user approved the progressive Android flow and requested that the web
  version explicitly manage the four digits used for unique matching.
- Current code already persists and validates `PaymentInstrument.last4`; the
  approved refinement makes alias, masked termination and linked account clear,
  then exposes the unique match as a recommendation rather than adding another
  identifier or trusting a Wallet nickname alone.
- The existing change remains the correct OpenSpec boundary because the canary
  is unarchived and this feedback modifies its Android and import UI before
  acceptance.
- Follow-up wording ruling: the purchase row identifies the functional origin
  as `Android` and appends only a uniquely recommended account. The alias stays
  in payment-medium management and matching; it is not shown as the source.

## 2026-08-25 — Device feedback: source management and compact theme control

- The canary ready state exposed the discovered test source as `Shell` but did
  not provide a direct way to remove it or add another discovered source. The
  persistent theme radio group also competed with the primary capture status.
- `com.android.shell` now resolves only at presentation time to `Fuente de
  prueba`; the internal package allowlist remains unchanged and ordinary
  financial application labels continue to be shown without package IDs.
- `READY` now exposes `Administrar aplicaciones`, a custom modal backed by all
  locally discovered sources. Saving persists the exact selection; saving none
  returns the guided flow to `CAPTURE`. Its copy explains that another app
  becomes available after emitting a future notification, without requesting
  general installed-app visibility.
- Theme selection moved to an accessible 48 dp header icon and a
  `Sistema / Claro / Oscuro` dialog with explicit save/cancel actions. The
  inline theme block was removed and the stored mode is applied only when it
  changes.
- A short-lived per-source `Quitar` action was removed after device feedback.
  READY now keeps selected labels read-only and centralizes activation and
  deactivation in `Administrar aplicaciones`.
- Real-device inspection found that the OEM AppCompat dialog displayed the
  message but hid `setMultiChoiceItems`. The source manager now uses a custom
  explanation plus 48 dp checkboxes for every discovered source. Cancel keeps
  changes local; Save persists the exact selection. Up to two sources use their
  natural height and longer lists are bounded and scrollable.
- A later device capture identified Google Wallet itself as the desired base
  source and verified its installed package. The approved refinement adds it to
  a pure known-source catalog so it is always offered as recommended, while the
  allowlist remains empty until explicit consent and no installed-app inventory
  permission is introduced.
- The header now says `MoneyTrack móvil`; READY says `Configuración completa`
  and `Captura activa`. The appearance control uses an outlined sun instead of
  the previous pie-shaped glyph.
- Real-device verification showed the corrected custom source modal with the
  known and observed options. The user selected Google Wallet, disabled the
  test source and returned to READY with Google Wallet as the only visible
  source; no package name or financial notification content was displayed.
- Follow-up feedback found the ready explanation, `Aplicaciones elegidas`
  heading and separate explanatory web card redundant. RED layout-source tests
  now protect the shorter structure. READY shows `Captura activa`, the selected
  labels and `Administrar aplicaciones`; `Abrir MoneyTrack` is a standalone
  secondary button with a visible label and vector external-link icon.
- The full-width controls, flexible title, source labels and outer ScrollView
  preserve compact, landscape, long-label and enlarged-text behavior without
  horizontal overflow.
- Focused resolver/dialog-sizing tests, Android JVM tests, `lintDebug` and
  `assembleDebug` passed. Independent review reported no remaining Critical,
  Important or Minor findings. The previous debug APK reinstalled successfully
  on the authorized device without clearing its session. At that checkpoint,
  the later concise READY revision had not yet been built.
- The concise build then passed its focused RED/GREEN layout tests plus the full
  Android JVM, lint and debug-assembly gates, and strict OpenSpec validation.
  It installed over the existing canary session and a dark-mode capture verified
  `Captura activa`, Google Wallet, the single source manager, the standalone
  vector-labeled web action and system-bar clearance without financial data.
- The OEM denied a temporary forced-display-size probe because shell lacks
  `WRITE_SECURE_SETTINGS`; the physical 400 dp-wide display remained unchanged.
  Manual landscape/enlarged-text and appearance-dialog verification therefore
  remains open rather than being inferred.

## 2026-08-25 — Whole-app UI/UX audit approved for specification

- The user approved the UI UX Pro Max audit as the next Android refinement.
  `PRODUCT.md` and `DESIGN.md` remain authoritative: confident, warm, expert;
  one violet brand hue; semantic status pairs; system typography; AA contrast;
  and 44–48 dp targets.
- Live review confirmed that guided routing, source management, light/dark
  surfaces, system-bar clearance and vertical scrolling already work. The
  approved scope keeps that native AppCompat/XML architecture and adds no visual
  dependency.
- Remaining observed gaps are now explicit contracts: reuse the canonical PWA
  logo for launcher/splash; replace gray all-caps actions that resemble disabled
  controls; prevent the OEM cyan accent caused by a missing unprefixed AppCompat
  `colorAccent`; use a neutral appearance icon; constrain landscape reading
  width; improve auth progress/errors; and verify large text and TalkBack.
- The ready state will use a compact complete treatment, a semantic active
  capture panel, one source-management action and a separate bordered web
  utility row. Production UI hides `com.android.shell`, packages and confidence;
  Google Wallet remains recommended but never selected without consent.
- This checkpoint changes OpenSpec documentation only. Android production edits
  begin after the written specification is reviewed, and the responsive device
  matrix remains an evidence gate rather than an inferred pass.

## 2026-08-25 — Approved Android UX implementation and PR readiness

- The approved UI/UX refinement was implemented as small scoped commits:
  canonical MoneyTrack branding and appearance, sanitized notification-source
  presentation, guided ready-state hierarchy, single-flight Google sign-in
  feedback, neutral active-capture surface, safe-area clipping and actionable
  lint cleanup.
- `Captura activa` now uses the same neutral surface as the rest of the app.
  Success remains visible through the check icon and status text. The separate
  `Configuración completa` panel retains the solid success treatment.
- A regression test first failed against the green ready-card background and
  passed after the neutral surface change. A second regression test first
  failed while scrolling content could paint into system-bar padding and passed
  after clipping the scroll viewport to its inset-safe area.
- The physical canary verified the final visual behavior before the lint-only
  cleanup: dark appearance, Google Wallet as the sole selected source, no raw
  package identifier, neutral `Captura activa`, clean status-bar placement and
  a separate `Abrir MoneyTrack` utility row. The header/status-panel binding bug
  found by the first screenshot was corrected before this checkpoint.
- A reversible device matrix verified the screen at 130% font scale in portrait
  and landscape. The controls remained horizontally bounded and the landscape
  viewport no longer painted an interactive control beneath the gesture bar.
  Font scale and rotation were restored in a `finally` block. OEM policy denied
  scripted swipe injection, so scroll-to-bottom interaction was not claimed.
- No emulator or AVD was installed, so the 320/700/900 dp override matrix was
  not fabricated and no physical display-size override was attempted. The pure
  content-width tests continue to cover the 600 dp maximum-column rule.
- The definitive clean Android command completed 55 executed Gradle tasks in
  22 seconds. All 54 JVM tests passed with zero failures, errors or skips;
  `lintDebug` and `assembleDebug` passed. SARIF contains only seven version
  availability notices for the SDK, Gradle plugin/wrapper and dependencies
  intentionally pinned by this OpenSpec change. No accessibility, resource,
  overdraw, compatibility-drawable or adaptive-icon finding remains.
- The configured debug APK is 9,905,923 bytes with SHA-256
  `986a859f46cdf712fb9738044a90ced189381c46f2ef07b77d7e0e6bbc9727b9`.
  The phone disconnected from ADB before this lint-cleanup build could be
  reinstalled; the immediately preceding behavior-equivalent build had already
  installed successfully and supplied the device evidence above.
- Web validation passed TypeScript, ESLint, the production Next.js build and
  the complete Vitest regression: 163 files and 1,511 tests passed, with the
  existing emulator-gated 2 files / 49 tests skipped. Running those two suites
  separately against the local Firestore demo emulator passed all 49 tests.
- OpenSpec 1.6.0 strict validation passed. Concurrent uncommitted web/OpenSpec
  edits in the shared worktree were preserved and intentionally excluded from
  these Android commits; this file records the verification without claiming
  completion of the private 14-day/50-event canary or archiving the change.

## 2026-08-25 — Final notification idempotency and PR gate

- The final review closed two notification-delivery defects before publication.
  One active Android delivery now anchors both its SHA-256 candidate identity
  and its entire first normalized payload until removal or reconciliation with
  `activeNotifications`; it no longer starts a second generation after an
  arbitrary age. A real Firestore emulator assertion proves that the anchored
  no-op succeeds while the same document with a changed `occurredAt` is rejected.
- Pending state is durable and candidate-specific. `ENQUEUED` is persisted
  before network work, `WRITE_FAILED` survives process recreation, Activity and
  listener lifecycle entry retry it, and only `STORED` for that same candidate
  clears its error. The visible ready screen observes those preferences live and
  shows mutually exclusive active, pending or failed status.
- Every persisted candidate and delivery link is bound to a SHA-256 hash of the
  originating Firebase UID. The raw UID is not stored; another signed-in account
  cannot see, retry or inherit that delivery. Version-1 ownerless records are
  ignored and therefore fail closed. Tests cover A-to-B account switching,
  in-flight deduplication, process-style reconstruction and independent failures.
- Independent review also found that `ready_heading` pointed to the session
  explanation instead of the real `Captura activa` heading. A structural XML
  regression failed first, the ID was moved to its correct ready-state child and
  the test then passed. The unused persisted last-result code was removed so
  rejected background notifications no longer trigger unrelated full renders;
  only its privacy-safe enum remains in local Logcat.
- Final Android verification completed 55 Gradle tasks. All 66 JVM tests passed
  across 15 suites with zero failures, errors or skips; `lintDebug` and
  `assembleDebug` passed. The seven lint items remain only version-availability
  notices (`GradleDependency` 4, `AndroidGradlePluginVersion` 2,
  `OldTargetApi` 1). The configured debug APK is 9,942,363 bytes with SHA-256
  `bf745d98bc2ac97874ba66705ca08979bf2947cac5d6913734726531f51b205b`.
- The Firestore demo emulator passed 2 files and 49/49 assertions. A detached,
  clean worktree at code checkpoint `4dd0ed5` passed TypeScript, ESLint, the
  production Next.js build and the complete Vitest regression: 163 files and
  1,510 tests passed; the separately verified emulator gate accounts for the
  expected 2 files / 49 tests skipped in that run.
- The final full graph reviewed 114 committed files and 30 affected flows against
  `origin/main`; the 0.85 aggregate risk reflects the size of the complete
  additive feature. Two independent focused review passes ended with no
  remaining Critical, Important or Minor finding. Strict OpenSpec validation,
  committed-diff whitespace checks and changed-line secret scans passed; no
  Firebase config, keystore, local SDK path or new secret-pattern line is tracked.
- The OpenSpec change remains unarchived. The unavailable 320/expanded emulator
  matrix, current-device reinstall and private 14-day/50-event financial canary
  remain explicit external evidence gates rather than inferred completions.
