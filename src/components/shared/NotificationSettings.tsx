/**
 * 🟢 Componente para gestionar notificaciones de navegador
 * 
 * Muestra un banner para solicitar permisos y configurar notificaciones
 * 
 * NOTA: Temporalmente deshabilitado - requiere implementación de push notifications
 */

import React from 'react';
import { Bell } from 'lucide-react';

interface NotificationSettingsProps {
  onClose?: () => void;
}

export const NotificationSettings: React.FC<NotificationSettingsProps> = ({ onClose }) => {
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
            Notificaciones del navegador
          </h4>
          <p className="text-sm text-purple-700 dark:text-purple-300">
            Las notificaciones push del navegador estarán disponibles próximamente.
          </p>
        </div>
      </div>
    </div>
  );
};
