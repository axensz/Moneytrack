# Refresh Dependency Security Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the current high-severity `nanoid` and `undici` advisories through the smallest compatible lockfile refresh.

**Architecture:** Keep the existing direct dependency ranges and overrides. Let npm select patched transitive versions already admitted by those ranges; reject any dry run that adds a dependency, changes a direct range, or requires a semver-major upgrade.

**Tech Stack:** npm, `package.json`, `package-lock.json`, Next.js 16, Vitest 4.

**Spec:** `openspec/changes/repair-debt-lifecycle-and-account-links/tasks.md` task 6.5 and `openspec/changes/harden-notification-delivery-and-recurring-reminders/tasks.md` task 7.2.

## Global Constraints

- Full `npm audit` must report zero vulnerabilities before the baseline is called clean.
- Add no direct dependency and no new override.
- Preserve all unrelated source and OpenSpec changes.
- Do not use `npm audit fix --force`.

---

### Task 1: Prove the current advisory failure

**Files:**
- Verify: `package.json`
- Verify: `package-lock.json`

**Interfaces:**
- Consumes: npm registry advisories and the current lockfile.
- Produces: exact vulnerable packages, ranges, dependency paths, and a safe-fix decision.

- [x] **Step 1: Run full and production-only audit (RED)**

Run: `npm.cmd audit --json`

Run: `npm.cmd audit --omit=dev --json`

Observed: full audit reports `nanoid <3.3.18` and `undici 7.0.0-7.28.0`; production-only reports `nanoid`.

- [x] **Step 2: Inspect dependency paths and npm's dry-run proposal**

Run: `npm.cmd ls nanoid undici --all`

Run: `npm.cmd audit fix --dry-run --json`

Expected: only compatible transitive package updates; no direct dependency or major-version change.

Observed: npm proposes only `nanoid 3.3.16 -> 3.3.18` and `undici 7.28.0 -> 7.29.0`; zero additions/removals and the dry run left `package-lock.json` unchanged.

### Task 2: Apply the compatible lockfile refresh

**Files:**
- Modify: `package-lock.json`
- Verify unchanged: `package.json`

**Interfaces:**
- Consumes: the safe npm dry-run proposal.
- Produces: patched installed and locked versions of `nanoid` and `undici`.

- [x] **Step 1: Run npm's non-forced compatible fix**

Run: `npm.cmd audit fix`

- [x] **Step 2: Verify direct dependency intent did not change**

Run: `git diff --exit-code -- package.json`

Expected: exit 0.

Run: `npm.cmd ls nanoid undici --all`

Expected: no version remains inside either vulnerable range.

### Task 3: Verify the refreshed baseline

**Files:**
- Verify: `package-lock.json`
- Verify: application source and tests.

**Interfaces:**
- Consumes: refreshed node_modules and lockfile.
- Produces: zero-audit and application regression evidence.

- [x] **Step 1: Run full and production-only audit (GREEN)**

Run: `npm.cmd audit --json`

Run: `npm.cmd audit --omit=dev --json`

Expected: zero vulnerabilities and exit 0 for both.

- [x] **Step 2: Run static and focused regression checks**

Run: `npm.cmd run typecheck`

Run: `npm.cmd run lint`

Run: `npm.cmd run test:run -- src/__tests__/components/metricScopeFilterIndependence.test.tsx src/__tests__/hooks/notificationPreferencesMerge.test.ts src/__tests__/services/BudgetMonitor.test.ts --reporter=dot`

Run: `git diff --check`

- [x] **Step 3: Review the lockfile-only dependency diff**

Run: `git diff -- package.json package-lock.json`

Expected: `package.json` unchanged and `package-lock.json` limited to patched transitive versions/integrities.

## Execution Evidence

- RED: full audit reported 2 high vulnerabilities; production-only reported 1 high vulnerability.
- Dry run: 2 compatible changes, 0 additions, 0 removals, and no lockfile mutation.
- Applied: `nanoid 3.3.16 -> 3.3.18` and `undici 7.28.0 -> 7.29.0`; `package.json` is unchanged.
- GREEN: full and production-only audits each report 0 vulnerabilities with exit 0.
- Regression verification: 3 focused files and 19 tests passed; TypeScript, ESLint, and `git diff --check` exited 0.
