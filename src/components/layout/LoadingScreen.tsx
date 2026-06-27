import React, { useState, useEffect } from 'react';
import { Wallet, DollarSign, TrendingUp, LogOut } from 'lucide-react';

interface LoadingScreenProps {
  message?: string;
  variant?: 'default' | 'logout';
}

/**
 * Pantalla de carga inicial
 * Se muestra mientras Firebase verifica el estado de autenticación
 * Previene el flash de contenido de localStorage antes del login
 * Incluye transición fade-out suave
 */
export const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
  message = 'Organizando tus finanzas...',
  variant = 'default'
}) => {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Activar fade-out justo antes de desmontarse
    const timer = setTimeout(() => setFadeOut(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const isLogout = variant === 'logout';

  return (
    <div
      // Splash: base casi-neutra (charcoal con un matiz violet) y un bloom
      // violet suave desde el centro. La marca se siente como luz, no como un
      // bloque morado plano (regla anti-slop: base neutra + un solo acento).
      className={`fixed inset-0 overflow-hidden bg-[#f6f5fb] dark:bg-[#100d18] flex items-center justify-center z-50 transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Bloom violet ambiental: florece tras el logo y se desvanece al borde. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 85% at 50% 42%, color-mix(in srgb, var(--primary) 16%, transparent), transparent 60%)',
        }}
      />
      <div className="relative z-10 text-center">
        {/* Logo principal con resplandor */}
        <div className="relative mb-6 inline-block animate-scale-in">
          {/* Resplandor de fondo — marca (violet) por defecto; ámbar al cerrar
              sesión. color-mix con transparente = mismo wash suave del original
              sin depender de literales Tailwind. */}
          <div
            className="absolute inset-0 rounded-3xl blur-2xl scale-110"
            style={{
              backgroundColor: isLogout
                ? 'color-mix(in srgb, var(--warning) 20%, transparent)'
                : 'color-mix(in srgb, var(--primary) 20%, transparent)',
            }}
          ></div>

          {/* Card del logo */}
          <div className="relative bg-card rounded-3xl p-8 shadow-2xl border border-border">
            {/* Iconos flotantes decorativos */}
            <div className={`absolute -top-2 -right-2 rounded-full p-2 shadow-lg animate-float ${
              isLogout ? 'bg-[var(--warning)]' : 'bg-[var(--primary)]'
            }`}>
              <DollarSign className="h-4 w-4 text-white" />
            </div>
            <div className={`absolute -bottom-2 -left-2 rounded-full p-2 shadow-lg animate-float-delayed ${
              isLogout ? 'bg-[var(--warning)]' : 'bg-[var(--balance-value)]'
            }`}>
              {isLogout ? <LogOut className="h-4 w-4 text-white" /> : <TrendingUp className="h-4 w-4 text-white" />}
            </div>

            {/* Logo principal */}
            <Wallet className={`h-20 w-20 animate-pulse-slow ${
              isLogout ? 'text-warning' : 'text-primary'
            }`} />
          </div>
        </div>

        {/* Texto de carga */}
        <div className="animate-fade-in-up">
          <h2 className={`text-3xl font-bold mb-2 ${
            isLogout ? 'text-warning' : 'text-primary'
          }`}>
            MoneyTrack
          </h2>
          <p className="text-muted-foreground text-sm">
            {message}
          </p>
        </div>

        {/* Puntos de carga animados */}
        <div className="flex justify-center gap-2 mt-8">
          <div className={`w-2 h-2 rounded-full animate-bounce-dot ${isLogout ? 'bg-[var(--warning)]' : 'bg-[var(--primary)]'}`}></div>
          <div className={`w-2 h-2 rounded-full animate-bounce-dot ${isLogout ? 'bg-[var(--warning)]' : 'bg-[var(--primary)]'}`} style={{ animationDelay: '0.2s' }}></div>
          <div className={`w-2 h-2 rounded-full animate-bounce-dot ${isLogout ? 'bg-[var(--warning)]' : 'bg-[var(--primary)]'}`} style={{ animationDelay: '0.4s' }}></div>
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
