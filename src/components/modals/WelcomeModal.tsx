import React from 'react';
import { Wallet, ArrowRight, Info } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToAccounts: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  onClose,
  onGoToAccounts
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6 sm:p-8 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100 dark:bg-purple-900/30">
          <Info size={32} className="text-purple-600 dark:text-purple-400" />
        </div>

        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-gray-100 mb-3">
          ¡Bienvenido a MoneyTrack!
        </h2>

        <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
          Para comenzar a usar la aplicación, necesitas crear al menos una cuenta.
        </p>

        <div className="space-y-3 mb-6 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-purple-200 dark:bg-purple-800 rounded-lg mt-0.5">
              <Wallet size={18} className="text-purple-700 dark:text-purple-300" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Crea tu primera cuenta
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Ve a la sección de <strong>Cuentas</strong> y agrega tu cuenta bancaria, tarjeta de crédito o efectivo.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 bg-purple-200 dark:bg-purple-800 rounded-lg mt-0.5">
              <ArrowRight size={18} className="text-purple-700 dark:text-purple-300" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Comienza a registrar transacciones
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Una vez creada tu cuenta, podrás agregar ingresos, gastos y transferencias.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onGoToAccounts}
            className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg transition-colors shadow-md"
          >
            Ir a Cuentas
            <ArrowRight size={18} />
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium py-3 px-4 rounded-lg transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
