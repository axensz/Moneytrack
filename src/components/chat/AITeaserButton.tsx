'use client';

import React from 'react';
import { Sparkles, Plus, LogIn } from 'lucide-react';

interface AITeaserButtonProps {
  /** Si hay sesión iniciada. Define el destino del clic y el copy. */
  isLoggedIn: boolean;
  /**
   * Acción al activar: si hay sesión → abrir ajustes de IA (GeminiKeyModal);
   * si es invitado → abrir el modal de autenticación.
   */
  onActivate: () => void;
}

/**
 * Teaser flotante del Asistente IA (A6).
 *
 * PROBLEMA QUE RESUELVE: antes el asistente solo se montaba para usuarios
 * autenticados Y con la API key configurada (`{user && <AIChatBot/>}` +
 * `if (!configured) return null`), así que el diferenciador BYOK era invisible
 * para invitados y para quien aún no había puesto su key. Casi nadie lo
 * descubría.
 *
 * Este botón atenuado aparece justo en esos casos e invita a activarlo:
 *   - invitado → abre el login.
 *   - autenticado sin key/consentimiento → abre GeminiKeyModal con la propuesta.
 *
 * Es deliberadamente LIGERO (sin imports de `lib/gemini`) para no cargar el
 * chunk del chat ni el cliente de Gemini hasta que la IA esté realmente lista
 * (preserva el lazy-load de `AIChatBot`).
 */
export const AITeaserButton: React.FC<AITeaserButtonProps> = ({ isLoggedIn, onActivate }) => {
  const label = isLoggedIn
    ? 'Activar asistente IA'
    : 'Inicia sesión para usar el asistente IA';

  return (
    <button
      onClick={onActivate}
      className="fixed bottom-[88px] sm:bottom-6 right-4 sm:right-6 z-40 p-4 rounded-full bg-gradient-to-br from-purple-500/80 via-violet-500/80 to-purple-600/80 text-white shadow-lg hover:shadow-2xl hover:scale-110 hover:from-purple-600 hover:via-violet-600 hover:to-purple-700 transition-all duration-300 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2"
      title={label}
      aria-label={label}
    >
      <Sparkles size={24} className="group-hover:rotate-12 transition-transform duration-300" />
      {/* Badge de "activar": + si hay sesión, login si es invitado */}
      <span className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-amber-400 to-amber-500 rounded-full flex items-center justify-center shadow-md">
        {isLoggedIn ? (
          <Plus size={12} strokeWidth={3} className="text-amber-900" />
        ) : (
          <LogIn size={11} strokeWidth={2.5} className="text-amber-900" />
        )}
      </span>
    </button>
  );
};
