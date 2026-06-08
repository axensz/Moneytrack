/**
 * Mapea errores de autenticación de Firebase (auth/*) a mensajes en español.
 *
 * Devuelve `silent: true` cuando el error corresponde a una cancelación del
 * usuario (cerró/canceló el popup): en esos casos NO se debe mostrar un toast
 * de error, porque no es un fallo real sino una acción intencional.
 */

export interface AuthErrorResult {
  /** Mensaje en español listo para mostrar al usuario. */
  message: string;
  /** Si es true, no debe mostrarse ningún mensaje de error (cancelación). */
  silent: boolean;
}

const DEFAULT_MESSAGE = 'Error al iniciar sesión. Por favor, intenta de nuevo.';

/** Lee el código auth/* de un error desconocido de forma segura. */
function getAuthCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/**
 * Convierte un error (unknown) de Firebase Auth en un resultado mostrable.
 */
export function mapAuthError(error: unknown): AuthErrorResult {
  const code = getAuthCode(error);

  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return { message: '', silent: true };
    case 'auth/popup-blocked':
      return {
        message:
          'Tu navegador bloqueó la ventana de Google. Habilita las ventanas emergentes e intenta de nuevo.',
        silent: false,
      };
    case 'auth/account-exists-with-different-credential':
      return {
        message: 'Ya existe una cuenta con este correo usando otro método de acceso.',
        silent: false,
      };
    case 'auth/network-request-failed':
      return {
        message: 'Sin conexión. Verifica tu internet e intenta de nuevo.',
        silent: false,
      };
    default:
      return { message: DEFAULT_MESSAGE, silent: false };
  }
}
