## 1. Lock current failures with TDD contracts

- [ ] 1.1 Extend `src/__tests__/utils/recurringDates.test.ts` and `src/__tests__/services/PaymentMonitor.test.ts` with failing noon-of-due-day, D-3/D-1/D0, deterministic D+1/D+8/D+15 overdue windows, month-end, leap-year, annual-anchor, paid-cycle, deleted-payment with higher reactivation revision, and stale-stage recovery cases using fixed local dates.
- [ ] 1.2 Extend `src/__tests__/hooks/useNotificationMonitoring.test.ts` with a failing cold-start case proving placeholder arrays cannot set the daily guard and the hydrated source transition evaluates exactly once.
- [ ] 1.3 Add focused failing contracts for canonical `eventKey`/`revision` progression, budget warning-to-critical-to-exceeded escalation with lower-revision suppression, two-device logical delivery IDs, ambiguous external acceptance, quiet-hour `notBefore`, bounded retry classification, and local-date daily reminder catch-up.
- [ ] 1.4 Add `NotificationPreferences.test.tsx` with failing real-component cases for `Activo`/`Requiere acción`/`No disponible`, test-delivery outcomes, draft retention, ordered thresholds, stable names/descriptions, keyboard operation, and 44–48 CSS-pixel actions.
- [ ] 1.5 Expand `browserNotifications.test.ts` and add a service-worker contract harness that fails unless `push`, repeated-delivery suppression, lower-after-higher revision rejection, invalid-payload rejection, amount-free copy, base-path deep links, `notificationclick`, and `pushsubscriptionchange` recovery are covered.

## 2. Repair event and foreground lifecycle behavior

- [ ] 2.1 Extend `Notification`, `NotificationMetadata`, and notification preferences in `src/types/finance.ts` with backward-compatible schema version, event key, revision, stage/window, overdue occurrence, lifecycle status, read/dismissed revision state, scheduled/resolved/dismissed timestamps, and IANA time zone; update `withDefaults` migration tests for every legacy shape.
- [ ] 2.2 Extract the smallest pure event-identity/stage helpers needed by `useNotificationStore`, `NotificationManager`, `BudgetMonitor`, and backend fixtures; make recurring, daily, budget, and debt identities deterministic without changing existing financial calculations.
- [ ] 2.3 Refactor budget escalation so one budget/month event advances only to a higher stage, increments revision, transactionally suppresses nonterminal lower-revision deliveries, and cannot be blocked by the earlier daily ID; enforce `warning < critical <= exceeded` and `exceeded >= 100` at the preference boundary.
- [ ] 2.4 Correct `recurringDates.ts` and `PaymentMonitor.ts` to compare normalized calendar days, add the approved overdue cadence, preserve `recurringCycle`, and set the local once-per-day guard only after hydrated evaluation succeeds.
- [ ] 2.5 Restrict `useDailyExpenseReminder` and authenticated `PaymentMonitor` system delivery to the documented guest/foreground fallback after the backend becomes authoritative; retain local inbox behavior and prevent duplicate authenticated sends.
- [ ] 2.6 Update recurring payment completion/link/unlink flows so the current notification lifecycle resolves or is recomputed from persisted transactions; add regression coverage without coupling notification failure to the financial write.
- [ ] 2.7 Wrap individual and bulk `NotificationCenter` read/remove actions with awaited optimistic rollback and actionable `showToast.error`; map versioned removal to current-revision dismissal so a higher revision resurfaces, retain legacy physical delete compatibility, and preserve the dialog/focus behavior already owned by `harden-desktop-shell-and-interactions`.

## 3. Add the isolated Firebase notification backend

- [ ] 3.1 Create `functions/package.json`, lockfile, `tsconfig.json`, lint/typecheck/test scripts, and Node.js 22 engine using current compatible `firebase-functions`, `firebase-admin`, and one server-only Web Push package; require zero backend `npm audit` findings, add no root runtime dependency, and document why this separate manifest preserves the active `dependency-security-baseline` constraint.
- [ ] 3.2 Create focused modules under `functions/src/notifications/` for device registration, event fan-out, schedule evaluation, delivery/retry, and shared backend types; keep `functions/src/index.ts` limited to exported v2 triggers/callables.
- [ ] 3.3 Implement authenticated, rate-limited register/revoke/status/test callables that validate subscription field sizes, store raw endpoint/key material server-only, return sanitized status, and limit test delivery to once per device per minute.
- [ ] 3.4 Implement Firestore triggers that synchronize deterministic daily/recurring/debt schedule documents from preference, recurring, debt, and linked-transaction writes, plus an idempotent admin backfill for existing users.
- [ ] 3.5 Implement one five-minute scheduled worker that claims due schedules/deliveries transactionally, uses bounded pages/concurrency, advances only the highest current stage window, applies quiet-hour `notBefore`, records lost external outcomes as ambiguous, retries with the same logical delivery ID up to five times/24 hours, expires 404/410 endpoints, and defers over-limit delivery.
- [ ] 3.6 Implement backend-authored event create/revision fan-out so one inbox lifecycle yields one logical delivery record per enabled device/revision and a higher revision suppresses nonterminal older records transactionally; ignore legacy/client-forged versions, keep an environment kill switch disabled by default, and include no monetary amount in the push payload.
- [ ] 3.7 Add backend pure-unit and emulator integration tests for overlapping workers, ambiguous post-dispatch crashes, stage/window monotonicity, old-revision suppression, two devices, missed stages, quiet hours across midnight, retry/expiry, rate limits, revocation, backfill reruns, and same-origin payload validation.

## 4. Enforce Firestore and deployment boundaries

- [ ] 4.1 Extend `firebase.json` for the isolated Functions source and required emulators without changing hosting; add the minimal indexes for due `nextAt`/`notBefore` queries and schedule backfill.
- [ ] 4.2 Add strict rules for notification schema transitions and default-deny direct client access to `notificationDevices`, `notificationSchedules`, and `notificationDeliveries`; preserve legacy owner behavior, limit versioned inbox updates to read/dismissal fields matching the current revision, deny versioned create/delete and server-field mutation, and prove owner/non-owner/admin/forged-event/future-revision boundaries in the real Firestore emulator.
- [ ] 4.3 Add `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` to `.env.example`, declare the VAPID private key as a Functions secret, require an explicit compatible Functions region, and document local emulator values without committing credentials or capability endpoints.
- [ ] 4.4 Update `.github/workflows/nextjs.yml` to install, audit, lint, typecheck, and test the backend package plus Firestore/Functions emulator contracts; CI MUST validate but MUST NOT deploy Functions or enable billing from pull requests.
- [ ] 4.5 Document the explicit production gate: confirm Firebase project/Firestore region, Blaze/Cloud Scheduler approval, API enablement, VAPID secret, service account permissions, kill-switch rollback, cost expectation, and deploy Functions/rules/indexes before the static client.

## 5. Register and deliver on the current device

- [ ] 5.1 Add a focused `src/lib/webPush.ts` boundary using native `Notification`, `serviceWorker`, `PushManager`, `PushSubscription`, and `crypto.randomUUID`; distinguish secure-context, unsupported, iOS-not-installed, permission, subscription, registration, expired, and active states without a client messaging dependency.
- [ ] 5.2 Add a current-device hook that calls the authenticated backend, reconciles local and server state, initializes the reminder time zone once, re-registers after a subscription change, and unsubscribes before sign-out/account switch.
- [ ] 5.3 Add validated `push` and `pushsubscriptionchange` handlers to `public/sw.js`; persist a bounded handled-delivery/highest-revision index, reuse a deterministic notification `tag`, ignore duplicate/out-of-order payloads, display only schema-approved amount-free copy, reuse current icons/base path, and preserve the existing focus/open behavior.
- [ ] 5.4 Stop treating `browserNotifications.enabled` as a global current-device switch: retain legacy read compatibility, move device activation to the registered device, and ensure saving preferences on one browser cannot disable another.
- [ ] 5.5 Prevent `NotificationManager` from invoking a second page-level system notification for authenticated backend-delivered revisions while preserving warning/error toasts and the guest foreground fallback.

## 6. Harden preferences and diagnostic UX

- [ ] 6.1 Refactor the first `NotificationPreferences` section around the named current-device status and one state-appropriate primary action; use existing cards, semantic status pairs, inputs, buttons, and no new gradient or nested-card pattern.
- [ ] 6.2 Add `Enviar notificación de prueba` with pending/double-submit protection, the quiet-hours bypass disclosure, `Aceptada por el servicio push` wording, and specific permission/service-worker/auth/subscription/backend/push-service failures.
- [ ] 6.3 Add visible reminder time-zone context and an explicit update-to-current-device action; preserve the stored zone across other devices until that action is confirmed.
- [ ] 6.4 Associate every switch/input/select with a stable label and description/error, add inline Spanish threshold validation and first-invalid-field focus, and verify 200% zoom, light/dark, keyboard, screen-reader names, and 320-pixel wrapping.
- [ ] 6.5 Replace the overclaiming PC/cell copy with capability-accurate states, including iOS Home Screen installation guidance and a guest explanation that MoneyTrack must remain open.

## 7. Integrated validation and controlled rollout

- [ ] 7.1 Run all focused notification, recurring, service-worker, preference, backend, rules, schedule, and delivery suites; record exact counts and repair every failure before broad validation.
- [ ] 7.2 Run root and backend `npm audit`, tests, typecheck, lint, production static build, `git diff --check`, and `openspec.cmd validate harden-notification-delivery-and-recurring-reminders --strict`; require zero vulnerabilities and successful exits.
- [ ] 7.3 Rebuild the code-review graph, run `detect_changes` and affected-flow review, and confirm no unintended change to financial calculations, debt/account atomicity, shell/header order, AI, metric scopes, static export, root dependency-security baseline, or user-owned untracked files.
- [ ] 7.4 Verify preferences visually at 320×568, 390×844, 1214×768, and 1440×900 in light/dark with no overflow, correct focus, named controls, clear device status, retryable failures, and no console errors.
- [ ] 7.5 With explicit deployment approval and disposable test data, verify one event in the foreground, background, and fully closed installed PWA; quiet-hour deferral; retry; expiration; sign-out revocation; one inbox event with two independent devices; and amount-free lock-screen copy.
- [ ] 7.6 Verify a physical Android installed PWA and an iPhone/iPad Home Screen PWA after closing them completely. If either required device is unavailable, record the evidence gap and leave this task unchecked rather than claiming robust mobile delivery.
- [ ] 7.7 Enable the server-side delivery flag first for test accounts, run the idempotent schedule backfill twice, monitor sanitized failures/cost for a bounded canary, and expand only after no duplicate, stale, privacy, or missed-delivery regression is observed.
