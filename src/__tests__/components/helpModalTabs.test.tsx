import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpModal } from '../../components/modals/HelpModal';

let animationFrames: FrameRequestCallback[];
let scrollIntoView: ReturnType<typeof vi.fn>;

function flushAnimationFrames() {
  act(() => {
    const callbacks = animationFrames.splice(0);
    callbacks.forEach(callback => callback(0));
  });
}

describe('HelpModal tabs', () => {
  beforeEach(() => {
    animationFrames = [];
    scrollIntoView = vi.fn();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['ArrowLeft', 'Inicio', 'Atajos', 'shortcuts'],
    ['ArrowRight', 'Atajos', 'Inicio', 'basics'],
    ['Home', 'Metas', 'Inicio', 'basics'],
    ['End', 'Inicio', 'Atajos', 'shortcuts'],
  ])('uses %s from %s to select %s and its panel', (key, from, to, panelId) => {
    render(<HelpModal isOpen onClose={vi.fn()} />);
    flushAnimationFrames();

    const current = screen.getByRole('tab', { name: from });
    if (from !== 'Inicio') {
      fireEvent.click(current);
      flushAnimationFrames();
    }
    current.focus();
    fireEvent.keyDown(current, { key });

    expect(screen.getByRole('tab', { name: to, selected: true })).toHaveAttribute('tabindex', '0');
    expect(current).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', `help-tab-${panelId}`);
    expect(screen.getAllByRole('tab').filter(tab => tab.getAttribute('tabindex') === '0')).toHaveLength(1);
  });

  it('uses exactly one tabbable Help tab', () => {
    render(<HelpModal isOpen onClose={vi.fn()} />);

    expect(screen.getAllByRole('tab').filter(tab => tab.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Inicio', selected: true })).toHaveAttribute('tabindex', '0');
  });

  it('focuses the selected Help tab after animation frame and keeps it visible', () => {
    render(<HelpModal isOpen onClose={vi.fn()} />);
    flushAnimationFrames();
    const current = screen.getByRole('tab', { name: 'Inicio' });
    const target = screen.getByRole('tab', { name: 'Cuentas' });
    current.focus();

    fireEvent.keyDown(current, { key: 'ArrowRight' });

    expect(current).toHaveFocus();
    flushAnimationFrames();
    expect(target).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'nearest', inline: 'nearest' });
  });
});
