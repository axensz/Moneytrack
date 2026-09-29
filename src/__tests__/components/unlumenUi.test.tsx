import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ShimmerSkeleton } from '@/components/unlumen-ui/shimmer-skeleton';

describe('componentes Unlumen adaptados', () => {
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
