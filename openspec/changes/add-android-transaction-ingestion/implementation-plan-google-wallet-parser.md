# Google Wallet Parser and Safe Instrument Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task and `superpowers:test-driven-development` for every production change. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the approved Google Wallet notifications into privacy-safe candidates and recommend an account only when nickname and/or last-four evidence resolves one active managed payment instrument.

**Architecture:** A package router keeps the existing generic bank parser and sends only the official Google Wallet package to a dedicated fail-closed parser. Candidate schema v2 carries an optional bounded observed nickname; payment-instrument schema v2 permits alias-only wallet tokens while keeping physical-card last four mandatory. Web matching intersects available evidence and never auto-creates ownership or account relationships.

**Tech Stack:** Kotlin/JUnit/Android notification APIs, React 19, TypeScript 5, Firebase Web/Firestore rules, Vitest 4, existing AppCompat/XML and Moneytrack semantic tokens.

**Spec:** `openspec/changes/add-android-transaction-ingestion/design.md`, `specs/android-notification-capture/spec.md`, `specs/payment-instrument-linking/spec.md`, and `specs/transaction-import-inbox/spec.md`.

## Global Constraints

- Base all work on current `origin/main`; preserve unrelated worktree changes.
- Run commands in PowerShell with `npm.cmd`, `npx.cmd` and `android-capture/gradlew.bat`.
- Use code-review-graph before fallback text exploration and after implementation for impact/test coverage.
- No production code before a focused failing test proves the missing behavior.
- Never persist or log notification title/body, PAN, CVV, OTP, raw notification payload, UID, Android ID or hardware identifiers.
- `observedInstrumentLabel` is an untrusted hint; it never proves ownership, creates an account or posts a transaction.
- Preserve manual confirmation and the authenticated atomic ledger writer.
- Add no npm, Android UI, backend, Cloud Function, analytics or crash-reporting dependency.
- Keep existing v1 candidates and payment instruments readable; deploy compatible web code/rules before the APK emits v2 candidates.
- Use `PRODUCT.md`, `DESIGN.md`, existing semantic tokens, 44 px web targets and 48 dp Android targets for any UI adjustment.

---

### Task 1: Freeze the approved domain and OpenSpec contract

**Files:**
- Modify: `CONTEXT.md`
- Modify: `openspec/changes/add-android-transaction-ingestion/proposal.md`
- Modify: `openspec/changes/add-android-transaction-ingestion/design.md`
- Modify: all three delta specs and `tasks.md`
- Create: this plan.

**Interfaces:**
- Produces: candidate schema v2, payment-instrument schema v2, `observedInstrumentLabel`, `google-wallet-purchase` v1, and conservative matching requirements used by all later tasks.

- [x] **Step 1: Record observed nickname versus managed alias**

Define `Apodo observado en Wallet` as a bounded, non-authoritative external hint and keep `Alias del medio de pago` as the user-managed identifier linked to one account.

- [x] **Step 2: Record versioned persisted contracts and rollout**

Specify candidate v1/strict and v2/Wallet pairings, instrument v1/v2 compatibility, optional wallet last four, forbidden raw keys, group-summary rejection and web/rules-before-APK deployment.

- [x] **Step 3: Validate OpenSpec strictly**

```powershell
npx.cmd --yes @fission-ai/openspec@1.6.0 validate add-android-transaction-ingestion --strict
```

Expected: `Change 'add-android-transaction-ingestion' is valid` and exit code `0`.

- [x] **Step 4: Commit the approved contract**

```powershell
git add -- CONTEXT.md openspec/changes/add-android-transaction-ingestion
git diff --cached --check
git commit -m "docs(openspec): specify Google Wallet capture"
```

### Task 2: Parse Google Wallet fixtures behind a package router

**Files:**
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/core/GoogleWalletPurchaseParser.kt`
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/core/PurchaseParserRouter.kt`
- Create: corresponding parser/router tests.
- Modify: `NormalizedPurchaseCandidate.kt` and `NotificationCaptureCoordinator.kt`.

**Interfaces:**
- Produces: `PurchaseParserRouter.parse(RawNotification, String, Long): PurchaseParseResult`.
- Produces: Wallet candidates with `schemaVersion = 2`, `parserId = "google-wallet-purchase"`, `parserVersion = 1`, and optional `observedInstrumentLabel`.

- [ ] **Step 1: Write failing fixture tests**

Use hand-derived assertions:

```kotlin
assertWallet(
    title = "TIENDA D1 ESTACION NIQ",
    body = "COP13,990.00 with MamáDébito",
    amountMinor = 1_399_000L,
    merchant = "TIENDA D1 ESTACION NIQ",
    observedLabel = "MamáDébito",
)
assertWallet(
    title = "OXXO EDS PORTAL DE NIQ",
    body = "COP2,600.00 with Oro",
    amountMinor = 260_000L,
    merchant = "OXXO EDS PORTAL DE NIQ",
    observedLabel = "Oro",
)
```

Add separate failures for `COP 13.990,00 con Oro`, `COP2,600 with Oro`, negative/zero amounts, non-COP bodies, two distinct bodies, blank title and invalid/overlong nicknames.

- [ ] **Step 2: Run tests and verify RED**

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
./android-capture/gradlew.bat -p android-capture testDebugUnitTest --tests '*GoogleWalletPurchaseParserTest' --tests '*PurchaseParserRouterTest'
```

Expected: compilation failure because the new parser/router and candidate v2 fields do not exist.

- [ ] **Step 3: Implement the minimal strict parser**

Route only `AvailableCaptureSourceCatalog.GOOGLE_WALLET_PACKAGE`. Parse complete `text`/`bigText` alternatives, deduplicate identical bodies, accept only unambiguous English/Colombian separators, normalize title and nickname with NFKC, and keep nickname only when it is 1–24 Unicode letters. Do not use `combinedText()` for Wallet.

- [ ] **Step 4: Run the focused suite GREEN and commit**

Run the Step 2 command, then stage only the parser slice and commit `feat(android): parse Google Wallet purchases`.

### Task 3: Reject grouped summaries and preserve v2 retry payloads

**Files:**
- Modify: `MoneyNotificationListenerService.kt`, `NotificationCaptureCoordinator.kt`, `CapturePreferences.kt`, and `FirebaseCandidateRepository.kt`.
- Modify: corresponding coordinator, preferences and repository tests.

**Interfaces:**
- Consumes: candidate v2 fields from Task 2.
- Produces: `NotificationEventMetadata.isGroupSummary: Boolean` and `CaptureResultCode.GROUP_SUMMARY_IGNORED`.
- Produces: sync-record v3 that reads legacy v2 records and round-trips v2 candidate schema/parser/nickname.

- [ ] **Step 1: Add failing coordinator and round-trip tests**

Assert that a grouped event leaves `rawInspected == false`, performs zero writes and returns only `GROUP_SUMMARY_IGNORED`. Assert that encoding/reloading a Wallet candidate preserves every normalized field, while an existing legacy record fixture still decodes as a strict v1 candidate.

- [ ] **Step 2: Run focused Android tests RED**

```powershell
./android-capture/gradlew.bat -p android-capture testDebugUnitTest --tests '*NotificationCaptureCoordinatorTest' --tests '*AppThemeModeTest' --tests '*FirebaseCandidateRepositoryTest'
```

- [ ] **Step 3: Implement summary and persistence boundaries**

Set `isGroupSummary` from `(event.notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0` without reading extras. Write sync-record v3, retain the v2 decoder, write candidate schema/parser values rather than constants, and include `observedInstrumentLabel` only when present.

- [ ] **Step 4: Run focused tests GREEN and commit**

Stage only Android main/test files and commit `fix(android): ignore Wallet notification summaries`.

### Task 4: Decode and match versioned evidence fail-closed

**Files:**
- Modify: `src/types/transactionImport.ts`, `transactionImportDecoder.ts`, `paymentInstrumentMatching.ts`, and `firestore.rules`.
- Modify: decoder, matcher and Firestore-rule tests.

**Interfaces:**
- Produces: `PaymentInstrument` with `schemaVersion: 1 | 2` and optional `last4` only for v2 wallet tokens.
- Produces: candidate parser contract v1 strict or v2 Wallet with optional observed nickname.
- Produces: `matchPaymentInstrument({ cardLast4, observedInstrumentLabel }, instruments)` returning `matched | none | ambiguous | conflict`.

- [ ] **Step 1: Write failing decoder and matcher tests**

Cover legacy v1, valid v2 alias-only token, invalid v2 physical card without last four, Wallet candidate v2, mixed schema/parser rejection, exact normalized nickname, physical-label exclusion, duplicate nickname, consistent dual signals, conflicting dual signals and unknown nickname.

- [ ] **Step 2: Verify unit tests RED**

```powershell
npx.cmd vitest run src/__tests__/utils/transactionImportDecoder.test.ts src/__tests__/utils/paymentInstrumentMatching.test.ts --config vitest.config.mjs --configLoader runner
```

- [ ] **Step 3: Implement minimal types, decoder and matcher**

Normalize matching labels with NFKC, remove control/format characters, collapse whitespace and lowercase. Intersect signals when both exist; never fall back to one signal after a conflict.

- [ ] **Step 4: Add and verify Firestore rule RED/GREEN**

Write emulator cases before changing rules, run `npm.cmd run test:rules`, implement exact v1/v2 shapes and rerun until all rule tests pass.

- [ ] **Step 5: Commit web contracts**

Stage only the named types/utils/rules/tests and commit `feat(web): match Wallet instruments safely`.

### Task 5: Make alias-only instruments explicit in management and confirmation

**Files:**
- Modify: `usePaymentInstruments.ts`, `transactionImportOrchestration.ts`, `PaymentInstrumentForm.tsx`, `PaymentInstrumentsSection.tsx`, `TransactionImportInbox.tsx`, and `TransactionImportReviewModal.tsx`.
- Modify: corresponding hook/component tests.

**Interfaces:**
- Consumes: matcher result and v2 contracts from Task 4.
- Produces: new/updated v2 instruments; wallet last four optional, physical last four required.
- Produces: explicit `rememberInstrument` support from nickname and/or last four without changing one-time confirmation.

- [ ] **Step 1: Write failing form/list/inbox/review tests**

Prove Wallet alias-only save, physical-card rejection, absent suffix rendering, alias-only unique suggestion, hidden observed nickname, conflict copy, remember checkbox for unmatched nickname and no remembered write when unchecked.

- [ ] **Step 2: Run component tests RED**

```powershell
npx.cmd vitest run src/__tests__/components/paymentInstrumentsSection.test.tsx src/__tests__/components/transactionImportInbox.test.tsx src/__tests__/components/transactionImportReviewModal.test.tsx --config vitest.config.mjs --configLoader runner
```

- [ ] **Step 3: Write failing orchestration tests**

Assert alias-only remember creates exactly one schema-v2 `wallet-token` inside the existing batch, unchecked remember creates none, and a server-current selected instrument whose nickname/last-four evidence changed aborts the mutation.

- [ ] **Step 4: Implement minimal UI and atomic writer changes**

Keep one modal and existing semantic styles. Use `deleteField()` when migrating an edited wallet token to v2 without last four. Show neither the observed nickname nor technical parser metadata in the inbox; only show `Android · <cuenta>` for `matched`.

- [ ] **Step 5: Run focused tests GREEN and commit**

Stage only the named web/UI/test files and commit `feat(web): support Wallet nickname associations`.

### Task 6: Verify release order and the complete implementation

**Files:**
- Modify: `tasks.md` and `implementation-notes.md` only to record privacy-safe evidence.

- [ ] **Step 1: Run full web verification**

```powershell
npm.cmd run test:rules
npm.cmd run test:run
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Expected: every command exits `0`; skipped tests are reported rather than counted as passed.

- [ ] **Step 2: Run full Android verification**

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
./android-capture/gradlew.bat -p android-capture testDebugUnitTest lintDebug assembleDebug
```

Expected: `BUILD SUCCESSFUL` and an APK under `android-capture/app/build/outputs/apk/debug/`.

- [ ] **Step 3: Run specification, graph and diff gates**

```powershell
npx.cmd --yes @fission-ai/openspec@1.6.0 validate add-android-transaction-ingestion --strict
git diff --check
git status --short
```

Update code-review-graph, inspect change risk and confirm tests exist for parser, persistence, matching, rules and UI paths.

- [ ] **Step 4: Re-read Section 13 and record evidence**

Mark a checkbox complete only when its test/build output exists. Leave device/canary tasks `9.10` and `12.10` open until real-device evidence satisfies them.

- [ ] **Step 5: Commit verification metadata**

Stage only the OpenSpec evidence files and commit `docs(openspec): record Wallet parser verification`.
