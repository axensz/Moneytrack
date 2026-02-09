/**
 * 🟢 Componente para gestionar notificaciones de navegador
 * 
 * Muestra un banner para solicitar permisos y configurar notificaciones
 */

import React from 'react';
import { Bell, BellOff, Check, X } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';

interface NotificationSettingsProps {
  onClose?: () => void;
}

export const NotificationSettings: React.FC<NotificationSettingsProps> = ({ onClose }) => {
  const { isSupported, permission, requestPermission } = useNotifications();

  const handleRequestPermission = async () => {
    const granted = await requestPermission();
    if (granted && onClose) {
      onClose();
    }
  };

  if (!isSupported) {
    return (
      <div 
        className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg"
        role="alert"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <BellOff className="text-yellow-600 dark:text-yellow-400 mt-0.5" size={20} aria-hidden="true" />
          <div className="flex-1">
            <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
              Notificaciones no disponibles
            </h4>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              Tu navegador no soporta notificaciones web.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (permission.granted) {
    return (
      <div 
        className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <Check className="text-green-600 dark:text-green-400 mt-0.5" size={20} aria-hidden="true" />
          <div className="flex-1">
            <h4 className="font-semibold text-green-800 dark:text-green-200 mb-1">
              Notificaciones activadas
            </h4>
            <p className="text-sm text-green-700 dark:text-green-300">
              Recibirás alertas cuando tus pagos periódicos estén próximos a vencer.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (permission.denied) {
    return (
      <div 
        className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
        role="alert"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <X className="text-red-600 dark:text-red-400 mt-0.5" size={20} aria-hidden="true" />
          <div className="flex-1">
            <h4 className="font-semibold text-red-800 dark:text-red-200 mb-1">
              Notificaciones bloqueadas
            </h4>
            <p className="text-sm text-red-700 dark:text-red-300 mb-2">
              Has bloqueado las notificaciones. Para activarlas, debes cambiar la configuración en tu navegador.
            </p>
            <p className="text-xs text-red-600 dark:text-red-400">
              <strong>Chrome/Edge:</strong> Haz click en el ícono 🔒 en la barra de direcciones → Permisos → Notificaciones → Permitir
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Default: pedir permisos
  return (
    <div 
      className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg"
      role="region"
      aria-label="Configuración de notificaciones"
    >
      <div className="flex items-start gap-3">
        <Bell className="text-purple-600 dark:text-purple-400 mt-0.5" size={20} aria-hidden="true" />
        <div className="flex-1">
          <h4 className="font-semibold text-purple-800 dark:text-purple-200 mb-1">
            Activar notificaciones
          </h4>
          <p className="text-sm text-purple-700 dark:text-purple-300 mb-3">
            Recibe alertas cuando tus pagos periódicos estén próximos a vencer o se hayan vencido.
          </p>
          <button
            onClick={handleRequestPermission}
            className="btn-primary text-sm"
            aria-label="Activar notificaciones"
          >
            <Bell size={16} aria-hidden="true" />
            Activar notificaciones
          </button>
        </div>
      </div>
    </div>
  );
};
