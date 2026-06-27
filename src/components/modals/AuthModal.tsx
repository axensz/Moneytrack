import { useState } from 'react';
import { loginWithGoogle } from '../../lib/firebase';
import { showToast } from '../../utils/toastHelpers';
import { logger } from '../../utils/logger';
import { mapAuthError } from '../../utils/authErrors';
import { BaseModal } from './BaseModal';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    // Evita un segundo signInWithPopup mientras hay uno en curso.
    if (isLoading) return;
    try {
      setIsLoading(true);
      await loginWithGoogle();
      onClose();
      showToast.success('Sesión iniciada correctamente');
    } catch (error) {
      logger.error('Error al iniciar sesión', error);
      const { message, silent } = mapAuthError(error);
      // Si el usuario canceló el popup no mostramos un mensaje de error.
      if (!silent) {
        showToast.error(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="Acceder a MoneyTrack">
      <div className="p-8 text-center">
        <div className="mb-6">
          <p className="text-gray-600 dark:text-gray-300 mb-2">
            Sincroniza tus finanzas en todos tus dispositivos.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No perderás tus datos si borras el historial.
          </p>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          aria-busy={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-white font-medium py-3 px-4 rounded-xl transition-[box-shadow,background-color] shadow-sm hover:shadow active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-gray-700 disabled:active:scale-100"
        >
          {isLoading ? (
            <>
              <svg
                className="w-5 h-5 animate-spin text-gray-500 dark:text-gray-300"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Conectando…
            </>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continuar con Google
            </>
          )}
        </button>

        {/* P-guest-hidden: el modo invitado era indescubrible (el modal solo
            ofrecía Google). Se divulga que la app es usable sin cuenta. */}
        <div className="mt-5 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          <span className="text-xs text-gray-400 dark:text-gray-500">o</span>
          <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        </div>
        <button
          onClick={onClose}
          disabled={isLoading}
          className="mt-4 w-full py-3 px-4 rounded-xl font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Continuar sin cuenta
        </button>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Puedes usar MoneyTrack sin cuenta — tus datos se guardan solo en este dispositivo.
        </p>
      </div>
    </BaseModal>
  );
}
