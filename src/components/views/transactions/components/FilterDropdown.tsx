'use client';

import React, { useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface FilterDropdownProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  icon?: React.ReactNode;
}

export const FilterDropdown: React.FC<FilterDropdownProps> = ({
  label,
  value,
  options,
  onChange,
  isOpen,
  onToggle,
  onClose,
  icon,
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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors flex-shrink-0 ${
          isActive
            ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
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
        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-2 min-w-[200px] max-w-[calc(100vw-2rem)] max-h-[350px] overflow-y-auto">
           <div className="space-y-0.5">
             <button
               onClick={() => {
                 onChange('all');
                 onClose();
               }}
               className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors truncate ${
                 value === 'all'
                   ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                   : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
               }`}
             >
               {label} (Todos)
             </button>
             {options.map((option) => (
               <button
                 key={option.value}
                 onClick={() => {
                   onChange(option.value);
                   onClose();
                 }}
                 className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors truncate ${
                   value === option.value
                     ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                     : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                 }`}
                 title={option.label}
               >
                 {option.label}
               </button>
             ))}
           </div>
        </div>
      )}
    </div>
  );
};
