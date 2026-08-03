'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  Bell,
  HelpCircle,
  LogIn,
  LogOut,
  Settings,
  Tag,
  User as UserIcon,
} from 'lucide-react';
import { ThemeToggle } from '../theme/ThemeToggle';
import { NotificationBell, NotificationCenter } from '../notifications/NotificationCenter';
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
  onLogout: () => Promise<void>;
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
  onLogout,
}) => {
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
    ).filter((item) => {
      const style = window.getComputedStyle(item);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
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
  const openSettingsModal = useCallback((openModal: () => void) => {
    setShowSettingsMenu(false);
    settingsButtonRef.current?.focus();
    openModal();
  }, [setShowSettingsMenu]);
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

            {user && (
              <div className="relative" ref={notificationsRef}>
                <NotificationBell
                  isOpen={showNotifications}
                  onToggle={() => setShowNotifications(!showNotifications)}
                  onClose={() => setShowNotifications(false)}
                />
              </div>
            )}

            <div className="relative" ref={settingsMenuRef}>
              <button
                ref={settingsButtonRef}
                onClick={() => {
                  setShowSettingsMenu(!showSettingsMenu);
                }}
                className="header-icon"
                aria-label="Abrir menú de ajustes"
                aria-expanded={showSettingsMenu}
                aria-haspopup="menu"
              >
                <Settings size={20} aria-hidden="true" />
              </button>

              {showSettingsMenu && (
                <div
                  className="absolute right-0 mt-2 w-[min(calc(100vw-2rem),17rem)] bg-card text-card-foreground rounded-lg shadow-lg border border-border py-1 z-50 animate-in fade-in zoom-in duration-200"
                  role="menu"
                  aria-label="Opciones de ajustes"
                  onKeyDown={(e) => handleMenuKeyDown(e, settingsMenuRef, closeSettingsMenu, settingsButtonRef)}
                >
                  <button
                    onClick={() => openSettingsModal(onOpenCategories)}
                    className={menuItemClass}
                    role="menuitem"
                  >
                    <Tag size={18} aria-hidden="true" />
                    <span>Categorías y personas</span>
                  </button>
                  {user && (
                    <button
                      onClick={() => openSettingsModal(onOpenNotificationPreferences)}
                      className={menuItemClass}
                      role="menuitem"
                    >
                      <Bell size={18} aria-hidden="true" />
                      <span>Notificaciones</span>
                    </button>
                  )}
                  <div className="my-1 border-t border-border" aria-hidden="true" />
                  <button
                    onClick={() => openSettingsModal(onOpenHelp)}
                    className={menuItemClass}
                    role="menuitem"
                  >
                    <HelpCircle size={18} aria-hidden="true" />
                    <span>Ayuda</span>
                  </button>
                  {user && (
                    <>
                      <div className="my-1 border-t border-border sm:hidden" aria-hidden="true" />
                      <button
                        type="button"
                        data-settings-action="logout"
                        onClick={() => {
                          setShowSettingsMenu(false);
                          void onLogout();
                        }}
                        className={menuItemClass + ' text-destructive sm:hidden'}
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
