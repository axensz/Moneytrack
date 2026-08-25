'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

type Option = { value: string; label: string };

const PANEL_MAX_HEIGHT = 350;
const PANEL_MIN_COMFORTABLE_HEIGHT = 160;
const PANEL_EDGE_GAP = 8;

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelLayout, setPanelLayout] = useState({
    placement: 'below' as 'below' | 'above',
    maxHeight: PANEL_MAX_HEIGHT,
  });

  const renderedOptions = useMemo(
    () => optionGroups
      ? optionGroups.flatMap(group => group.options)
      : options,
    [optionGroups, options],
  );
  const menuOptions = useMemo(
    () => [{ value: 'all', label: `${label} (Todos)` }, ...renderedOptions],
    [label, renderedOptions],
  );

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

  useEffect(() => {
    if (!isOpen) return;

    const selectedIndex = Math.max(0, menuOptions.findIndex(option => option.value === value));
    setActiveIndex(selectedIndex);
    const frame = window.requestAnimationFrame(() => {
      const option = optionRefs.current[selectedIndex];
      option?.focus({ preventScroll: true });

      const panel = option?.closest<HTMLElement>('[role="listbox"]');
      if (!option || !panel) return;

      const optionRect = option.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      if (optionRect.top < panelRect.top) {
        panel.scrollTop -= panelRect.top - optionRect.top;
      } else if (optionRect.bottom > panelRect.bottom) {
        panel.scrollTop += optionRect.bottom - panelRect.bottom;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, menuOptions, value]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    const updatePanelLayout = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const viewportTop = window.visualViewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (window.visualViewport?.height ?? window.innerHeight);
      const navigationTop = Array.from(document.querySelectorAll<HTMLElement>('nav[role="navigation"]'))
        .map(element => element.getBoundingClientRect())
        .filter(rect => rect.height > 0 && rect.bottom >= viewportBottom - 1)
        .reduce((top, rect) => Math.min(top, rect.top), viewportBottom);
      const triggerRect = trigger.getBoundingClientRect();
      const availableBelow = Math.max(0, Math.floor(navigationTop - triggerRect.bottom - PANEL_EDGE_GAP));
      const availableAbove = Math.max(0, Math.floor(triggerRect.top - viewportTop - PANEL_EDGE_GAP));
      const placement = availableBelow < PANEL_MIN_COMFORTABLE_HEIGHT && availableAbove > availableBelow
        ? 'above'
        : 'below';
      const maxHeight = Math.min(
        PANEL_MAX_HEIGHT,
        placement === 'above' ? availableAbove : availableBelow,
      );

      setPanelLayout(current => (
        current.placement === placement && current.maxHeight === maxHeight
          ? current
          : { placement, maxHeight }
      ));
    };

    updatePanelLayout();
    const visualViewport = window.visualViewport;
    window.addEventListener('resize', updatePanelLayout);
    window.addEventListener('scroll', updatePanelLayout, true);
    visualViewport?.addEventListener('resize', updatePanelLayout);
    visualViewport?.addEventListener('scroll', updatePanelLayout);

    return () => {
      window.removeEventListener('resize', updatePanelLayout);
      window.removeEventListener('scroll', updatePanelLayout, true);
      visualViewport?.removeEventListener('resize', updatePanelLayout);
      visualViewport?.removeEventListener('scroll', updatePanelLayout);
    };
  }, [isOpen]);

  const selectedLabel = options.find((option) => option.value === value)?.label || label;
  const isActive = value !== 'all';

  const closeAndRestoreFocus = () => {
    onClose();
    triggerRef.current?.focus();
  };

  const selectOption = (optionValue: string) => {
    onChange(optionValue);
    closeAndRestoreFocus();
  };

  const moveFocus = (nextIndex: number) => {
    const normalizedIndex = (nextIndex + menuOptions.length) % menuOptions.length;
    setActiveIndex(normalizedIndex);
    optionRefs.current[normalizedIndex]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) return;

    const focusedIndex = optionRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    const currentIndex = focusedIndex >= 0 ? focusedIndex : activeIndex;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(currentIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(currentIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        moveFocus(0);
        break;
      case 'End':
        event.preventDefault();
        moveFocus(menuOptions.length - 1);
        break;
      case 'Enter':
      case ' ':
        if (focusedIndex >= 0) {
          event.preventDefault();
          selectOption(menuOptions[focusedIndex].value);
        }
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        closeAndRestoreFocus();
        break;
    }
  };

  const renderOption = (option: Option, index: number) => (
    <button
      key={option.value}
      ref={element => { optionRefs.current[index] = element; }}
      type="button"
      role="option"
      aria-selected={value === option.value}
      tabIndex={activeIndex === index ? 0 : -1}
      onFocus={() => setActiveIndex(index)}
      onClick={() => selectOption(option.value)}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${value === option.value
        ? 'bg-[var(--balance-accent)] text-[var(--balance-accent-foreground)]'
        : 'hover:bg-[var(--muted)] text-foreground'
        }`}
      title={option.label}
    >
      {option.label}
    </button>
  );

  return (
    <div className="relative" ref={dropdownRef} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
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
          style={{ maxHeight: panelLayout.maxHeight }}
          className={`absolute z-[100] bg-card rounded-xl shadow-xl border border-[var(--border)] p-2 min-w-[200px] max-w-[calc(100vw-2rem)] overflow-y-auto animate-in fade-in zoom-in-95 ${panelLayout.placement === 'above'
            ? `bottom-full mb-1 ${align === 'left' ? 'left-0 origin-bottom-left' : 'right-0 origin-bottom-right'}`
            : `top-full mt-1 ${align === 'left' ? 'left-0 origin-top-left' : 'right-0 origin-top-right'}`
            }`}
        >
          <div className="space-y-0.5">
            {renderOption(menuOptions[0], 0)}
            {optionGroups
              ? optionGroups
                  .filter(group => group.options.length > 0)
                  .map(group => (
                    <div key={group.label} role="group" aria-label={group.label}>
                      <p className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {group.label}
                      </p>
                      {group.options.map(option => renderOption(
                        option,
                        menuOptions.findIndex(menuOption => menuOption.value === option.value),
                      ))}
                    </div>
                  ))
              : renderedOptions.map((option, index) => renderOption(option, index + 1))}
          </div>
        </div>
      )}
    </div>
  );
};
