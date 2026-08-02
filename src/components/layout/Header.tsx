'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  Bell,
  Eye,
  EyeOff,
  HelpCircle,
  LogIn,
  LogOut,
  Settings,
  Sparkles,
  Tag,
  User as UserIcon,
} from 'lucide-react';
import { ThemeToggle } from '../theme/ThemeToggle';
import { NotificationBell, NotificationCenter } from '../notifications/NotificationCenter';
import { useDismissable } from '../../hooks/useDismissable';
import { useUIPreferences } from '../../contexts/UIPreferencesContext';
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
  aiReady: boolean;
  onOpenAssistant: (returnFocusTo: HTMLElement) => void;
  onLogout: () => Promise<void>;
  pendingSettingsCount?: number;
  aiAuthPending?: boolean;
}

const menuItemClass =
  'w-full flex items-center justify-start gap-3 px-4 py-2.5 text-left text-sm text-foreground whitespace-nowrap hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary';

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
  aiReady,
  onOpenAssistant,
  onLogout,
  pendingSettingsCount = 0,
  aiAuthPending = false,
}) => {
  const { hideBalances, setHideBalances } = useUIPreferences();
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const focusFirstMenuItem = useCallback((menuRef: React.RefObject<HTMLDivElement | null>) => {
    const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    first?.focus();
  }, []);

  useEffect(() => {
    if (showSettingsMenu) focusFirstMenuItem(settingsMenuRef);
  }, [focusFirstMenuItem, showSettingsMenu]);

  const handleMenuKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLDivElement>,
    menuRef: React.RefObject<HTMLDivElement | null>,
    close: () => void,
    triggerRef: React.RefObject<HTMLButtonElement | null>
  ) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
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
        close();
        triggerRef.current?.focus();
        break;
    }
  }, []);

  const closeSettingsMenu = useCallback(() => setShowSettingsMenu(false), [setShowSettingsMenu]);
  useDismissable({
    isOpen: showSettingsMenu,
    onClose: closeSettingsMenu,
    ref: settingsMenuRef,
    triggerRef: settingsButtonRef,
  });

  const closeNotifications = useCallback(() => setShowNotifications(false), [setShowNotifications]);
  useDismissable({
    isOpen: showNotifications,
    onClose: closeNotifications,
    ref: notificationsRef,
    ignoreSelectors: ['[data-notification-center]'],
  });

  const accountLabel = user?.displayName || user?.email || 'Usuario';
  const assistantLabel = !user
    ? 'Inicia sesión para usar el asistente IA'
    : aiReady
      ? 'Abrir asistente IA'
      : 'Activar asistente IA';

  const activateAssistant = useCallback((returnFocusTo: HTMLElement) => {
    if (!user) setIsAuthModalOpen(true);
    else if (!aiReady) onOpenAISettings();
    else onOpenAssistant(returnFocusTo);
  }, [aiReady, onOpenAISettings, onOpenAssistant, setIsAuthModalOpen, user]);

  return (
    <header className="w-full min-w-0 max-w-full overflow-x-clip flex items-center pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 sm:pt-[calc(0.75rem+env(safe-area-inset-top))] sm:pb-3 bg-card/90 backdrop-blur-md border-b border-border z-[100] shadow-sm shrink-0">
      <div className="w-full min-w-0 px-3 sm:px-4 md:px-6 lg:px-8">
        <div className="flex min-w-0 justify-between items-center">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3 flex-1">
            <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold leading-none whitespace-nowrap">
              <span className="text-primary">Money</span>
              <span className="text-foreground">Track</span>
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {user && (
              <div
                className="hidden sm:flex items-center rounded-lg p-1 text-foreground"
                role="status"
                aria-label={`Sesión iniciada como ${accountLabel}`}
              >
                {user.photoURL ? (
                  <Image
                    src={user.photoURL}
                    alt=""
                    aria-hidden="true"
                    width={36}
                    height={36}
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border-2 border-border-accent"
                  />
                ) : (
                  <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-balance-accent flex items-center justify-center text-primary" aria-hidden="true">
                    <UserIcon size={18} />
                  </span>
                )}
              </div>
            )}

            <ThemeToggle />

            <button
              type="button"
              onClick={() => setHideBalances(!hideBalances)}
              className="header-icon min-w-[44px] min-h-[44px]"
              title={hideBalances ? 'Mostrar valores' : 'Ocultar valores'}
              aria-label={hideBalances ? 'Mostrar valores' : 'Ocultar valores'}
              aria-pressed={hideBalances}
            >
              {hideBalances ? <Eye size={20} aria-hidden="true" /> : <EyeOff size={20} aria-hidden="true" />}
            </button>

            {user && (
              <div className="relative" ref={notificationsRef}>
                <NotificationBell
                  isOpen={showNotifications}
                  onToggle={() => setShowNotifications(!showNotifications)}
                  onClose={() => setShowNotifications(false)}
                />
              </div>
            )}

            <button
              type="button"
              data-header-action="assistant"
              onClick={(event) => activateAssistant(event.currentTarget)}
              className="header-icon hidden lg:inline-flex"
              aria-label={assistantLabel}
              title={assistantLabel}
            >
              <Sparkles size={20} aria-hidden="true" />
            </button>

            <div className="relative" ref={settingsMenuRef}>
              <button
                ref={settingsButtonRef}
                onClick={() => {
                  setShowSettingsMenu(!showSettingsMenu);
                }}
                className="header-icon"
                aria-label={
                  pendingSettingsCount > 0
                    ? `Abrir menú de ajustes (${pendingSettingsCount} pendiente${pendingSettingsCount !== 1 ? 's' : ''})`
                    : 'Abrir menú de ajustes'
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

              {showSettingsMenu && (
                <div
                  className="absolute right-0 mt-2 w-[min(calc(100vw-2rem),17rem)] bg-card text-card-foreground rounded-lg shadow-lg border border-border py-1 z-50 animate-in fade-in zoom-in duration-200"
                  role="menu"
                  aria-label="Opciones de ajustes"
                  onKeyDown={(e) => handleMenuKeyDown(e, settingsMenuRef, closeSettingsMenu, settingsButtonRef)}
                >
                  <button
                    onClick={() => {
                      onOpenCategories();
                      setShowSettingsMenu(false);
                    }}
                    className={menuItemClass}
                    role="menuitem"
                  >
                    <Tag size={18} aria-hidden="true" />
                    <span>Categorías y personas</span>
                  </button>
                  {user && (
                    <button
                      onClick={() => {
                        onOpenNotificationPreferences();
                        setShowSettingsMenu(false);
                      }}
                      className={menuItemClass}
                      role="menuitem"
                    >
                      <Bell size={18} aria-hidden="true" />
                      <span>Notificaciones</span>
                    </button>
                  )}
                  <button
                    onClick={(event) => {
                      const returnFocusTo = settingsButtonRef.current ?? event.currentTarget;
                      setShowSettingsMenu(false);
                      activateAssistant(returnFocusTo);
                    }}
                    className={menuItemClass}
                    role="menuitem"
                  >
                    <Sparkles size={18} aria-hidden="true" />
                    <span>{assistantLabel}</span>
                    {aiAuthPending && (
                      <span
                        className="ml-auto w-2 h-2 rounded-full bg-destructive"
                        title="Autorización de IA pendiente"
                        aria-label="Autorización de IA pendiente"
                      />
                    )}
                  </button>
                  <div className="my-1 border-t border-border" aria-hidden="true" />
                  <button
                    onClick={() => {
                      onOpenHelp();
                      setShowSettingsMenu(false);
                    }}
                    className={menuItemClass}
                    role="menuitem"
                  >
                    <HelpCircle size={18} aria-hidden="true" />
                    <span>Ayuda</span>
                  </button>
                  {user && (
                    <>
                      <div className="my-1 border-t border-border" aria-hidden="true" />
                      <button
                        type="button"
                        data-settings-action="logout"
                        onClick={() => {
                          setShowSettingsMenu(false);
                          void onLogout();
                        }}
                        className={menuItemClass + ' text-destructive'}
                        role="menuitem"
                      >
                        <LogOut size={18} aria-hidden="true" />
                        <span>Cerrar sesión</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {user ? (
              <button
                type="button"
                data-header-action="logout"
                onClick={() => void onLogout()}
                className="header-icon hidden sm:inline-flex hover:text-destructive"
                aria-label="Cerrar sesión"
              >
                <LogOut size={20} aria-hidden="true" />
              </button>
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
          </div>
        </div>
      </div>

      {user && (
        <NotificationCenter
          isOpen={showNotifications}
          onClose={() => setShowNotifications(false)}
        />
      )}
    </header>
  );
};
