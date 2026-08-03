import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantLauncher } from '../../components/chat/AssistantLauncher';

describe('AssistantLauncher', () => {
  it.each([
    'Inicia sesión para usar el asistente IA',
    'Activar asistente IA',
    'Abrir asistente IA',
  ])('exposes the supplied action name: %s', (label) => {
    render(
      <AssistantLauncher
        label={label}
        isOpen={false}
        isPending={false}
        onActivate={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: label })).toBeVisible();
  });

  it('uses safe responsive geometry and activates with the stable button node', () => {
    const onActivate = vi.fn();
    render(
      <AssistantLauncher
        label="Abrir asistente IA"
        isOpen={false}
        isPending={false}
        onActivate={onActivate}
      />,
    );
    const launcher = screen.getByRole('button', { name: 'Abrir asistente IA' });

    expect(launcher).toHaveClass(
      'fixed',
      'h-12',
      'w-12',
      'z-[50]',
      'bottom-[calc(var(--shell-nav-h,72px)+env(safe-area-inset-bottom)+0.75rem)]',
      'sm:right-6',
      'sm:bottom-6',
      'motion-reduce:transition-none',
    );
    expect(launcher.className).not.toMatch(/gradient|animate-pulse|animate-bounce|glow/);

    fireEvent.click(launcher);
    expect(onActivate).toHaveBeenCalledWith(launcher);
  });

  it('communicates pending authorization with text and not color alone', () => {
    render(
      <AssistantLauncher
        label="Activar asistente IA"
        isOpen={false}
        isPending
        onActivate={vi.fn()}
      />,
    );

    expect(screen.getByRole('status', { name: 'Autorización de IA pendiente' }))
      .toHaveTextContent('!');
  });

  it('stays mounted but becomes inert while the assistant is open', () => {
    const { rerender } = render(
      <AssistantLauncher
        label="Abrir asistente IA"
        isOpen={false}
        isPending={false}
        onActivate={vi.fn()}
      />,
    );
    const launcher = screen.getByRole('button', { name: 'Abrir asistente IA' });

    rerender(
      <AssistantLauncher
        label="Abrir asistente IA"
        isOpen
        isPending={false}
        onActivate={vi.fn()}
      />,
    );

    expect(document.querySelector('[data-assistant-launcher]')).toBe(launcher);
    expect(launcher).toHaveAttribute('aria-hidden', 'true');
    expect(launcher).toHaveAttribute('tabindex', '-1');
    expect(launcher).toHaveClass('invisible', 'pointer-events-none', 'opacity-0');
  });
});
