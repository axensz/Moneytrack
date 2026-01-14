import React, { useState, useEffect } from 'react';
import { Wallet, DollarSign, TrendingUp } from 'lucide-react';

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
      className={`fixed inset-0 bg-gradient-to-br from-stone-50 via-amber-50/50 to-orange-50/30 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center z-50 transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="text-center">
        {/* Logo principal con resplandor */}
        <div className="relative mb-6 inline-block animate-scale-in">
          {/* Resplandor de fondo */}
          <div className="absolute inset-0 bg-gradient-to-br from-amber-400/20 to-orange-400/20 dark:from-purple-500/20 dark:to-pink-500/20 rounded-3xl blur-2xl scale-110"></div>
          
          {/* Card del logo */}
          <div className="relative bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-2xl border border-gray-100 dark:border-gray-700">
            {/* Iconos flotantes decorativos */}
            <div className="absolute -top-2 -right-2 bg-amber-500 dark:bg-purple-500 rounded-full p-2 shadow-lg animate-float">
              <DollarSign className="h-4 w-4 text-white" />
            </div>
            <div className="absolute -bottom-2 -left-2 bg-orange-500 dark:bg-pink-500 rounded-full p-2 shadow-lg animate-float-delayed">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            
            {/* Logo principal */}
            <Wallet className="h-20 w-20 text-amber-600 dark:text-purple-400 animate-pulse-slow" />
          </div>
        </div>

        {/* Texto de carga */}
        <div className="animate-fade-in-up">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent mb-2">
            MoneyTrack
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Organizando tus finanzas...
          </p>
        </div>

        {/* Puntos de carga animados */}
        <div className="flex justify-center gap-2 mt-8">
          <div className="w-2 h-2 bg-amber-500 dark:bg-purple-500 rounded-full animate-bounce-dot"></div>
          <div className="w-2 h-2 bg-amber-500 dark:bg-purple-500 rounded-full animate-bounce-dot" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-amber-500 dark:bg-purple-500 rounded-full animate-bounce-dot" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>

      {/* Estilos de animación */}
      <style jsx>{`
        @keyframes scale-in {
          0% {
            opacity: 0;
            transform: scale(0.8);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes fade-in-up {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(-10px) rotate(5deg);
          }
        }

        @keyframes float-delayed {
          0%, 100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(-8px) rotate(-5deg);
          }
        }

        @keyframes bounce-dot {
          0%, 80%, 100% {
            transform: translateY(0);
          }
          40% {
            transform: translateY(-8px);
          }
        }

        @keyframes pulse-slow {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
        }

        .animate-scale-in {
          animation: scale-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out 0.2s both;
        }

        .animate-float {
          animation: float 3s ease-in-out infinite;
        }

        .animate-float-delayed {
          animation: float-delayed 3s ease-in-out infinite 0.5s;
        }

        .animate-bounce-dot {
          animation: bounce-dot 1.4s ease-in-out infinite;
        }

        .animate-pulse-slow {
          animation: pulse-slow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};
