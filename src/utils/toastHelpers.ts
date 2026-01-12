/**
 * Helper centralizado para notificaciones toast
 * Proporciona una API consistente para mostrar mensajes al usuario
 */

import toast from 'react-hot-toast';

/**
 * API unificada para notificaciones toast
 * Uso: showToast.error('mensaje'), showToast.success('mensaje')
 */
export const showToast = {
  /**
   * Muestra un mensaje de error
   * @param message - Mensaje a mostrar
   */
  error: (message: string): void => {
    toast.error(message, { duration: 4000 });
  },

  /**
   * Muestra un mensaje de éxito
   * @param message - Mensaje a mostrar
   */
  success: (message: string): void => {
    toast.success(message, { duration: 2000 });
  },

  /**
   * Muestra un mensaje informativo
   * @param message - Mensaje a mostrar
   */
  info: (message: string): void => {
    toast(message, { duration: 3000 });
  },

  /**
   * Muestra un mensaje de advertencia
   * @param message - Mensaje a mostrar
   */
  warning: (message: string): void => {
    toast(message, {
      duration: 3500,
      icon: '⚠️',
    });
  },
};
