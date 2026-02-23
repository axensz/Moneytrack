'use client';

import React, { useRef, useEffect } from 'react';
import { LogIn, LogOut, User as UserIcon, Settings, HelpCircle, Tag, Bell } from 'lucide-react';
import { ThemeToggle } from '../theme/ThemeToggle';
import { NotificationBell, NotificationCenter } from '../notifications/NotificationCenter';
import { InstallPrompt } from '../pwa/InstallPrompt';
import type { User } from 'firebase/auth';

interface HeaderProps {
  user: User | null;
  setIsAuthModalOpen: (open: boolean) => void;
  showSettingsMenu: boolean;
  setShowSettingsMenu: (show: boolean) => void;
  showNotifications: boolean;
  setShowNotifications: (show: boolean) => void;
  onOpenHelp: () => void;
  onOpenCategories: () => void;
  onOpenNotificationPreferences: () => void;
  onLogout: () => Promise<void>;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  setIsAuthModalOpen,
  showSettingsMenu,
  setShowSettingsMenu,
  showNotifications,
  setShowNotifications,
  onOpenHelp,
  onOpenCategories,
  onOpenNotificationPreferences,
  onLogout
}) => {
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Cerrar menú de configuración al hacer clic fuera
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
  }, [showSettingsMenu, setShowSettingsMenu]);

  // Cerrar notificaciones al hacer clic fuera
  // NOTA: NotificationCenter maneja su propio cierre via backdrop
  // Este efecto solo maneja el botón de campana
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Solo cerrar si el clic es en el botón de notificaciones o fuera de él
      // El NotificationCenter (portal) maneja su propio cierre
      const target = event.target as Node;

      // Si el clic es dentro del ref de notificaciones (el botón), no hacer nada
      if (notificationsRef.current && notificationsRef.current.contains(target)) {
        return;
      }

      // Si el clic es dentro del portal del NotificationCenter, no cerrar
      // El portal se renderiza en document.body, así que verificamos si el target
      // está dentro de un elemento con clase que identifica el NotificationCenter
      const notificationPanel = document.querySelector('[data-notification-center]');
      if (notificationPanel && notificationPanel.contains(target)) {
        return;
      }

      // Si llegamos aquí, el clic fue fuera de todo, cerrar
      setShowNotifications(false);
    };

    if (showNotifications) {
      // Usar un pequeño delay para evitar que el clic que abre el modal lo cierre inmediatamente
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showNotifications, setShowNotifications]);

  return (
    <header className="w-full py-2 sm:py-3 bg-white/90 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/80 dark:border-gray-800 sticky top-0 z-[100] shadow-sm">
      <div className="px-3 sm:px-4 md:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-3 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">
              <span className="text-purple-600 dark:text-purple-400">Money</span>
              <span className="text-gray-800 dark:text-gray-100">Track</span>
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Install PWA Button (desktop only) */}
            <InstallPrompt variant="button" />

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

            {/* Notification Bell */}
            {user && (
              <div className="relative" ref={notificationsRef}>
                <NotificationBell
                  isOpen={showNotifications}
                  onToggle={() => setShowNotifications(!showNotifications)}
                  onClose={() => setShowNotifications(false)}
                />
              </div>
            )}

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
                  {user && (
                    <button
                      onClick={() => {
                        onOpenNotificationPreferences();
                        setShowSettingsMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      role="menuitem"
                    >
                      <Bell size={18} aria-hidden="true" />
                      <span>Notificaciones</span>
                    </button>
                  )}
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

      {/* Notification Center - rendered via portal */}
      {user && (
        <NotificationCenter
          isOpen={showNotifications}
          onClose={() => setShowNotifications(false)}
        />
      )}
    </header>
  );
};