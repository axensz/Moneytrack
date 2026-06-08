import React from 'react';

type MaxWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';

interface ResponsiveContainerProps {
    children: React.ReactNode;
    className?: string;
    maxWidth?: MaxWidth;
    padding?: boolean;
}

// Mapa de clases COMPLETAS y literales para que Tailwind no las purgue.
const MAX_WIDTH_CLASSES: Record<MaxWidth, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    full: 'w-full',
};

/**
 * Responsive container component that ensures content fits within viewport
 * and applies appropriate padding at different breakpoints
 */
export function ResponsiveContainer({
    children,
    className = '',
    maxWidth = 'xl',
    padding = true
}: ResponsiveContainerProps) {
    // Map maxWidth to Tailwind classes (clases literales completas)
    const maxWidthClass = MAX_WIDTH_CLASSES[maxWidth] ?? MAX_WIDTH_CLASSES.xl;

    // Responsive padding: smaller on mobile, larger on desktop
    const paddingClass = padding ? 'px-4 sm:px-6 lg:px-8' : '';

    return (
        <div
            className={`${maxWidthClass} ${paddingClass} mx-auto w-full ${className}`}
        >
            {children}
        </div>
    );
}
