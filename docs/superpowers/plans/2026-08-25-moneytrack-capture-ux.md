# MoneyTrack Capture UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Android capture companion into a guided, system-safe experience and make the web payment-instrument matching clear, automatic and financially safe.

**Architecture:** Keep the existing PWA as ledger authority and the existing single Android Activity as capture setup/status. Web matching continues to use the persisted `PaymentInstrument.last4` contract; Android adds a pure setup-state resolver that drives XML panels, while AppCompat DayNight, Core SplashScreen and WindowInsets provide platform behavior without Compose or Navigation.

**Tech Stack:** Next 16, React 19, TypeScript 5, Vitest/Testing Library; Kotlin, Android XML Views, AppCompat 1.8.0, Core SplashScreen 1.2.0, API 26–36, JUnit 4 and Gradle 9.5.0.

**Spec:** `openspec/changes/add-android-transaction-ingestion/design.md` and the three delta specs under `openspec/changes/add-android-transaction-ingestion/specs/`.

## Global Constraints

- Work only in the isolated `feature/android-transaction-ingestion` worktree; preserve the user-owned root checkout.
- Use code-review-graph before file scanning and again for final impact/coverage review.
- Follow RED → observed failure → minimal GREEN for every production behavior.
- Do not change Firestore schemas, rules or canonical ledger authority in this refinement.
- `PaymentInstrument.last4` is the primary identifier; alias is presentation, not authority.
- Do not persist a Wallet nickname extracted from notification text without a separate sanitized fixture and contract change.
- Never expose `sourcePackage` or parser confidence in normal product UI.
- Use existing MoneyTrack web tokens and native Android platform behavior; no Compose, Navigation, motion library or new npm dependency.
- Apply Android status/navigation/cutout insets, 48 dp native targets, Spanish resources and system/default reduced motion.
- Keep raw notification text, financial values, UID and device identifiers out of logs and screenshots.

---

### Task 1: Approved OpenSpec and domain language

**Files:**
- Modify: `CONTEXT.md`
- Modify: `openspec/changes/add-android-transaction-ingestion/proposal.md`
- Modify: `openspec/changes/add-android-transaction-ingestion/design.md`
- Modify: `openspec/changes/add-android-transaction-ingestion/specs/payment-instrument-linking/spec.md`
- Modify: `openspec/changes/add-android-transaction-ingestion/specs/transaction-import-inbox/spec.md`
- Modify: `openspec/changes/add-android-transaction-ingestion/specs/android-notification-capture/spec.md`
- Modify: `openspec/changes/add-android-transaction-ingestion/tasks.md`

**Interfaces:**
- Consumes: approved UX design from the conversation.
- Produces: canonical `Alias del medio de pago` and `Terminación del medio de pago` language plus executable acceptance scenarios.

- [x] **Step 1: Record the resolved domain terms**

Add concise glossary entries stating that an alias such as `Oro` is presentation and exactly four digits identify a payment instrument minimally.

- [x] **Step 2: Amend all affected requirements**

Require web alias/last4/account management, hidden package/confidence, normalized visible amount, Android stages, theme selection and system-bar clearance.

- [x] **Step 3: Validate the amended change**

Run:

```powershell
npx.cmd --yes @fission-ai/openspec@1.6.0 validate add-android-transaction-ingestion --strict
git diff --check
```

Expected: `Change 'add-android-transaction-ingestion' is valid` and no whitespace errors.

### Task 2: Web payment identity and candidate presentation

**Files:**
- Modify: `src/__tests__/components/paymentInstrumentsSection.test.tsx`
- Modify: `src/__tests__/components/transactionImportInbox.test.tsx`
- Modify: `src/components/views/accounts/components/PaymentInstrumentModal.tsx`
- Modify: `src/components/views/accounts/components/PaymentInstrumentsSection.tsx`
- Modify: `src/components/views/transactions/components/TransactionImportInbox.tsx`

**Interfaces:**
- Consumes: `PaymentInstrument { label, accountId, last4, active }` and `matchPaymentInstrument(last4, instruments)`.
- Produces: visible alias + masked termination + linked account; technical candidate metadata remains hidden.

- [ ] **Step 1: Write the failing payment-instrument UX test**

Extend the existing create test so this interaction is required:

```tsx
fireEvent.change(screen.getByLabelText('Nombre o apodo'), {
  target: { value: 'Oro' },
});
fireEvent.change(screen.getByLabelText('Últimos 4 dígitos'), {
  target: { value: '98ab765' },
});
expect(screen.getByLabelText('Últimos 4 dígitos')).toHaveValue('9876');
expect(screen.getByText(/mismo apodo que ves en wallet/i)).toBeInTheDocument();
```

The production change that makes it pass is the new label/helper copy; digit sanitation already exists and acts as a regression assertion.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd run test:run -- src/__tests__/components/paymentInstrumentsSection.test.tsx
```

Expected: FAIL because `Nombre o apodo` and the Wallet-alias explanation are absent.

- [ ] **Step 3: Write the failing matched-row test**

Provide candidate `cardLast4: '9876'`, active instrument `label: 'Oro'`, and its credit account, then assert:

```tsx
expect(screen.getByText('Oro')).toBeInTheDocument();
expect(screen.getByText('TC principal')).toBeInTheDocument();
expect(screen.queryByText('Confianza alta')).not.toBeInTheDocument();
expect(screen.queryByText('com.android.shell')).not.toBeInTheDocument();
```

The production mutation this catches is removing matching or accidentally restoring technical badges.

- [ ] **Step 4: Verify RED**

Run:

```powershell
npm.cmd run test:run -- src/__tests__/components/transactionImportInbox.test.tsx
```

Expected: FAIL because confidence/package remain visible and no matched alias/account is rendered.

- [ ] **Step 5: Implement the minimal web presentation**

- Rename the modal label to `Nombre o apodo` and use `Ej. Oro o Nu`.
- Explain that using the Wallet nickname makes the medium recognizable.
- Keep the controlled four-digit sanitation and exact save validation.
- Remove the colored left rail from payment-instrument management and inbox toggle.
- For each candidate, call the existing matcher; on `matched`, resolve instrument/account and render both.
- Delete the confidence and package badges from normal UI; do not remove their domain fields.

- [ ] **Step 6: Verify GREEN**

Run both component suites and expect zero failures:

```powershell
npm.cmd run test:run -- src/__tests__/components/paymentInstrumentsSection.test.tsx src/__tests__/components/transactionImportInbox.test.tsx
```

### Task 3: Strict visible captured-amount behavior

**Files:**
- Modify: `src/__tests__/components/transactionImportReviewModal.test.tsx`
- Modify: `src/components/views/transactions/components/TransactionImportReviewModal.tsx`

**Interfaces:**
- Consumes: `formatNumberForInput`, `unformatNumber`, `parseCurrency`.
- Produces: controlled Colombian-formatted input whose submitted number equals the visible normalized amount.

- [ ] **Step 1: Write the failing invalid-character test**

Open a candidate, choose account/category, type `12.345,22sasasa`, and assert the input immediately equals `12.345,22`. Submit and assert the reviewed payload contains numeric `12345.22`.

```tsx
fireEvent.change(screen.getByLabelText('Monto'), {
  target: { value: '12.345,22sasasa' },
});
expect(screen.getByLabelText('Monto')).toHaveValue('12.345,22');
```

This test fails if the import field ever stores raw text again.

- [ ] **Step 2: Verify RED**

Run the single review suite and expect the raw invalid string to remain visible.

- [ ] **Step 3: Implement the existing MoneyTrack pattern**

Store the unformatted controlled value and render it through `formatNumberForInput`, matching `TransactionForm`:

```tsx
value={formatNumberForInput(amount)}
onChange={event => setAmount(unformatNumber(event.target.value))}
```

Initialize state with the same raw normalized representation. Remove the prominent side-rail “Revisión humana obligatoria” callout; retain the explicit submit action and canonical confirmation path.

- [ ] **Step 4: Verify GREEN**

Run the review-modal suite and then the three import UI suites. Expect no failure and no changed financial orchestration assertion.

### Task 4: Pure Android setup and theme state

**Files:**
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/core/CaptureSetupFlow.kt`
- Create: `android-capture/app/src/test/java/com/moneytrack/capture/core/CaptureSetupFlowTest.kt`
- Modify: `android-capture/app/src/main/java/com/moneytrack/capture/preferences/CapturePreferences.kt`
- Create: `android-capture/app/src/test/java/com/moneytrack/capture/preferences/AppThemeModeTest.kt`

**Interfaces:**
- Consumes: booleans `signedIn`, `notificationAccessGranted`, `captureEnabled`, and `allowedPackages`.
- Produces: `CaptureSetupStep` and persisted `AppThemeMode` wire values.

- [ ] **Step 1: Write resolver RED tests**

Require the exact priority:

```kotlin
assertEquals(SESSION, resolve(signedIn = false, access = false, enabled = false, sources = emptySet()))
assertEquals(NOTIFICATION_ACCESS, resolve(signedIn = true, access = false, enabled = false, sources = emptySet()))
assertEquals(CAPTURE, resolve(signedIn = true, access = true, enabled = false, sources = setOf("wallet")))
assertEquals(CAPTURE, resolve(signedIn = true, access = true, enabled = true, sources = emptySet()))
assertEquals(READY, resolve(signedIn = true, access = true, enabled = true, sources = setOf("wallet")))
```

- [ ] **Step 2: Verify RED**

Run `testDebugUnitTest --tests '*CaptureSetupFlowTest'`; expect unresolved production symbols.

- [ ] **Step 3: Implement the minimal resolver**

Use one enum and one `when` expression. Do not add Navigation, fragments or a state framework.

- [ ] **Step 4: Test theme wire parsing first**

Require `system`, `light`, `dark` and invalid fallback to `system`, then add `AppThemeMode` plus one private-preference field.

- [ ] **Step 5: Verify GREEN**

Run both focused unit tests and all existing pure Android tests.

### Task 5: Android platform shell, splash and themes

**Files:**
- Modify: `android-capture/gradle/libs.versions.toml`
- Modify: `android-capture/app/build.gradle.kts`
- Modify: `android-capture/app/src/main/AndroidManifest.xml`
- Modify: `android-capture/app/src/main/res/values/styles.xml`
- Modify: `android-capture/app/src/main/res/values/colors.xml`
- Create: `android-capture/app/src/main/res/values-night/colors.xml`
- Create: `android-capture/app/src/main/res/values-night/styles.xml`
- Create: `android-capture/app/src/main/res/drawable/ic_moneytrack_wallet.xml`

**Interfaces:**
- Consumes: official AppCompat DayNight and Core SplashScreen APIs.
- Produces: `Theme.MoneytrackCapture.Starting` → `Theme.MoneytrackCapture` and semantic light/night resources.

- [ ] **Step 1: Pin only the two approved platform dependencies**

Add `androidx.appcompat:appcompat:1.8.0` and `androidx.core:core-splashscreen:1.2.0`; no other library.

- [ ] **Step 2: Implement the branded native splash**

Use the MoneyTrack wallet vector, brand violet and theme surface. Set `postSplashScreenTheme` and call `installSplashScreen()` before `super.onCreate()`.

- [ ] **Step 3: Implement semantic light/night resources**

Mirror the PWA roles: background, card, primary/secondary text, border, violet and status colors. The starting theme must resolve correctly in both configurations.

- [ ] **Step 4: Verify the platform shell**

Run `processDebugResources lintDebug`; expect no resource or theme failure.

### Task 6: State-driven Android UI and system insets

**Files:**
- Modify: `android-capture/app/src/main/java/com/moneytrack/capture/MainActivity.kt`
- Replace: `android-capture/app/src/main/res/layout/activity_main.xml`
- Modify: `android-capture/app/src/main/res/values/strings.xml`
- Modify: `android-capture/app/src/main/res/values/dimens.xml`
- Modify: `android-capture/app/src/main/res/drawable/status_panel.xml`

**Interfaces:**
- Consumes: `CaptureSetupFlow.resolve`, `AppThemeMode`, Firebase session, notification access, preferences and discovered source labels.
- Produces: one visible setup/ready panel and exclusive auth actions.

- [ ] **Step 1: Build one XML screen with four panels**

Create `session_step`, `notification_step`, `capture_step`, and `ready_step` under one inset-aware `ScrollView`; only the resolved panel is visible. Use a real three-step progress indicator because the sequence is meaningful.

- [ ] **Step 2: Route real state in MainActivity**

- Extend `AppCompatActivity`.
- Apply the saved DayNight mode before drawing.
- Install splash and release it after initial local state is ready.
- Render only the resolved panel.
- Show sign-in only for `SESSION`; show sign-out only while signed in.
- Use discovered application labels in checkboxes/status and never append package IDs.
- Use the canonical GitHub Pages URL.

- [ ] **Step 3: Apply system-bar/cutout insets**

Call edge-to-edge and apply `WindowInsetsCompat.Type.systemBars() or displayCutout()` to the scroll container's original top/bottom padding. Set light/dark system-bar icon appearance from the active configuration.

- [ ] **Step 4: Wire theme and capture controls**

Persist `Sistema / Claro / Oscuro`, apply with `AppCompatDelegate`, recreate only when the value changes, and preserve source/capture state.

- [ ] **Step 5: Run Android GREEN checks**

Run:

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest lintDebug assembleDebug
```

Expected: all unit tests pass, lint has no new accessibility/security issue, APK builds.

### Task 7: Integrated verification and canary handoff

**Files:**
- Modify: `openspec/changes/add-android-transaction-ingestion/implementation-notes.md`
- Modify: `openspec/changes/add-android-transaction-ingestion/tasks.md`

**Interfaces:**
- Consumes: final web build and debug APK.
- Produces: reproducible evidence without raw financial data.

- [ ] **Step 1: Run focused and static web verification**

```powershell
npm.cmd run test:run -- src/__tests__/components/paymentInstrumentsSection.test.tsx src/__tests__/components/transactionImportInbox.test.tsx src/__tests__/components/transactionImportReviewModal.test.tsx
npm.cmd run typecheck
npm.cmd run lint
```

- [ ] **Step 2: Verify web visually**

At 390×844 and 1440×900, in light/dark, inspect payment-medium create/edit, masked digits, matched alias/account, hidden technical metadata, amount sanitation, focus and overflow.

- [ ] **Step 3: Install and verify on the authorized USB device**

```powershell
adb install -r android-capture/app/build/outputs/apk/debug/app-debug.apk
```

Verify splash, each missing-state route, return-to-ready, exclusive auth action, source labels, canonical link, all three themes and clearance above/below system bars. Record no account, amount, UID, serial or notification text.

- [ ] **Step 4: Review graph impact and full relevant regressions**

Use `detect_changes`, `get_affected_flows` and `tests_for`; then run the full web suite/build only after focused checks are green.

- [ ] **Step 5: Close documentation evidence**

Update OpenSpec checkboxes only for observed evidence, append exact test/build outcomes to implementation notes, validate OpenSpec strictly, run `git diff --check`, and keep canary tasks 9.7–9.10 open.

## Self-review

- Spec coverage: every approved web, matching, amount, Android flow, theme and inset requirement maps to Tasks 2–7.
- Type consistency: no new persisted field; `PaymentInstrument.last4` and existing matcher remain the only account-recommendation contract.
- Placeholder scan: the plan contains no TBD/TODO/FIXME or unspecified implementation step.
- Scope: production deployment and automatic ledger posting remain outside this plan; debug installation is limited to the already authorized canary device.
