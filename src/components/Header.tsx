'use client';

import React from 'react';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { logoutFirebase } from '../lib/firebase';
import { showToast } from '../utils/toastHelpers';
import type { User } from 'firebase/auth';

interface HeaderProps {
  user: User | null;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  isAuthModalOpen,
  setIsAuthModalOpen
}) => {
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
    <header className="w-full py-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 sticky top-0 z-20">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold">
              <span className="text-purple-700 dark:text-purple-400">Money</span>
              <span className="text-gray-900 dark:text-gray-100">Track</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            
            {user ? (
              <div className="flex items-center gap-2">
                {user.photoURL ? (
                  <img 
                    src={user.photoURL} 
                    alt={user.displayName || 'Usuario'} 
                    className="w-8 h-8 rounded-full border border-purple-200"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                    <UserIcon size={16} />
                  </div>
                )}
                <span className="hidden sm:inline text-xs font-medium text-gray-900 dark:text-gray-100 max-w-20 truncate">
                  {user.displayName?.split(' ')[0] || 'Usuario'}
                </span>
                
                <button
                  onClick={handleLogout}
                  className="p-1.5 text-gray-500 hover:text-rose-600 transition-colors"
                  title="Cerrar sesión"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <LogIn size={16} />
                <span className="hidden sm:inline">Acceder</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};