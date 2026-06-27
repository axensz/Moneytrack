import React from 'react';
import { Wallet, ArrowRight } from 'lucide-react';
import { BaseModal } from './BaseModal';

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
  return (
    <BaseModal isOpen={isOpen} onClose={onClose} closeOnBackdrop={false} showCloseButton={false}>
      <div className="p-6 sm:p-8">
        <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10">
          <Wallet size={32} className="text-primary" />
        </div>

        <h2 className="text-2xl font-bold text-center text-foreground mb-3">
          ¡Bienvenido a MoneyTrack!
        </h2>

        <p className="text-center text-muted-foreground mb-6">
          Para comenzar a usar la aplicación, necesitas crear al menos una cuenta.
        </p>

        <div className="space-y-3 mb-6 p-4 bg-muted rounded-lg border border-border">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg mt-0.5">
              <Wallet size={18} className="text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-1">
                Crea tu primera cuenta
              </h3>
              <p className="text-sm text-muted-foreground">
                Ve a la sección de <strong>Cuentas</strong> y agrega tu cuenta bancaria, tarjeta de crédito o efectivo.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg mt-0.5">
              <ArrowRight size={18} className="text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-1">
                Comienza a registrar transacciones
              </h3>
              <p className="text-sm text-muted-foreground">
                Una vez creada tu cuenta, podrás agregar ingresos, gastos y transferencias.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onGoToAccounts}
            className="flex-1 btn-primary"
          >
            Ir a Cuentas
            <ArrowRight size={18} />
          </button>
          <button
            onClick={onClose}
            className="flex-1 btn-cancel"
          >
            Entendido
          </button>
        </div>
      </div>
    </BaseModal>
  );
};
