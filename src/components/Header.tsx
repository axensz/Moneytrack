'use client';

import React from 'react';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { logoutFirebase } from '../lib/firebase';
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
  return (
    <header className="w-full py-4 mb-8 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-2">
              <span className="text-purple-700 dark:text-purple-400">Money</span>
              <span className="text-gray-900 dark:text-gray-100">Track</span>
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Control financiero personal
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <ThemeToggle />
            
            {user ? (
              <div className="flex items-center gap-3 pl-4 border-l border-gray-200 dark:border-gray-700">
                {user.photoURL ? (
                  <img 
                    src={user.photoURL} 
                    alt={user.displayName || 'Usuario'} 
                    className="w-9 h-9 rounded-full border border-purple-200"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                    <UserIcon size={20} />
                  </div>
                )}
                
                <button
                  onClick={logoutFirebase}
                  className="p-2 text-gray-500 hover:text-rose-600 transition-colors"
                  title="Cerrar sesión"
                >
                  <LogOut size={20} />
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-medium hover:opacity-90 transition-opacity"
                >
                  <LogIn size={18} />
                  <span>Acceder</span>
                </button>
                
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="sm:hidden p-2 text-gray-600 dark:text-gray-300"
                >
                  <LogIn size={24} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};