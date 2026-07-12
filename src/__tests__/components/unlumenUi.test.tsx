import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnimateDigits } from '@/components/unlumen-ui/animate-digits';
import { ShimmerSkeleton } from '@/components/unlumen-ui/shimmer-skeleton';

describe('componentes Unlumen adaptados', () => {
  it('expone el importe animado como un único valor accesible', () => {
    const { rerender } = render(<AnimateDigits value="$ 1.234" />);

    expect(screen.getByLabelText('$ 1.234')).toHaveTextContent('$ 1.234');

    rerender(<AnimateDigits value="$ 5.678" />);
    expect(screen.getByLabelText('$ 5.678')).toHaveAttribute('aria-label', '$ 5.678');
  });

  it('conserva dimensiones y redondeado personalizados en el skeleton', () => {
    const { container } = render(
      <ShimmerSkeleton className="h-10 w-24" rounded="full" aria-hidden="true" />,
    );

    const skeleton = container.firstElementChild;
    expect(skeleton).toHaveClass('h-10', 'w-24', 'rounded-full', 'bg-muted');
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton?.querySelector('.unlumen-shimmer')).toBeInTheDocument();
  });
});
