import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(resolve(process.cwd(), 'src/AuthenticatedApp.tsx'), 'utf8');
const headerSource = readFileSync(resolve(process.cwd(), 'src/components/layout/Header.tsx'), 'utf8');

describe('authenticated assistant launcher contracts', () => {
  it('keeps routing decisions in AuthenticatedApp', () => {
    expect(appSource).toContain("import { AssistantLauncher } from './components/chat/AssistantLauncher'");
    expect(appSource).toContain("if (!user) setIsAuthModalOpen(true)");
    expect(appSource).toContain("else if (!aiReady) setShowAISettingsModal(true)");
    expect(appSource).toContain('else handleOpenAssistant(trigger)');
  });

  it('renders one persistent launcher with current label and authorization state', () => {
    expect(appSource).toMatch(/<AssistantLauncher[\s\S]*?label=\{assistantLabel\}[\s\S]*?isOpen=\{isAssistantOpen\}[\s\S]*?isPending=\{aiAuthPending\}[\s\S]*?onActivate=\{activateAssistant\}/);
    expect(appSource).toContain('const assistantTriggerRef = useRef<HTMLButtonElement | null>(null)');
  });

  it('passes the same launcher node to the existing chat focus-return contract', () => {
    expect(appSource).toMatch(/const handleOpenAssistant = useCallback\(\(returnFocusTo: HTMLButtonElement\)/);
    expect(appSource).toMatch(/<AIChatBot[\s\S]*?returnFocusRef=\{assistantTriggerRef\}/);
  });

  it('does not leave legacy assistant or privacy ownership in Header', () => {
    expect(headerSource).not.toContain('data-header-action="assistant"');
    expect(headerSource).not.toContain('pendingSettingsCount');
    expect(headerSource).not.toContain('onOpenAssistant');
    expect(headerSource).not.toContain('useUIPreferences');
  });
});
