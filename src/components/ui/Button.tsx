'use client';

import React, { forwardRef, memo } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * Variantes de botón disponibles
 */
type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'cancel'
  | 'danger'
  | 'ghost'
  | 'edit';

/**
 * Tamaños de botón disponibles
 */
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Variante visual del botón */
  variant?: ButtonVariant;
  /** Tamaño del botón */
  size?: ButtonSize;
  /** Icono a mostrar antes del texto */
  icon?: LucideIcon;
  /** Icono a mostrar después del texto */
  iconRight?: LucideIcon;
  /** Tamaño del icono (por defecto basado en size) */
  iconSize?: number;
  /** Si el botón está en estado de carga */
  loading?: boolean;
  /** Si el botón ocupa todo el ancho disponible */
  fullWidth?: boolean;
  /** Contenido del botón */
  children?: React.ReactNode;
}

/**
 * Estilos base compartidos por todos los botones
 */
const baseStyles =
  'inline-flex items-center justify-center font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * Estilos por variante
 */
const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 focus:ring-purple-500',
  secondary:
    'bg-purple-600 hover:bg-purple-700 text-white shadow-md hover:shadow-lg focus:ring-purple-500',
  cancel:
    'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 focus:ring-gray-400',
  danger:
    'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
  ghost:
    'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-gray-400',
  edit:
    'bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 focus:ring-blue-400',
};

/**
 * Estilos por tamaño
 */
const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg min-h-[36px] gap-1',
  md: 'px-4 py-2 sm:px-5 sm:py-2.5 text-sm sm:text-base rounded-lg min-h-[40px] sm:min-h-[44px] gap-2',
  lg: 'px-6 py-3 text-base rounded-xl min-h-[48px] gap-2',
};

/**
 * Tamaños de icono por defecto según el tamaño del botón
 */
const defaultIconSizes: Record<ButtonSize, number> = {
  sm: 14,
  md: 16,
  lg: 20,
};

/**
 * Componente Button reutilizable con variantes, tamaños y accesibilidad
 *
 * @example
 * // Botón primario con icono
 * <Button variant="primary" icon={Plus}>Agregar</Button>
 *
 * @example
 * // Botón de cancelar
 * <Button variant="cancel" onClick={onCancel}>Cancelar</Button>
 *
 * @example
 * // Botón de carga
 * <Button variant="primary" loading>Guardando...</Button>
 */
export const Button = memo(
  forwardRef<HTMLButtonElement, ButtonProps>(
    (
      {
        variant = 'primary',
        size = 'md',
        icon: Icon,
        iconRight: IconRight,
        iconSize,
        loading = false,
        fullWidth = false,
        disabled,
        className = '',
        children,
        type = 'button',
        ...props
      },
      ref
    ) => {
      const resolvedIconSize = iconSize ?? defaultIconSizes[size];
      const isDisabled = disabled || loading;

      return (
        <button
          ref={ref}
          type={type}
          disabled={isDisabled}
          className={`
            ${baseStyles}
            ${variantStyles[variant]}
            ${sizeStyles[size]}
            ${fullWidth ? 'w-full' : ''}
            ${className}
          `.trim()}
          aria-busy={loading}
          aria-disabled={isDisabled}
          {...props}
        >
          {loading ? (
            <LoadingSpinner size={resolvedIconSize} />
          ) : (
            Icon && <Icon size={resolvedIconSize} aria-hidden="true" />
          )}
          {children}
          {IconRight && !loading && (
            <IconRight size={resolvedIconSize} aria-hidden="true" />
          )}
        </button>
      );
    }
  )
);

Button.displayName = 'Button';

/**
 * Spinner de carga animado
 */
const LoadingSpinner: React.FC<{ size: number }> = memo(({ size }) => (
  <svg
    className="animate-spin"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
));

LoadingSpinner.displayName = 'LoadingSpinner';

/**
 * Componente IconButton para botones de solo icono
 */
interface IconButtonProps
  extends Omit<ButtonProps, 'children' | 'icon' | 'iconRight'> {
  icon: LucideIcon;
  'aria-label': string;
}

export const IconButton = memo(
  forwardRef<HTMLButtonElement, IconButtonProps>(
    ({ icon: Icon, size = 'md', iconSize, className = '', ...props }, ref) => {
      const resolvedIconSize = iconSize ?? defaultIconSizes[size];

      const iconButtonSizes: Record<ButtonSize, string> = {
        sm: 'p-1.5 min-h-[32px] min-w-[32px]',
        md: 'p-2 min-h-[40px] min-w-[40px]',
        lg: 'p-3 min-h-[48px] min-w-[48px]',
      };

      return (
        <Button
          ref={ref}
          size={size}
          className={`${iconButtonSizes[size]} ${className}`}
          {...props}
        >
          <Icon size={resolvedIconSize} aria-hidden="true" />
        </Button>
      );
    }
  )
);

IconButton.displayName = 'IconButton';
