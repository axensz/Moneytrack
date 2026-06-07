'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, ExternalLink, Trash2, ShieldCheck } from 'lucide-react';
import { BaseModal } from './BaseModal';
import { useGeminiKey } from '../../contexts/GeminiKeyContext';
import { showToast } from '../../utils/toastHelpers';

interface GeminiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GeminiKeyModal({ isOpen, onClose }: GeminiKeyModalProps) {
  const { apiKey, isConfigured, saveApiKey, clearApiKey, hasConsent, setConsent } = useGeminiKey();
  const [draft, setDraft] = useState('');

  const handleToggleConsent = (value: boolean) => {
    setConsent(value);
    showToast.success(value ? 'IA autorizada' : 'Autorización de IA revocada');
  };

  // Sincronizar el input con la key guardada al abrir
  useEffect(() => {
    if (isOpen) setDraft(apiKey);
  }, [isOpen, apiKey]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed.length <= 10) {
      showToast.error('La API key no parece válida');
      return;
    }
    saveApiKey(trimmed);
    showToast.success(trimmed ? 'API key guardada' : 'API key eliminada');
    onClose();
  };

  const handleClear = () => {
    clearApiKey();
    setDraft('');
    showToast.success('API key eliminada');
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Asistente con IA (Gemini)"
      titleIcon={<Sparkles size={20} className="text-purple-600 dark:text-purple-400" />}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Las funciones de IA (categorización automática, chat financiero e importación de PDF)
          usan <strong>tu propia</strong> API key gratuita de Google Gemini. Sin key, el resto de
          la app funciona normal; solo la IA queda desactivada.
        </p>

        <ol className="text-sm text-gray-600 dark:text-gray-300 list-decimal pl-5 space-y-1">
          <li>
            Abre{' '}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 underline underline-offset-2"
            >
              Google AI Studio <ExternalLink size={12} aria-hidden="true" />
            </a>{' '}
            e inicia sesión con tu cuenta de Google.
          </li>
          <li>Crea una API key (gratis) y cópiala.</li>
          <li>Pégala aquí abajo y guarda.</li>
        </ol>

        <div>
          <label htmlFor="gemini-api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            API key de Gemini
          </label>
          <input
            id="gemini-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="AIza..."
            className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          {isConfigured && (
            <p className="mt-1.5 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <ShieldCheck size={12} aria-hidden="true" /> Hay una API key configurada.
            </p>
          )}
        </div>

        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-xs text-amber-700 dark:text-amber-300">
          <ShieldCheck size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Si <strong>inicias sesión</strong>, tu key se guarda en tu cuenta para sincronizarse
            entre tus dispositivos (cifrada en reposo; solo tú puedes leerla). Como invitado, se
            guarda solo en este navegador. Al usar la IA, las descripciones y montos de tus
            movimientos (y los PDF que importes) se envían a Google con tu key. Recomendado:{' '}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              restringe tu key
            </a>{' '}
            a la API de Gemini.
          </span>
        </div>

        {/* Consentimiento explícito (S4): la IA queda desactivada hasta autorizarlo. */}
        <label
          htmlFor="ai-consent"
          className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <input
            id="ai-consent"
            type="checkbox"
            checked={hasConsent}
            onChange={(e) => handleToggleConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Autorizo el envío de las descripciones, montos y PDF de mis movimientos a Google Gemini
            cuando use funciones de IA. Sin esta autorización, la IA permanece desactivada y ningún
            dato sale de mi dispositivo.
          </span>
        </label>

        {isConfigured && !hasConsent && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Tienes una API key configurada, pero la IA está desactivada hasta que autorices el envío
            de datos arriba.
          </p>
        )}

        <div className="flex justify-between gap-3 pt-1">
          {isConfigured ? (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors"
            >
              <Trash2 size={16} aria-hidden="true" /> Eliminar
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </BaseModal>
  );
}
