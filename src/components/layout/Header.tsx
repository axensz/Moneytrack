'use client';

import React, { useRef, useEffect } from 'react';
import { LogIn, LogOut, User as UserIcon, Settings, HelpCircle, Tag } from 'lucide-react';
import { ThemeToggle } from '../theme/ThemeToggle';
import type { User } from 'firebase/auth';

interface HeaderProps {
  user: User | null;
  setIsAuthModalOpen: (open: boolean) => void;
  showSettingsMenu: boolean;
  setShowSettingsMenu: (show: boolean) => void;
  onOpenHelp: () => void;
  onOpenCategories: () => void;
  onLogout: () => Promise<void>;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  setIsAuthModalOpen,
  showSettingsMenu,
  setShowSettingsMenu,
  onOpenHelp,
  onOpenCategories,
  onLogout
}) => {
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  // Cerrar menú al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
    };

    if (showSettingsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettingsMenu]);

  return (
    <header className="w-full py-3 sm:py-4 bg-white/90 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/80 dark:border-gray-800 sticky top-0 z-20 shadow-sm">
      <div className="px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-3 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">
              <span className="text-purple-600 dark:text-purple-400">Money</span>
              <span className="text-gray-800 dark:text-gray-100">Track</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Usuario logueado - Nombre primero */}
            {user ? (
              <div className="flex items-center gap-1.5 sm:gap-2" role="status" aria-label={`Sesión iniciada como ${user.displayName || 'Usuario'}`}>
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    aria-hidden="true"
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border-2 border-purple-200 dark:border-purple-700"
                  />
                ) : (
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400" aria-hidden="true">
                    <UserIcon size={18} />
                  </div>
                )}
                <span className="hidden md:inline text-sm font-medium text-gray-900 dark:text-gray-100 max-w-24 truncate">
                  {user.displayName?.split(' ')[0] || 'Usuario'}
                </span>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium active:opacity-80 transition-opacity"
                aria-label="Iniciar sesión"
              >
                <LogIn size={16} className="sm:w-[18px] sm:h-[18px]" aria-hidden="true" />
                <span className="hidden sm:inline">Acceder</span>
              </button>
            )}

            {/* Divisor */}
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Menú de Configuración */}
            <div className="relative" ref={settingsMenuRef}>
              <button
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                className="p-2 sm:p-2.5 text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 active:bg-gray-100 dark:active:bg-gray-800 rounded-lg transition-colors"
                aria-label="Abrir menú de configuración"
                aria-expanded={showSettingsMenu}
                aria-haspopup="menu"
              >
                <Settings size={20} aria-hidden="true" />
              </button>

              {/* Menú desplegable */}
              {showSettingsMenu && (
                <div
                  className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 animate-in fade-in zoom-in duration-200"
                  role="menu"
                  aria-label="Opciones de configuración"
                >
                  <button
                    onClick={() => {
                      onOpenCategories();
                      setShowSettingsMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    role="menuitem"
                  >
                    <Tag size={18} aria-hidden="true" />
                    <span>Categorías</span>
                  </button>
                  <button
                    onClick={() => {
                      onOpenHelp();
                      setShowSettingsMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    role="menuitem"
                  >
                    <HelpCircle size={18} aria-hidden="true" />
                    <span>Manual de Ayuda</span>
                  </button>
                </div>
              )}
            </div>

            {/* Botón de salir - solo si está logueado */}
            {user && (
              <button
                onClick={onLogout}
                className="p-2 sm:p-2.5 text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 active:bg-gray-100 dark:active:bg-gray-800 rounded-lg transition-colors"
                aria-label="Cerrar sesión"
              >
                <LogOut size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};