import React from 'react';

interface ResponsiveContainerProps {
    children: React.ReactNode;
    className?: string;
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
    padding?: boolean;
}

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
    // Map maxWidth to Tailwind classes
    const maxWidthClass = maxWidth === 'full' ? 'w-full' : `max-w-${maxWidth}`;

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
