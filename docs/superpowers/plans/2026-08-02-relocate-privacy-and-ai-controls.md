# Relocate Privacy and AI Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the global balance-privacy action into `Saldo actual` and replace every shell assistant entry with one safe floating launcher.

**Architecture:** `StatsCards` remains the visual owner of the ledger summary and mutates the existing persisted `UIPreferencesContext`. A new presentational `AssistantLauncher` receives its label/state/action from `AuthenticatedApp`, which continues to own authentication, Gemini setup, panel state, and the stable focus-return ref; `Header` becomes a smaller utility shell.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4 utilities, Vitest, Testing Library, Next.js 16 static export.

## Global Constraints

- Preserve all financial calculations, persistence, mutations, mobile destinations, AI conversation/configuration state, and `AIChatBot` internals.
- Use only existing semantic tokens; violet is brand/action, status remains semantic, and no new gradient, glow, pulse, bounce, or dependency is allowed.
- Privacy is a 44×44 CSS pixel action in `Saldo actual`; assistant is one 48×48 CSS pixel floating action.
- The assistant launcher stays mounted but becomes invisible, non-interactive, `aria-hidden`, and `tabIndex={-1}` while the panel is open.
- Mobile placement includes `--shell-nav-h` and `env(safe-area-inset-bottom)`; desktop uses the existing lower-right spacing.
- Preserve the named non-modal `Asistente MoneyTrack` dialog and restore focus after visible close or Escape.

---

### Task 1: Ledger privacy action

**Files:**
- Modify: `src/components/shared/StatsCards.tsx`
- Modify: `src/__tests__/components/StatsCards.test.tsx`
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/__tests__/components/Header.test.tsx`

**Interfaces:**
- Consumes: `useUIPreferences(): { hideBalances: boolean; setHideBalances(value: boolean): void }`
- Produces: one button named `Ocultar valores` or `Mostrar valores` inside `Saldo actual`

- [ ] **Step 1: Write the failing StatsCards privacy tests**

```tsx
const toggle = screen.getByRole('button', { name: 'Ocultar valores' });
expect(toggle).toHaveAttribute('aria-pressed', 'false');
expect(toggle).toHaveClass('h-11', 'w-11');
fireEvent.click(toggle);
expect(screen.getByRole('button', { name: 'Mostrar valores' }))
  .toHaveAttribute('aria-pressed', 'true');
expect(screen.getAllByText('••••••').length).toBeGreaterThan(1);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run test:run -- src/__tests__/components/StatsCards.test.tsx src/__tests__/components/Header.test.tsx`

Expected: FAIL because `StatsCards` has no privacy button and `Header` still owns it.

- [ ] **Step 3: Implement the minimal privacy move**

```tsx
const { hideBalances, setHideBalances } = useUIPreferences();
const privacyLabel = hideBalances ? 'Mostrar valores' : 'Ocultar valores';

<button
  type="button"
  onClick={() => setHideBalances(!hideBalances)}
  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-balance-accent text-balance-value focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
  aria-label={privacyLabel}
  title={privacyLabel}
  aria-pressed={hideBalances}
>
  {hideBalances ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
</button>
```

Remove `Eye`, `EyeOff`, `useUIPreferences`, and the old privacy button from `Header`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npm run test:run -- src/__tests__/components/StatsCards.test.tsx src/__tests__/components/Header.test.tsx`

Expected: both files pass; Header exposes no privacy action.

- [ ] **Step 5: Commit the privacy unit**

```powershell
git add src/components/shared/StatsCards.tsx src/components/layout/Header.tsx src/__tests__/components/StatsCards.test.tsx src/__tests__/components/Header.test.tsx
git commit -m "feat: move balance privacy into ledger overview"
```

### Task 2: Presentational assistant launcher

**Files:**
- Create: `src/components/chat/AssistantLauncher.tsx`
- Create: `src/__tests__/components/AssistantLauncher.test.tsx`

**Interfaces:**
- Produces: `AssistantLauncher({ label, isOpen, isPending, onActivate })`
- Callback: `onActivate(trigger: HTMLButtonElement): void`

- [ ] **Step 1: Write the failing launcher tests**

```tsx
render(
  <AssistantLauncher
    label="Abrir asistente IA"
    isOpen={false}
    isPending
    onActivate={onActivate}
  />,
);
const launcher = screen.getByRole('button', { name: 'Abrir asistente IA' });
expect(launcher).toHaveClass('h-12', 'w-12', 'z-[50]');
expect(screen.getByRole('status', { name: 'Autorización de IA pendiente' })).toBeVisible();
fireEvent.click(launcher);
expect(onActivate).toHaveBeenCalledWith(launcher);
```

Add a second render with `isOpen` and assert `aria-hidden="true"`, `tabindex="-1"`, `invisible`, and `pointer-events-none` while the same DOM node remains mounted.

- [ ] **Step 2: Run the launcher test and verify RED**

Run: `npm run test:run -- src/__tests__/components/AssistantLauncher.test.tsx`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the launcher**

```tsx
export interface AssistantLauncherProps {
  label: string;
  isOpen: boolean;
  isPending: boolean;
  onActivate: (trigger: HTMLButtonElement) => void;
}

export function AssistantLauncher({ label, isOpen, isPending, onActivate }: AssistantLauncherProps) {
  return (
    <button
      type="button"
      data-assistant-launcher
      onClick={(event) => onActivate(event.currentTarget)}
      className={`fixed right-[calc(0.75rem+env(safe-area-inset-right))] bottom-[calc(var(--shell-nav-h,72px)+env(safe-area-inset-bottom)+0.75rem)] sm:right-6 sm:bottom-6 z-[50] inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary-solid text-primary-foreground shadow-lg transition-opacity motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isOpen ? 'invisible pointer-events-none opacity-0' : 'opacity-100'}`}
      aria-label={label}
      aria-hidden={isOpen || undefined}
      tabIndex={isOpen ? -1 : 0}
    >
      <Bot size={22} aria-hidden="true" />
      {isPending && !isOpen && <span role="status" aria-label="Autorización de IA pendiente">!</span>}
    </button>
  );
}
```

- [ ] **Step 4: Run the launcher test and verify GREEN**

Run: `npm run test:run -- src/__tests__/components/AssistantLauncher.test.tsx`

Expected: all launcher states pass.

- [ ] **Step 5: Commit the launcher unit**

```powershell
git add src/components/chat/AssistantLauncher.tsx src/__tests__/components/AssistantLauncher.test.tsx
git commit -m "feat: add floating assistant launcher"
```

### Task 3: Shell routing and focus wiring

**Files:**
- Modify: `src/AuthenticatedApp.tsx`
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/__tests__/components/Header.test.tsx`
- Create: `src/__tests__/components/authenticatedAssistantLauncher.test.tsx`
- Verify: `src/__tests__/components/AIChatBot.test.tsx`

**Interfaces:**
- Consumes: `AssistantLauncherProps`
- Preserves: `AIChatBot({ isOpen, onClose, returnFocusRef })`

- [ ] **Step 1: Write failing shell contracts**

```tsx
expect(authenticatedAppSource).toContain('<AssistantLauncher');
expect(authenticatedAppSource).toContain("if (!user) setIsAuthModalOpen(true)");
expect(authenticatedAppSource).toContain("else if (!aiReady) setShowAISettingsModal(true)");
expect(authenticatedAppSource).toContain('else handleOpenAssistant(trigger)');
expect(headerSource).not.toContain('data-header-action="assistant"');
expect(headerSource).not.toContain('pendingSettingsCount');
```

- [ ] **Step 2: Run shell tests and verify RED**

Run: `npm run test:run -- src/__tests__/components/authenticatedAssistantLauncher.test.tsx src/__tests__/components/Header.test.tsx src/__tests__/components/AIChatBot.test.tsx`

Expected: FAIL because the old Header entries still exist and AuthenticatedApp has no launcher.

- [ ] **Step 3: Wire AuthenticatedApp and simplify Header**

```tsx
const assistantLabel = !user
  ? 'Inicia sesión para usar el asistente IA'
  : aiReady
    ? 'Abrir asistente IA'
    : 'Activar asistente IA';

const activateAssistant = useCallback((trigger: HTMLButtonElement) => {
  if (!user) setIsAuthModalOpen(true);
  else if (!aiReady) setShowAISettingsModal(true);
  else handleOpenAssistant(trigger);
}, [aiReady, handleOpenAssistant, user]);

<AssistantLauncher
  label={assistantLabel}
  isOpen={isAssistantOpen}
  isPending={aiAuthPending}
  onActivate={activateAssistant}
/>
```

Remove `onOpenAISettings`, `aiReady`, `onOpenAssistant`, `pendingSettingsCount`, and `aiAuthPending` from `HeaderProps`, its invocation, its desktop button, and its settings item. Keep `assistantTriggerRef` as the exact ref passed to `AIChatBot`.

- [ ] **Step 4: Run shell and focus tests and verify GREEN**

Run: `npm run test:run -- src/__tests__/components/authenticatedAssistantLauncher.test.tsx src/__tests__/components/Header.test.tsx src/__tests__/components/AssistantLauncher.test.tsx src/__tests__/components/AIChatBot.test.tsx`

Expected: all routing/source/focus contracts pass.

- [ ] **Step 5: Commit the shell unit**

```powershell
git add src/AuthenticatedApp.tsx src/components/layout/Header.tsx src/__tests__/components/Header.test.tsx src/__tests__/components/authenticatedAssistantLauncher.test.tsx
git commit -m "refactor: route assistant through floating launcher"
```

### Task 4: Integrated verification and delivery

**Files:**
- Modify: `openspec/changes/relocate-privacy-and-ai-controls/tasks.md`
- Review: all files changed by Tasks 1–3

**Interfaces:**
- Consumes: final UI and tests from Tasks 1–3
- Produces: validated OPSX evidence and an updated draft PR #76

- [ ] **Step 1: Run focused suites**

Run: `npm run test:run -- src/__tests__/components/StatsCards.test.tsx src/__tests__/components/Header.test.tsx src/__tests__/components/AssistantLauncher.test.tsx src/__tests__/components/authenticatedAssistantLauncher.test.tsx src/__tests__/components/AIChatBot.test.tsx src/__tests__/components/desktopShellNavigation.test.tsx src/__tests__/components/desktopContrastContracts.test.tsx`

Expected: all focused files pass.

- [ ] **Step 2: Run broad validation**

```powershell
npm run test:run
npm run typecheck
npm run lint
npm run build
git diff --check
openspec.cmd validate relocate-privacy-and-ai-controls --strict
```

Expected: zero failing tests, errors, vulnerabilities, diff errors, or OPSX violations.

- [ ] **Step 3: Verify Chrome geometry and behavior**

At 390×844, 1214×768, and 1440×900 assert `document.documentElement.scrollWidth === clientWidth`, privacy 44×44, launcher 48×48, mobile launcher above nav, panel hides launcher, close/Escape restores focus, and console has no errors. Toggle privacy only; do not mutate financial data.

- [ ] **Step 4: Rebuild graph and review scope**

Run: `uvx code-review-graph build --repo "C:\Users\camilo.guzman_pragma\Desktop\Moneytrack"` and `uvx code-review-graph detect-changes --base HEAD --brief --repo "C:\Users\camilo.guzman_pragma\Desktop\Moneytrack"`.

Expected: changes remain inside approved shell/privacy/assistant surfaces.

- [ ] **Step 5: Commit, push, and update PR #76**

```powershell
git add openspec/changes/relocate-privacy-and-ai-controls docs/superpowers/plans/2026-08-02-relocate-privacy-and-ai-controls.md
git commit -m "docs: plan privacy and assistant relocation"
git push origin codex/desktop-ux-opsx
gh pr checks 76 --watch --interval 10
```

Expected: PR remains draft and all required checks become green.
