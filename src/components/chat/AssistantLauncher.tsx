'use client';

import { Bot } from 'lucide-react';

export interface AssistantLauncherProps {
  label: string;
  isOpen: boolean;
  isPending: boolean;
  onActivate: (trigger: HTMLButtonElement) => void;
}

export function AssistantLauncher({
  label,
  isOpen,
  isPending,
  onActivate,
}: AssistantLauncherProps) {
  return (
    <button
      type="button"
      data-assistant-launcher
      onClick={(event) => onActivate(event.currentTarget)}
      className={`fixed right-[calc(0.75rem+env(safe-area-inset-right))] bottom-[calc(var(--shell-nav-h,72px)+env(safe-area-inset-bottom)+0.75rem)] sm:right-6 sm:bottom-6 z-[50] inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-solid text-primary-foreground shadow-lg transition-opacity duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${isOpen ? 'invisible pointer-events-none opacity-0' : 'visible opacity-100'}`}
      aria-label={label}
      title={label}
      aria-hidden={isOpen || undefined}
      tabIndex={isOpen ? -1 : 0}
    >
      <Bot size={22} aria-hidden="true" />
      {isPending && !isOpen && (
        <span
          role="status"
          aria-label="Autorización de IA pendiente"
          className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold leading-none text-destructive-foreground ring-2 ring-background"
        >
          !
        </span>
      )}
    </button>
  );
}
