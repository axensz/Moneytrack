'use client';

import { useState, useEffect } from 'react';

/**
 * Breakpoint definitions matching Tailwind CSS
 */
export const BREAKPOINTS = {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/**
 * Hook to get the current breakpoint based on window width
 * @returns Current breakpoint (sm, md, lg, xl, 2xl)
 */
export function useBreakpoint(): Breakpoint {
    const [breakpoint, setBreakpoint] = useState<Breakpoint>('sm');

    useEffect(() => {
        const updateBreakpoint = () => {
            const width = window.innerWidth;

            if (width >= BREAKPOINTS['2xl']) {
                setBreakpoint('2xl');
            } else if (width >= BREAKPOINTS.xl) {
                setBreakpoint('xl');
            } else if (width >= BREAKPOINTS.lg) {
                setBreakpoint('lg');
            } else if (width >= BREAKPOINTS.md) {
                setBreakpoint('md');
            } else {
                setBreakpoint('sm');
            }
        };

        // Set initial breakpoint
        updateBreakpoint();

        // Update on resize
        window.addEventListener('resize', updateBreakpoint);

        return () => window.removeEventListener('resize', updateBreakpoint);
    }, []);

    return breakpoint;
}

/**
 * Hook to get responsive values based on current breakpoint
 * @param values Object with breakpoint keys and corresponding values
 * @returns Value for current breakpoint (falls back to smaller breakpoints if not defined)
 */
export function useResponsiveValue<T>(
    values: Partial<Record<Breakpoint, T>>
): T | undefined {
    const breakpoint = useBreakpoint();

    // Try current breakpoint first, then fall back to smaller ones
    const breakpointOrder: Breakpoint[] = ['2xl', 'xl', 'lg', 'md', 'sm'];
    const currentIndex = breakpointOrder.indexOf(breakpoint);

    for (let i = currentIndex; i < breakpointOrder.length; i++) {
        const bp = breakpointOrder[i];
        if (values[bp] !== undefined) {
            return values[bp];
        }
    }

    return undefined;
}

/**
 * Hook to check if current viewport is mobile (< 640px)
 */
export function useIsMobile(): boolean {
    const breakpoint = useBreakpoint();
    return breakpoint === 'sm';
}

/**
 * Hook to check if current viewport is tablet (640px - 1024px)
 */
export function useIsTablet(): boolean {
    const breakpoint = useBreakpoint();
    return breakpoint === 'md' || breakpoint === 'lg';
}

/**
 * Hook to check if current viewport is desktop (> 1024px)
 */
export function useIsDesktop(): boolean {
    const breakpoint = useBreakpoint();
    return breakpoint === 'xl' || breakpoint === '2xl';
}

/**
 * Hook to get viewport dimensions
 */
export function useViewportSize() {
    const [size, setSize] = useState({
        width: typeof window !== 'undefined' ? window.innerWidth : 0,
        height: typeof window !== 'undefined' ? window.innerHeight : 0
    });

    useEffect(() => {
        const updateSize = () => {
            setSize({
                width: window.innerWidth,
                height: window.innerHeight
            });
        };

        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    return size;
}

/**
 * Hook to detect screen orientation
 */
export function useOrientation(): 'portrait' | 'landscape' {
    const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(
        typeof window !== 'undefined' && window.innerWidth > window.innerHeight
            ? 'landscape'
            : 'portrait'
    );

    useEffect(() => {
        const updateOrientation = () => {
            setOrientation(
                window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
            );
        };

        window.addEventListener('resize', updateOrientation);
        return () => window.removeEventListener('resize', updateOrientation);
    }, []);

    return orientation;
}

/**
 * Utility to get responsive class names based on breakpoint
 */
export function getResponsiveClasses(
    classes: Partial<Record<Breakpoint, string>>,
    currentBreakpoint: Breakpoint
): string {
    const breakpointOrder: Breakpoint[] = ['sm', 'md', 'lg', 'xl', '2xl'];
    const currentIndex = breakpointOrder.indexOf(currentBreakpoint);

    let result = '';

    for (let i = 0; i <= currentIndex; i++) {
        const bp = breakpointOrder[i];
        if (classes[bp]) {
            result = classes[bp]!;
        }
    }

    return result;
}
