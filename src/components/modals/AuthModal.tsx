import { loginWithGoogle } from '../../lib/firebase';
import { showToast } from '../../utils/toastHelpers';
import { logger } from '../../utils/logger';
import { BaseModal } from './BaseModal';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
      onClose();
      showToast.success('Sesión iniciada correctamente');
    } catch (error) {
      logger.error('Error al iniciar sesión', error);
      showToast.error("Error al iniciar sesión. Por favor, intenta de nuevo.");
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
          className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-white font-medium py-3 px-4 rounded-xl transition-all shadow-sm hover:shadow active:scale-[0.98]"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continuar con Google
        </button>
      </div>
    </BaseModal>
  );
}
