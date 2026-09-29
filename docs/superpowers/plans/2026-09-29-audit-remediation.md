# Audit remediation implementation plan

**Goal:** Correct the verified financial integrity and synchronization defects, then remove the identified unused code and animation dependency.

**Architecture:** Keep the pure ledger planner and shared Firestore mutation coordinator. Put invariant checks in shared writers, not only in UI handlers. No new runtime dependency or backend.

**Spec:** Audit and execution authorization in the current chat, 2026-09-29.

## Constraints

- Preserve the existing change in `openspec/changes/harden-notification-delivery-and-recurring-reminders/tasks.md`.
- Use graph relationships first; verify against current source because the index contains duplicate Windows paths.
- Follow PRODUCT.md and DESIGN.md for UI; read installed Next documentation.
- Add failing behavioral regressions before each nontrivial fix. Use existing Vitest infrastructure and simulated external services.
- No live financial mutations, deployment or release.

## Ordered work

- [x] **1. Ledger integrity:** Recheck stable operation identities inside the existing shared lease before applying deltas. Coordinate edits of debt-linked transactions, or reject unsupported semantic changes in the shared writer. Verify authenticated and guest paths. Regressions: stale preflight after another commit; payment amount 200 to 300 updates remaining debt 800 to 700; invalid edits leave all records unchanged.
- [x] **2. Synchronization and persistence:** In `useGeminiApiKey.ts`, propagate confirmed remote deletion without treating an empty cache or pending snapshot as server authority. In `usePlanConfig.ts` and `FinancialPlanView.tsx`, preserve confirmed state on rejected saves/deletes and report errors. Regressions: remote key deletion, metadata-only confirmation, write rejection and user switch during a pending write.
- [x] **3. Subscription efficiency:** In `useBalanceTransactions.ts`, retain a full-history listener across pending writes while independently gating balances. In `useAllTransactions.ts`, skip decoding unchanged documents on metadata-only events. Regressions: settled/pending/settled sequence does not reconnect; server readiness still advances without document changes.
- [x] **4. Simplification and controls:** Remove the unused credit-history hook while retaining the used merge helper; replace animated amounts with formatted text and remove Motion; correct literal JSX Unicode; add Android CI checks using the documented Gradle tasks.
- [x] **5. Verification:** Run lint, TypeScript, complete unit suite, Firestore emulator tests and static web build. Run Android unit tests/lint/debug assembly if the local toolchain supports them. Review the final diff independently; document actual limitations rather than claiming unrun checks.

## Review focus

- A repeated operation must not mutate accounts again and must release its lease.
- Debt payments, principal edits, settled/forgiven debts and guest data must retain their accounting invariants.
- A pending write or old user's asynchronous callback must not overwrite a new session's state.
- Empty caches and metadata-only snapshots must not make incomplete balances authoritative.
- Static amount presentation must retain privacy masking and accessible complete values.

## Execution record

- Baseline: HEAD `9c04a0c`; only the existing OpenSpec task document is modified. Previous audit checks: lint, types and 1,634 unit tests passing.
- Work owners: ledger reviewer implements stage 1; root and plan reviewer prepare stage 2; history reviewer prepares stage 3. Production changes for later stages start after the preceding integrity gate passes.
- Independent review found two additional cases, both reproduced before correction: guest plan writes incorrectly reported success when local storage failed, and amount edits retained stale financing calculations on legacy debt transactions. The shared local-storage setter now publishes state only after persistence; the shared debt edit planner rejects unsupported financed amount changes while permitting descriptive edits.
- Focused checks after those fixes: 98 ledger writer tests and 56 plan/storage/UI tests passed. History, pagination, cache and merge checks passed (49 tests). The full-suite assertion tied to animated amount labels now checks the same visible amount as text.
- Firestore emulator: all 75 rules tests passed against `demo-moneytrack`; the emulator stopped afterward. A local Java loopback startup failure was resolved with a process-only `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Users\camilo.guzman_pragma\Desktop\Moneytrack`. No global Java configuration changed.
- Independent review of the final TypeScript changes found no remaining actionable issues.
- Final web verification: `npm run lint`, `npm run typecheck -- --incremental false`, and direct `next build` all passed. The full Vitest run passed 1,681 tests across 171 files. Its 75 emulator-only tests were skipped in that run and passed separately against the demo emulator. The direct Next build validated static export without changing the service-worker release version.
- Android: `testDebugUnitTest lintDebug assembleDebug` passed, with 207 tests, zero failures/errors/skips. Lint reported seven version advisories (OldTargetApi: 1, AndroidGradlePluginVersion: 1, GradleDependency: 5), no errors. Assembly reused the existing up-to-date debug artifact; no new APK or device validation is claimed. The local Java setting above enabled these checks.
- Android initially exposed an obsolete test expectation: `QuickExpenseShortcutContractTest` still expected `Registrar gasto` as the title after commit `47f505f` changed the product title to `Gasto rápido`. Updated only that assertion; the short label remains `Registrar gasto`. The new CI workflow runs these three Gradle checks on Android pull requests and pushes to main, and supports manual dispatch. Remote CI has not been dispatched.
- Existing OpenSpec edits were preserved. No deployment, release, live ledger mutation, commit or push was performed.

## Follow-up: Android version warnings (2026-09-29)

All seven original Android lint warnings are resolved by updating the SDK and dependencies:

| Component | Before | After |
| --- | --- | --- |
| compileSdk / targetSdk | 36 / 36 | 37 / 37 |
| Android Gradle plugin | 9.3.0 | 9.4.1 |
| Firebase BoM | 34.18.0 | 34.19.0 |
| Activity | 1.12.4 | 1.13.0 |
| Core | 1.16.0 | 1.19.1 |
| Google ID | 1.1.1 | 1.2.1 |

- Gradle is now 9.8.0. Kotlin is explicitly 2.4.20 because Google ID 1.2.1 requires Kotlin 2.4 metadata support. The configuration follows the official [AGP compatibility guidance](https://developer.android.com/build/releases/agp-9-4-0-release-notes), [built-in Kotlin override](https://developer.android.com/build/releases/agp-9-0-0-release-notes), and [Gradle release notes](https://docs.gradle.org/9.8.0/release-notes.html).
- CI explicitly installs `platforms;android-37.0`; local build requirements were updated. Generated Kotlin session files are ignored alongside the existing Gradle cache.
- Final verification with Gradle 9.8.0: `testDebugUnitTest lintDebug assembleDebug` succeeded; all 56 tasks executed. There are 207 passing tests, no failures/errors/skips, and zero lint diagnostics in the fresh text/SARIF reports. The debug APK was rebuilt. Workflow YAML parsing and `git diff --check` passed.
- Separate toolchain notices remain: the Android plugin calls Gradle's deprecated `Configuration.setVisible(boolean)` API (the problems report attributes it to `com.android.internal.application`; removal is scheduled for Gradle 11). Packaging also retains the third-party `libdatastore_shared_counter.so` without stripping its symbols. These are not lint findings or application-source errors; no warnings were suppressed to obtain the clean lint result.
- The target-37 behavior changes were reviewed against the app's notification listener, tile launch, manifest and network usage. Runtime validation on an Android 17 device remains pending before publication. No device install, release or remote CI run was performed.
