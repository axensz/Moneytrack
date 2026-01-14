'use client';

import React, { useRef, useEffect } from 'react';
import { LogIn, LogOut, User as UserIcon, Settings, HelpCircle } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { logoutFirebase } from '../lib/firebase';
import { showToast } from '../utils/toastHelpers';
import type { User } from 'firebase/auth';

interface HeaderProps {
  user: User | null;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  showSettingsMenu: boolean;
  setShowSettingsMenu: (show: boolean) => void;
  onOpenHelp: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  isAuthModalOpen,
  setIsAuthModalOpen,
  showSettingsMenu,
  setShowSettingsMenu,
  onOpenHelp
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

  const handleLogout = async () => {
    try {
      showToast.info('Cerrando sesión...');
      await logoutFirebase();
      showToast.success('Sesión cerrada correctamente');
    } catch (error) {
      console.error('Error al cerrar sesión', error);
      showToast.error('Error al cerrar sesión');
    }
  };
  return (
    <header className="w-full py-3 sm:py-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 sticky top-0 z-20">
      <div className="px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">
              <span className="text-purple-700 dark:text-purple-400">Money</span>
              <span className="text-gray-900 dark:text-gray-100">Track</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Menú de Configuración */}
            <div className="relative" ref={settingsMenuRef}>
              <button
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                className="p-2 sm:p-2.5 text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 active:bg-gray-100 dark:active:bg-gray-800 rounded-lg transition-colors"
                title="Configuración"
              >
                <Settings size={20} />
              </button>

              {/* Menú desplegable */}
              {showSettingsMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 animate-in fade-in zoom-in duration-200">
                  <button
                    onClick={() => {
                      onOpenHelp();
                      setShowSettingsMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <HelpCircle size={18} />
                    <span>Manual de Ayuda</span>
                  </button>
                </div>
              )}
            </div>

            <ThemeToggle />
            
            {user ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                {user.photoURL ? (
                  <img 
                    src={user.photoURL} 
                    alt={user.displayName || 'Usuario'} 
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border-2 border-purple-200 dark:border-purple-700"
                  />
                ) : (
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                    <UserIcon size={18} />
                  </div>
                )}
                <span className="hidden md:inline text-sm font-medium text-gray-900 dark:text-gray-100 max-w-24 truncate">
                  {user.displayName?.split(' ')[0] || 'Usuario'}
                </span>
                
                <button
                  onClick={handleLogout}
                  className="p-2 sm:p-2.5 text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 active:bg-gray-100 dark:active:bg-gray-800 rounded-lg transition-colors"
                  title="Cerrar sesión"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium active:opacity-80 transition-opacity"
              >
                <LogIn size={16} className="sm:w-[18px] sm:h-[18px]" />
                <span className="hidden sm:inline">Acceder</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};