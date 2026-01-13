import React, { useState, useEffect } from 'react';
import { Wallet } from 'lucide-react';

/**
 * Pantalla de carga inicial
 * Se muestra mientras Firebase verifica el estado de autenticación
 * Previene el flash de contenido de localStorage antes del login
 * Incluye transición fade-out suave
 */
export const LoadingScreen: React.FC = () => {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Activar fade-out justo antes de desmontarse
    const timer = setTimeout(() => setFadeOut(true), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`fixed inset-0 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center z-50 transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="text-center animate-fade-in">
        {/* Logo animado */}
        <div className="relative mb-8 inline-block">
          <div className="absolute inset-0 bg-blue-500 dark:bg-blue-400 rounded-full blur-xl opacity-50 animate-pulse"></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-full p-6 shadow-2xl">
            <Wallet className="h-16 w-16 text-blue-500 dark:text-blue-400 animate-bounce" />
          </div>
        </div>

        {/* Texto de carga */}
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3">
          MoneyTrack
        </h2>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
          Cargando tu información...
        </p>

        {/* Barra de progreso animada */}
        <div className="w-64 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mx-auto">
          <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500 rounded-full animate-loading-bar"></div>
        </div>
      </div>

      {/* Estilos de animación */}
      <style jsx>{`
        @keyframes loading-bar {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(400%);
          }
        }

        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-loading-bar {
          animation: loading-bar 1.5s ease-in-out infinite;
          width: 40%;
        }

        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }
      `}</style>
    </div>
  );
};
