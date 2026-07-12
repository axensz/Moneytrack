import type { HTMLAttributes } from 'react';

interface ShimmerSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
}

const roundedClasses = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
} as const;

/** Skeleton gratuito de Unlumen UI, adaptado a los tokens de Moneytrack. */
export function ShimmerSkeleton({
  className,
  rounded = 'md',
  ...props
}: ShimmerSkeletonProps) {
  return (
    <div
      className={`relative overflow-hidden bg-muted ${roundedClasses[rounded]} ${className ?? ''}`}
      {...props}
    >
      <span
        aria-hidden="true"
        className="unlumen-shimmer pointer-events-none absolute inset-0 -translate-x-full"
      />
    </div>
  );
}

export type { ShimmerSkeletonProps };
