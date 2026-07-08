import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoadingScreen } from '../../components/layout/LoadingScreen';

function getSplash() {
  const splash = screen.getByText('MoneyTrack').closest('.fixed');
  if (!splash) throw new Error('Loading splash not found');
  return splash;
}

describe('LoadingScreen', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays visible until the parent marks it as exiting', () => {
    vi.useFakeTimers();
    render(<LoadingScreen />);

    vi.advanceTimersByTime(1000);

    expect(getSplash()).toHaveClass('opacity-100');
    expect(getSplash()).not.toHaveClass('opacity-0');
  });

  it('fades out without blocking clicks when exiting', () => {
    render(<LoadingScreen exiting />);

    const splash = getSplash();
    expect(splash).toHaveClass('opacity-0');
    expect(splash).toHaveClass('pointer-events-none');
    expect(splash).toHaveAttribute('aria-busy', 'false');
  });
});
