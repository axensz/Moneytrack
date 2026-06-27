'use client';

import React, { useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

type Option = { value: string; label: string };

interface FilterDropdownProps {
  label: string;
  value: string;
  options: Option[];
  /**
   * Si se provee, las opciones se renderizan agrupadas con cabecera por sección
   * (p. ej. Gastos / Ingresos / Otros). `options` sigue usándose para resolver
   * la etiqueta seleccionada en el botón. Cuando no se pasa, la lista es plana.
   */
  optionGroups?: { label: string; options: Option[] }[];
  onChange: (value: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  icon?: React.ReactNode;
  align?: 'left' | 'right';
}

export const FilterDropdown: React.FC<FilterDropdownProps> = ({
  label,
  value,
  options,
  optionGroups,
  onChange,
  isOpen,
  onToggle,
  onClose,
  icon,
  align = 'right',
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const selectedLabel = options.find((opt) => opt.value === value)?.label || label;

  // Is active if value is not 'all'
  const isActive = value !== 'all';

  const renderOption = (option: Option) => (
    <button
      key={option.value}
      role="option"
      aria-selected={value === option.value}
      onClick={() => {
        onChange(option.value);
        onClose();
      }}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors truncate ${value === option.value
        ? 'bg-[var(--balance-accent)] text-[var(--balance-accent-foreground)]'
        : 'hover:bg-[var(--muted)] text-foreground'
        }`}
      title={option.label}
    >
      {option.label}
    </button>
  );

  return (
    <div
      className="relative"
      ref={dropdownRef}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && isOpen) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <button
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors flex-shrink-0 ${isActive
          ? 'bg-[var(--balance-accent)] text-[var(--balance-accent-foreground)]'
          : 'bg-card text-foreground border border-[var(--border)]'
          }`}
        title={isActive ? selectedLabel : undefined}
      >
        {icon}
        <span className="truncate max-w-[60px] sm:max-w-[90px]">
          {isActive ? selectedLabel : label}
        </span>
        <ChevronDown size={14} className="flex-shrink-0" />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={label}
          className={`absolute top-full mt-1 z-[100] bg-card rounded-xl shadow-xl border border-[var(--border)] p-2 min-w-[200px] max-w-[calc(100vw-2rem)] max-h-[350px] overflow-y-auto animate-in fade-in zoom-in-95 ${align === 'left' ? 'left-0 origin-top-left' : 'right-0 origin-top-right'
          }`}>
          <div className="space-y-0.5">
            <button
              role="option"
              aria-selected={value === 'all'}
              onClick={() => {
                onChange('all');
                onClose();
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors truncate ${value === 'all'
                ? 'bg-[var(--balance-accent)] text-[var(--balance-accent-foreground)]'
                : 'hover:bg-[var(--muted)] text-foreground'
                }`}
            >
              {label} (Todos)
            </button>
            {optionGroups
              ? optionGroups
                  .filter((group) => group.options.length > 0)
                  .map((group) => (
                    <div key={group.label} role="group" aria-label={group.label}>
                      <p className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {group.label}
                      </p>
                      {group.options.map((option) => renderOption(option))}
                    </div>
                  ))
              : options.map((option) => renderOption(option))}
          </div>
        </div>
      )}
    </div>
  );
};
