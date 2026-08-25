# Android Transaction Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task and `superpowers:test-driven-development` for every production change.

**Goal:** Capturar compras notificadas en Android como candidatos seguros, relacionar cada plástico/token con una cuenta o TC y confirmarlas de forma atómica e idempotente desde Moneytrack web.

**Architecture:** La PWA conserva la autoridad del registro; un compañero Android autenticado publica solo candidatos normalizados. `PaymentInstrument` relaciona el identificador observado con `Account`; `confirmTransactionImport` convierte un candidato revisado en `Transaction` usando `executeAuthenticatedLedgerMutation` y un único batch.

**Tech Stack:** Next 16, React 19, TypeScript 5, Firebase Web 12, Vitest 4, Firebase Emulator; Android Kotlin con AGP 9.3.0, Gradle 9.5.0, JDK 17, API 26–36, Firebase BoM 34.18.0, Credential Manager 1.6.0 y vistas XML.

**Spec:** `proposal.md`, `design.md`, `specs/payment-instrument-linking/spec.md`, `specs/transaction-import-inbox/spec.md` y `specs/android-notification-capture/spec.md` en este cambio.

**Global constraints:**

- Ejecutar comandos desde la raíz del worktree activo en PowerShell (en esta ejecución, `C:\Users\camilo.guzman_pragma\AppData\Local\Temp\Moneytrack-android-transaction-ingestion`); usar `npm.cmd`, `npx.cmd` y `gradlew.bat` en Windows.
- Antes de explorar impacto, usar code-review-graph; después de cada grupo, revisar `detect_changes`, flujos afectados y cobertura antes de ampliar lecturas.
- Preservar cualquier cambio ajeno. Nunca usar `git add .`; verificar `git diff --cached --name-only` antes de cada commit.
- Escribir primero una prueba que falle por el comportamiento esperado, ejecutar para comprobar el fallo, implementar lo mínimo y ejecutar de nuevo hasta verde.
- No añadir dependencias npm, backend, Cloud Functions, telemetría, parser por banco sin fixture sanitizado, auto-confirmación ni escritura Android directa a `transactions`.
- No persistir ni imprimir texto crudo, PAN, CVV, OTP, monto, comercio o últimos cuatro en logs Android.
- Toda mutación financiera autenticada MUST recargar contexto servidor-actual y pasar por `executeAuthenticatedLedgerMutation`; no derivar saldos de la ventana paginada.
- Mantener UI con `PRODUCT.md`, `DESIGN.md`, `app/styles/theme.css` y `app/styles/components.css`: un solo violeta, sin gradientes nuevos, objetivos de 44 px, foco visible y contraste WCAG 2.1 AA.
- No editar ni stagear los cambios ajenos detectados al redactar este plan: `src/__tests__/hooks/notificationPreferencesMerge.test.ts`, `src/__tests__/services/BudgetMonitor.test.ts`, `src/hooks/useNotificationPreferences.ts`, `src/services/BudgetMonitor.ts`, adjuntos de `.codex-remote-attachments/` ni archivos de `tmp/`.

## Planned file structure

```text
CONTEXT.md
firestore.rules
firestore.indexes.json
package.json
src/
  types/
    finance.ts
    transactionImport.ts
  utils/
    paymentInstrumentMatching.ts
    transactionImportDecoder.ts
  hooks/firestore/
    accountOrchestration.ts
    index.ts
    transactionImportOrchestration.ts
    usePaymentInstruments.ts
    useTransactionImportCandidates.ts
  components/views/accounts/
    AccountsView.tsx
    components/PaymentInstrumentModal.tsx
    components/PaymentInstrumentsSection.tsx
  components/views/transactions/
    TransactionsView.tsx
    components/TransactionImportInbox.tsx
    components/TransactionImportReviewModal.tsx
  __tests__/
    firestore/transactionImport.rules.test.ts
    hooks/accountCascadeDelete.test.ts
    hooks/accountMergeAndDefault.test.ts
    hooks/transactionImportOrchestration.test.ts
    hooks/usePaymentInstruments.test.ts
    hooks/useTransactionImportCandidates.test.ts
    integration/ledgerIngressParity.test.ts
    utils/paymentInstrumentMatching.test.ts
    utils/transactionImportDecoder.test.ts
    components/paymentInstrumentsSection.test.tsx
    components/transactionImportInbox.test.tsx
    components/transactionImportReviewModal.test.tsx
android-capture/
  README.md
  build.gradle.kts
  settings.gradle.kts
  gradle.properties
  gradle/libs.versions.toml
  gradle/wrapper/gradle-wrapper.properties
  gradlew
  gradlew.bat
  app/
    build.gradle.kts
    src/main/AndroidManifest.xml
    src/main/java/com/moneytrack/capture/
      MainActivity.kt
      auth/GoogleSignInController.kt
      capture/CandidateFingerprint.kt
      capture/CaptureEligibility.kt
      capture/CapturePreferences.kt
      capture/MoneyNotificationListenerService.kt
      capture/RawNotification.kt
      capture/StrictCopPurchaseParser.kt
      data/FirebaseCandidateRepository.kt
      model/NormalizedPurchaseCandidate.kt
    src/main/res/layout/activity_main.xml
    src/main/res/values/strings.xml
    src/test/java/com/moneytrack/capture/
      capture/CandidateFingerprintTest.kt
      capture/CaptureEligibilityTest.kt
      capture/StrictCopPurchaseParserTest.kt
      data/FirebaseCandidateRepositoryTest.kt
docs/android-capture-canary.md
```

## 1. Baseline and execution guardrails

- [x] 1.1 Capture the starting state with `git status --short`, `git diff --stat`, and `npx.cmd --yes @fission-ai/openspec@1.6.0 status --change add-android-transaction-ingestion`; save no generated output and confirm only this change is intentionally new.
- [x] 1.2 Query code-review-graph for `executeAuthenticatedLedgerMutation`, `deleteAccountCascade`, `mergeCreditCardsOrchestrated`, `TransactionsView`, and `AccountsView`; record the affected files in the implementation notes before editing.
- [x] 1.3 Run `npm.cmd run test:run -- src/__tests__/integration/ledgerIngressParity.test.ts src/__tests__/hooks/ledgerMutationOrchestration.test.ts src/__tests__/hooks/transactionsWritePath.test.ts`; expect all current ledger-boundary tests to pass before adding a new ingress.
- [x] 1.4 Run `npm.cmd run typecheck` and `npm.cmd run lint`; if either fails, separate pre-existing failures from this change and do not conceal them with disables or unrelated edits.

## 2. Domain contracts and fail-closed decoding

- [x] 2.1 Add failing cases in `src/__tests__/utils/transactionImportDecoder.test.ts` for every valid `PaymentInstrument`/`TransactionImportCandidate` field, unknown schema versions, illegal status-field combinations, invalid dates/amounts/enums and forbidden raw keys; run `npm.cmd run test:run -- src/__tests__/utils/transactionImportDecoder.test.ts` and confirm failure because the decoder does not exist.
- [x] 2.2 Implement `src/types/transactionImport.ts` with the exact persisted/domain types from `design.md`, and `src/utils/transactionImportDecoder.ts` with strict `decodePaymentInstrument` and `decodeTransactionImportCandidate` results that never coerce malformed financial data; rerun the test and expect green.
- [x] 2.3 Add failing cases in `src/__tests__/utils/paymentInstrumentMatching.test.ts` for unique active match, inactive match, no match and duplicate-last4 ambiguity; implement `src/utils/paymentInstrumentMatching.ts` so only one active exact match can suggest an account; rerun and expect green.
- [x] 2.4 Add `'android'` to `LedgerMutationSource` in `src/types/finance.ts` and first add `['android', 'create']` to `src/__tests__/integration/ledgerIngressParity.test.ts`; run that test before and after the type change and expect the same insufficient-funds/affordable-debit behavior as every other ingress.
- [x] 2.5 Run `npm.cmd run test:run -- src/__tests__/utils/transactionImportDecoder.test.ts src/__tests__/utils/paymentInstrumentMatching.test.ts src/__tests__/integration/ledgerIngressParity.test.ts` and `npm.cmd run typecheck`; expect zero failures and no unsafe casts added to consumers.

## 3. Firestore rules, indexes and emulator proof

- [x] 3.1 Create `src/__tests__/firestore/transactionImport.rules.test.ts` red tests for own/foreign reads; valid/invalid instrument creates; unknown/sensitive keys; missing account; candidate `pending` create; idempotent no-op; dismiss; confirmed batch with an active ledger lease and matching transaction; confirmation without that lease; and forbidden terminal reopen.
- [x] 3.2 Update `package.json` so `test:rules:run` executes both `accountOperationLock.rules.test.ts` and `transactionImport.rules.test.ts`; run `npm.cmd run test:rules` and confirm the new assertions fail against current rules while the old suite stays green.
- [x] 3.3 Implement exact-shape helpers and `match /paymentInstruments/{instrumentId}` plus `match /transactionImportCandidates/{candidateId}` in `firestore.rules`; validate account references, enums, four digits, timestamps, state transitions and the `existsAfter`/operation identity for confirmation.
- [x] 3.4 Add the `transactionImportCandidates` composite index `status ASC, occurredAt DESC` to `firestore.indexes.json`; run `node -e "JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8')); console.log('indexes json valid')"` and expect `indexes json valid`; never deploy from this task.
- [x] 3.5 Run `npm.cmd run test:rules`; expect both rules suites green, including denial of every forbidden raw field and all foreign-user operations.
- [x] 3.6 Review the rules diff manually for default-deny coverage and run `git diff --check -- firestore.rules firestore.indexes.json package.json src/__tests__/firestore/transactionImport.rules.test.ts`; expect no whitespace errors.
- [x] 3.7 Commit only this slice after `git diff --cached --name-only` shows the contract/rules files: `git commit -m "feat(import): define secure candidate contracts"`.

## 4. Payment-instrument persistence and account lifecycle

- [x] 4.1 Add red hook tests in `src/__tests__/hooks/usePaymentInstruments.test.ts` for authenticated subscription, exact create/update/deactivate/delete payloads, server timestamps, user switch cleanup, errors and guest no-op; confirm they fail before the hook exists.
- [x] 4.2 Implement `src/hooks/firestore/usePaymentInstruments.ts` with one owner-scoped listener and CRUD callbacks; export it from `src/hooks/firestore/index.ts`; rerun the hook tests and expect green.
- [x] 4.3 Extend `src/__tests__/hooks/accountMergeAndDefault.test.ts` first with a failing case that expects every source-card instrument to be reassigned to the destination and counted in batch capacity.
- [x] 4.4 Update `mergeCreditCardsOrchestrated` in `src/hooks/firestore/accountOrchestration.ts` to load source instruments from the server, stage `accountId`/`updatedAt` updates in the existing batch and include their writes in `assertAtomicBatchCapacity`; rerun the focused merge tests and expect green.
- [x] 4.5 Extend `src/__tests__/hooks/accountCascadeDelete.test.ts` first with a failing case that expects linked instruments to be deleted atomically while unrelated instruments survive.
- [x] 4.6 Update `deleteAccountCascade` in `src/hooks/firestore/accountOrchestration.ts` to load and delete linked instruments under the existing lease and capacity accounting; rerun cascade tests and expect green.
- [x] 4.7 Run `npm.cmd run test:run -- src/__tests__/hooks/usePaymentInstruments.test.ts src/__tests__/hooks/accountMergeAndDefault.test.ts src/__tests__/hooks/accountCascadeDelete.test.ts` and `npm.cmd run typecheck`; expect zero failures.

## 5. Candidate subscription, dismissal and canonical confirmation

- [x] 5.1 Add red tests in `src/__tests__/hooks/useTransactionImportCandidates.test.ts` for the owner query `status == pending`, `occurredAt desc`, limit 100, strict decoding, invalid-document error, user switch cleanup and the `pending → dismissed` write.
- [x] 5.2 Implement `src/hooks/firestore/useTransactionImportCandidates.ts` with the bounded live query, fail-closed decoder and terminal dismiss callback; export it from `src/hooks/firestore/index.ts`; rerun and expect green.
- [x] 5.3 Add red unit tests in `src/__tests__/hooks/transactionImportOrchestration.test.ts` for deterministic operation ID, server reload, savings expense, credit `usedCredit`, remembered instrument, one-batch candidate closure, successful retry, dismissed candidate, missing account/instrument, changed server state and batch-capacity rejection.
- [x] 5.4 Implement `src/hooks/firestore/transactionImportOrchestration.ts` with `confirmTransactionImport(userId, candidateId, reviewedExpense)`; use `validateLedgerMutationOperationId`, `executeAuthenticatedLedgerMutation`, `planCreditAuthorityChanges` or its extracted shared equivalent, transaction ID `ledger-mutation:android:<candidateId>` and `mutationSource: 'android'`.
- [x] 5.5 If credit authority staging is private to `useTransactionsCRUD.ts`, extract only that pure shared primitive to `src/hooks/firestore/ledgerMutationOrchestration.ts` with existing tests; do not duplicate credit math or weaken the canonical writer.
- [x] 5.6 Ensure `confirmTransactionImport` returns the already committed transaction when candidate and operation identity prove a previous successful commit, and rejects any mismatched terminal state; rerun orchestration tests and expect exactly one financial write per candidate.
- [x] 5.7 Run `npm.cmd run test:run -- src/__tests__/hooks/transactionImportOrchestration.test.ts src/__tests__/hooks/ledgerMutationOrchestration.test.ts src/__tests__/hooks/transactionsWritePath.test.ts src/__tests__/integration/ledgerIngressParity.test.ts`; expect all new and existing ingress tests green.
- [x] 5.8 Use code-review-graph `get_affected_flows` and `tests_for` on the changed writer files; add a focused regression test before continuing if any create/credit-payment flow is affected without coverage.

## 6. Web management and review UI

- [x] 6.1 Add red component tests in `src/__tests__/components/paymentInstrumentsSection.test.tsx` for empty/authenticated state, create/edit, active toggle, delete confirmation, account labels, four-digit validation, 44 px controls, keyboard dialog close and focus return.
- [x] 6.2 Implement `PaymentInstrumentModal.tsx` and `PaymentInstrumentsSection.tsx` under `src/components/views/accounts/components/` using existing semantic classes and copy “Medios de pago del celular”; no new shared design primitive or gradient.
- [x] 6.3 Integrate `PaymentInstrumentsSection` after the existing account list in `AccountsView.tsx`, sourcing `user.uid` through the existing auth context and all accounts through `useAccountDomain`; keep guest behavior unchanged; rerun the component test and expect green.
- [x] 6.4 Add red tests in `src/__tests__/components/transactionImportInbox.test.tsx` for pending counter, collapsed/expanded state, truthful no-ledger copy, 100-row limit notice, dismiss, invalid-data error and focus behavior.
- [x] 6.5 Implement `TransactionImportInbox.tsx` under `src/components/views/transactions/components/` with amount/date/source/confidence presentation and existing button/card/status styles; rerun and expect green.
- [x] 6.6 Add red tests in `src/__tests__/components/transactionImportReviewModal.test.tsx` for suggested account, ambiguous/no match, required category/account, edited amount/merchant/date, credit installments/interest, remember-instrument eligibility, offline block, server error preservation and double-submit guard.
- [x] 6.7 Implement `TransactionImportReviewModal.tsx` as a feature-local form that calls `confirmTransactionImport`; reuse validators/formatters/interest calculator already used by `useAddTransaction`, but do not route an import through plain `addTransaction` or duplicate financial authority math.
- [x] 6.8 Integrate the inbox before transaction filters in `TransactionsView.tsx`; keep the regular `TransactionForm`, pagination, empty states and mobile journey unchanged; rerun all three new UI suites and expect green.
- [x] 6.9 Run `npm.cmd run test:run -- src/__tests__/components/paymentInstrumentsSection.test.tsx src/__tests__/components/transactionImportInbox.test.tsx src/__tests__/components/transactionImportReviewModal.test.tsx src/__tests__/components/transactionFormCompact.test.tsx src/__tests__/components/accountsViewMerge.test.tsx` and `npm.cmd run typecheck`; expect zero regressions.
- [x] 6.10 Commit only the scoped web files after inspecting the staged list: `git commit -m "feat(import): review Android purchase candidates"`.

## 7. Android project and pure capture core

- [x] 7.1 Create `android-capture/settings.gradle.kts`, root/app `build.gradle.kts`, `gradle.properties` and `gradle/libs.versions.toml` with the versions in `design.md`, built-in Kotlin, `applicationId com.moneytrack.capture`, API 26–36, Java 17, Firebase main modules, Activity KTX and Credential Manager; do not add Compose, Analytics or Crashlytics.
- [x] 7.2 Generate and commit the Gradle 9.5.0 wrapper (`gradlew`, `gradlew.bat`, `gradle/wrapper/*`) with `$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'`; create a unique temp directory with `$androidGradleTemp = Join-Path ([System.IO.Path]::GetTempPath()) ("moneytrack-gradle-" + [guid]::NewGuid())`, download `https://services.gradle.org/distributions/gradle-9.5.0-bin.zip`, expand it there and run its `bin\gradle.bat -p android-capture wrapper --gradle-version 9.5.0`; then run `& "$env:JAVA_HOME\bin\java.exe" -version` and `.\android-capture\gradlew.bat -p android-capture --version`; expect JDK 17+ and Gradle 9.5.0.
- [x] 7.3 Update `.gitignore` for `android-capture/.gradle/`, `android-capture/**/build/`, `android-capture/local.properties`, `android-capture/app/google-services.json`, `*.jks`, `*.keystore` and signing properties; verify `git check-ignore -v android-capture/app/google-services.json` reports the new rule.
- [x] 7.4 Add red parser tests in `StrictCopPurchaseParserTest.kt` for `$ 12.345,67`, `COP 12.345`, merchant/last4 extraction, missing last4 medium confidence, two amounts, rejection/reversal/OTP terms, USD and malformed values; run `.\android-capture\gradlew.bat -p android-capture testDebugUnitTest` and confirm failure because production classes do not exist.
- [x] 7.5 Implement `RawNotification.kt`, `NormalizedPurchaseCandidate.kt` and `StrictCopPurchaseParser.kt` as pure Kotlin with no Android/Firebase dependency; rerun the parser suite and expect every accepted/rejected fixture to match the specification.
- [x] 7.6 Add red `CandidateFingerprintTest.kt` cases for same event/same hash, changed key/time/different hash, 64 lowercase hex characters and absence of financial text; implement `CandidateFingerprint.kt` with SHA-256 and rerun green.
- [x] 7.7 Add red `CaptureEligibilityTest.kt` cases for signed-out, disabled capture, missing access, empty allowlist, wrong package and ready state; implement `CaptureEligibility.kt` plus `CapturePreferences.kt` with private `SharedPreferences` and random installation UUID; rerun green.
- [x] 7.8 Run `.\android-capture\gradlew.bat -p android-capture testDebugUnitTest`; expect all pure-core tests green before adding the Android service.

## 8. Android authentication, repository, listener and status UI

- [x] 8.1 Add `AndroidManifest.xml` with `MainActivity` and an exported=false `MoneyNotificationListenerService` protected by `android.permission.BIND_NOTIFICATION_LISTENER_SERVICE` and the official listener action; add no `QUERY_ALL_PACKAGES`, broad storage, contacts, SMS, accessibility or location permission.
- [x] 8.2 Add red `FirebaseCandidateRepositoryTest.kt` cases using a fake document sink for exact path, exact normalized keys, deterministic document ID, pending status, no raw/sensitive keys and generic error mapping; confirm failure before the repository exists.
- [x] 8.3 Implement `FirebaseCandidateRepository.kt` so its public input is only `NormalizedPurchaseCandidate`, writes only the deterministic payload at `users/{uid}/transactionImportCandidates/{candidateId}` and relies on Firestore offline persistence; rerun repository tests green.
- [x] 8.4 Implement `GoogleSignInController.kt` with Credential Manager 1.6.0, `GetGoogleIdOption`, the generated web client ID and Firebase `signInWithCredential`; clear Firebase and credential state on sign-out and expose no tokens to logs.
- [x] 8.5 Implement `MoneyNotificationListenerService.kt`: for a non-allowed source record only package/label locally, and for an allowed source check eligibility before reading extras, build an in-memory `RawNotification`, parse, fingerprint, call the repository and immediately release raw references; log only enumerated result codes.
- [x] 8.6 Add `activity_main.xml`, `strings.xml` and `MainActivity.kt` with state rows for session/access/capture/packages/last result and actions for Google sign-in, sign-out, Android notification-listener settings, source selection and PWA URL; all strings must be resources and controls must have accessible labels/44 px height.
- [x] 8.7 Add unit tests around the service coordinator by extracting only a small injectable coordinator if direct service testing is impractical; prove wrong-package/raw-parser failures never call the repository and duplicate events use the same document ID.
- [x] 8.8 Run `.\android-capture\gradlew.bat -p android-capture testDebugUnitTest lintDebug`; expect zero test/lint errors without suppressing security or accessibility findings.
- [x] 8.9 Commit only `android-capture/` and `.gitignore` after confirming no `google-services.json`, key or build artifact is staged: `git commit -m "feat(android): capture normalized purchase notifications"`.

## 9. Firebase setup, end-to-end canary and migration evidence

- [x] 9.1 Create `android-capture/README.md` with exact local prerequisites, Firebase app registration, location of untracked `google-services.json`, JDK path, build/install commands, permission flow and the explicit statement that the app observes future notifications rather than Wallet history.
- [x] 9.2 Create `docs/android-capture-canary.md` with a privacy-safe evidence table: candidate ID prefix, source package, parser result code, candidate presence, reviewed amount correct yes/no, account suggestion correct yes/no, false positive yes/no and duplicate ledger post yes/no; prohibit raw text, merchant, amount and last4 in the evidence log.
- [x] 9.3 In Firebase Console, register Android app `com.moneytrack.capture` in the existing Moneytrack project, run `.\android-capture\gradlew.bat -p android-capture signingReport`, add debug/canary SHA-1 and SHA-256, download `google-services.json` locally and verify it remains ignored.
- [x] 9.4 Build with `.\android-capture\gradlew.bat -p android-capture clean testDebugUnitTest lintDebug assembleDebug`; expect `android-capture/app/build/outputs/apk/debug/app-debug.apk` and no tracked generated files.
- [x] 9.5 Install on one canary device with `adb install -r android-capture/app/build/outputs/apk/debug/app-debug.apk`; sign in with the same Google account as the PWA and verify the UID against a candidate path without copying the UID into public evidence.
- [x] 9.6 Enable notification access, choose one source package, trigger one synthetic accepted fixture and one rejected fixture locally, and verify only the accepted normalized candidate appears in the PWA while neither changes balances.
- [ ] 9.7 Confirm the accepted candidate from the PWA twice using a simulated lost response; verify one transaction document, one candidate `confirmed`, one `usedCredit` delta when the selected account is credit and no second ledger effect.
- [ ] 9.8 Disable access and send another fixture; verify no candidate. Re-enable, disconnect network, send a valid fixture, reconnect and verify the queued normalized candidate appears exactly once.
- [ ] 9.9 Run the private canary for at least 14 days and at least 50 eligible notifications; record only the safe metrics and require zero double postings, zero raw-payload persistence, at least 95% amount accuracy, at least 90% account-suggestion accuracy and at most 5% false positives.
- [ ] 9.10 If any acceptance threshold fails, keep confirmation manual, disable the failing source/parser and open a separate OpenSpec change with sanitized fixtures; do not weaken the parser or enable auto-confirmation in this change.

## 10. Full verification and handoff

- [x] 10.1 Run all focused web tests for decoders, matching, rules, hooks, orchestration, account lifecycle and UI; expect zero failures and no snapshots accepted without visual inspection.
- [x] 10.2 Run `npm.cmd run test:rules`, `npm.cmd run test:run`, `npm.cmd run typecheck`, `npm.cmd run lint` and `npm.cmd run build`; record exact pass counts and any environment-only warning separately.
- [x] 10.3 Run `.\android-capture\gradlew.bat -p android-capture clean testDebugUnitTest lintDebug assembleDebug`; expect all tasks successful and a reproducible debug APK.
- [ ] 10.4 Start the PWA and verify with the in-app browser at 390×844 and 1440×900, light and dark: Cuentas manager, empty/populated inbox, review validation, keyboard focus/return, offline block, confirm/dismiss and unchanged normal transaction journey; capture screenshots without financial values.
- [x] 10.5 Use code-review-graph `detect_changes`, `get_affected_flows` and `tests_for`; resolve every uncovered high-risk financial path or document why an existing test proves it.
- [x] 10.6 Run `npx.cmd --yes @fission-ai/openspec@1.6.0 validate add-android-transaction-ingestion --strict` and `git diff --check`; expect strict validation success and no whitespace/placeholders.
- [x] 10.7 Search with `rg -n "[T]BD|[T]ODO|[F]IXME|rawPayload|bigText|cvv|otp|google-services.json" CONTEXT.md openspec/changes/add-android-transaction-ingestion src android-capture docs`; expect no planning placeholders, no production raw-field persistence and only intentional test, transient parser/rejection, ignore/config or documentation matches.
- [x] 10.8 Review `git status --short` and `git diff --cached --name-only`; ensure unrelated starting changes and local secrets were never staged, then commit the final docs/verification slice as `docs(import): add Android capture canary runbook`.
- [x] 10.9 Mark OpenSpec checkboxes complete only after their evidence exists; do not archive `add-android-transaction-ingestion` until the 14-day/50-event canary satisfies every acceptance threshold and no required work remains.

## 11. Approved UX refinement and guided Android setup

- [x] 11.1 Amend the domain glossary, design and delta specs for web-managed alias/last4/account identity, hidden technical candidate metadata, strict visible amount normalization, guided Android stages, system insets and light/dark modes; validate OpenSpec strictly before production edits.
- [ ] 11.2 Add failing web component tests proving the payment-instrument form explains aliases such as `Oro`, sanitizes exactly four digits, the inbox shows a uniquely matched alias/account without package/confidence, and the review amount removes invalid characters while submitting the normalized visible value.
- [ ] 11.3 Implement the minimal web UI changes in `PaymentInstrumentModal.tsx`, `PaymentInstrumentsSection.tsx`, `TransactionImportInbox.tsx` and `TransactionImportReviewModal.tsx`; remove the three colored side rails/callout without changing ledger authority or persisted schemas.
- [ ] 11.4 Add failing Android unit tests for a pure `CaptureSetupFlow` resolver covering `SESSION`, `NOTIFICATION_ACCESS`, `CAPTURE` and `READY`, including revoked access and source/capture prerequisites.
- [ ] 11.5 Add AppCompat 1.8.0 and Core SplashScreen 1.2.0, implement a MoneyTrack wallet splash and a persisted `Sistema / Claro / Oscuro` preference, and keep the single-Activity XML architecture.
- [ ] 11.6 Replace the long Android status document with state-driven setup/ready panels, friendly source labels, exclusive auth actions, the canonical PWA URL and edge-to-edge system-bar insets; add day/night resources with 48 dp controls and accessible Spanish copy.
- [ ] 11.7 Run focused RED/GREEN web and Android tests, then web typecheck/lint and Android `testDebugUnitTest lintDebug assembleDebug`; resolve every introduced warning or failure before device work.
- [ ] 11.8 Install the rebuilt debug APK on the authorized canary device and verify launch, session routing, notification routing, capture routing, ready state, light/dark/system modes and status/navigation-bar clearance without recording financial values.
- [ ] 11.9 Verify the PWA at 390×844 and 1440×900 in light/dark for medium creation/editing, matched candidate presentation, amount sanitation and review focus; run the final graph impact/tests review and strict OpenSpec validation.
