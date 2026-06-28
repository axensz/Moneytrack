'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { LogIn, LogOut, User as UserIcon, Settings, HelpCircle, Tag, Bell, Sparkles } from 'lucide-react';
import { ThemeToggle } from '../theme/ThemeToggle';
import { NotificationBell, NotificationCenter } from '../notifications/NotificationCenter';
import { InstallPrompt } from '../pwa/InstallPrompt';
import { useDismissable } from '../../hooks/useDismissable';
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
  onOpenAISettings: () => void;
  onLogout: () => Promise<void>;
  /** Nº de acciones de configuración pendientes (p. ej. autorizar IA). */
  pendingSettingsCount?: number;
  /** Hay una API key configurada pero la IA aún no está autorizada. */
  aiAuthPending?: boolean;
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
  onOpenAISettings,
  onLogout,
  pendingSettingsCount = 0,
  aiAuthPending = false,
}) => {
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // UI-header-menu: navegación por teclado del menú (role=menu sin teclado antes).
  // Al abrir, enfocar el primer ítem; flechas mueven el foco; Escape cierra y
  // devuelve el foco al botón disparador.
  useEffect(() => {
    if (!showSettingsMenu) return;
    const first = settingsMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    first?.focus();
  }, [showSettingsMenu]);

  const handleMenuKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      settingsMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        items[(current + 1 + items.length) % items.length]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        items[(current - 1 + items.length) % items.length]?.focus();
        break;
      case 'Home':
        e.preventDefault();
        items[0]?.focus();
        break;
      case 'End':
        e.preventDefault();
        items[items.length - 1]?.focus();
        break;
      case 'Escape':
        e.preventDefault();
        setShowSettingsMenu(false);
        settingsButtonRef.current?.focus();
        break;
    }
  }, [setShowSettingsMenu]);

  // Cierre unificado (clic fuera + Escape, con foco devuelto al disparador) —
  // mismo patrón que el menú "Más" móvil. Reemplaza los dos efectos manuales
  // de click-outside que vivían aquí.
  const closeSettingsMenu = useCallback(() => setShowSettingsMenu(false), [setShowSettingsMenu]);
  useDismissable({
    isOpen: showSettingsMenu,
    onClose: closeSettingsMenu,
    ref: settingsMenuRef,
    triggerRef: settingsButtonRef,
  });

  // Notificaciones: el panel se renderiza en un portal (NotificationCenter), por
  // eso se ignora ese subárbol con ignoreSelectors para no cerrarlo al pulsar
  // dentro. ESC ahora también cierra (antes no lo hacía).
  const closeNotifications = useCallback(() => setShowNotifications(false), [setShowNotifications]);
  useDismissable({
    isOpen: showNotifications,
    onClose: closeNotifications,
    ref: notificationsRef,
    ignoreSelectors: ['[data-notification-center]'],
  });

  return (
    <header className="w-full flex items-center py-2 sm:py-3 bg-card/90 backdrop-blur-md border-b border-border z-[100] shadow-sm shrink-0 safe-area-top">
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-3 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">
              <span className="text-primary">Money</span>
              <span className="text-foreground">Track</span>
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
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border-2 border-border-accent"
                  />
                ) : (
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-balance-accent flex items-center justify-center text-primary" aria-hidden="true">
                    <UserIcon size={18} />
                  </div>
                )}
                <span className="hidden md:inline text-sm font-medium text-foreground max-w-24 truncate">
                  {user.displayName?.split(' ')[0] || 'Usuario'}
                </span>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-foreground text-background rounded-lg text-sm font-medium active:opacity-80 transition-opacity"
                aria-label="Iniciar sesión"
              >
                <LogIn size={16} className="sm:w-[18px] sm:h-[18px]" aria-hidden="true" />
                <span className="hidden sm:inline">Acceder</span>
              </button>
            )}

            {/* Divisor */}
            <div className="h-6 w-px bg-border"></div>

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
                ref={settingsButtonRef}
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                className="header-icon"
                aria-label={
                  pendingSettingsCount > 0
                    ? `Abrir menú de configuración (${pendingSettingsCount} pendiente${pendingSettingsCount !== 1 ? 's' : ''})`
                    : 'Abrir menú de configuración'
                }
                aria-expanded={showSettingsMenu}
                aria-haspopup="menu"
              >
                <Settings size={20} aria-hidden="true" />
                {pendingSettingsCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold leading-none text-white bg-destructive rounded-full ring-2 ring-card"
                    aria-hidden="true"
                  >
                    {pendingSettingsCount}
                  </span>
                )}
              </button>

              {/* Menú desplegable */}
              {showSettingsMenu && (
                <div
                  className="absolute right-0 mt-2 w-48 bg-card text-card-foreground rounded-lg shadow-lg border border-border py-1 z-50 animate-in fade-in zoom-in duration-200"
                  role="menu"
                  aria-label="Opciones de configuración"
                  onKeyDown={handleMenuKeyDown}
                >
                  <button
                    onClick={() => {
                      onOpenCategories();
                      setShowSettingsMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
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
                      onOpenAISettings();
                      setShowSettingsMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                    role="menuitem"
                  >
                    <Sparkles size={18} aria-hidden="true" />
                    <span>Asistente IA</span>
                    {aiAuthPending && (
                      <span
                        className="ml-auto w-2 h-2 rounded-full bg-destructive"
                        title="Autorización de IA pendiente"
                        aria-label="Autorización de IA pendiente"
                      />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      onOpenHelp();
                      setShowSettingsMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
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
                className="header-icon hover:text-destructive"
                aria-label="Cerrar sesión"
              >
                <LogOut size={20} aria-hidden="true" />
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