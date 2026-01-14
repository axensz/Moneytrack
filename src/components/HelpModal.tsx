import React, { useState, useEffect } from 'react';
import { X, Wallet, TrendingUp, TrendingDown, CreditCard, PieChart, Settings, GripVertical, Eye, Edit2, Calendar, DollarSign } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'basics' | 'accounts' | 'transactions' | 'features'>('basics');

  // Prevenir scroll en el body cuando el modal está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    // MEJORA UX 1: onClick en el backdrop cierra el modal
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200"
      onClick={onClose}
    >
      <div 
        // MEJORA UX 1: stopPropagation evita que clicks dentro cierren el modal
        onClick={(e) => e.stopPropagation()} 
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl h-[85vh] sm:h-[600px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header - Sticky */}
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span>📚</span> Manual de Usuario
          </h2>
          
          {/* MEJORA UX 2: Hitbox aumentado a 44px+ y anillo de foco para accesibilidad */}
          <button
            onClick={onClose}
            aria-label="Cerrar manual"
            className="p-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
          >
            <X size={24} />
          </button>
        </div>

        {/* Tabs - Sticky */}
        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 shrink-0">
          <div className="flex gap-2 p-2 sm:p-4 overflow-x-auto no-scrollbar scroll-smooth">
            {[
              { id: 'basics', label: 'Inicio', icon: null },
              { id: 'accounts', label: 'Cuentas', icon: Wallet },
              { id: 'transactions', label: 'Transacciones', icon: TrendingUp },
              { id: 'features', label: 'Funciones', icon: Settings },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-purple-500
                  ${activeTab === tab.id
                    ? 'bg-white dark:bg-gray-700 text-purple-700 dark:text-purple-300 shadow-sm ring-1 ring-gray-200 dark:ring-gray-600'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-200 active:scale-[0.98]'
                  }
                `}
              >
                {tab.icon && <tab.icon size={16} />}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content - Scrollable con altura fija para evitar cambios de tamaño */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 scroll-smooth min-h-0">
          {activeTab === 'basics' && (
             <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Bienvenido a MoneyTrack
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
                    MoneyTrack es tu administrador financiero personal. Controla tus cuentas, registra transacciones y visualiza estadísticas de tus finanzas de manera simple y segura.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-800/50">
                    <h4 className="font-bold text-purple-900 dark:text-purple-100 mb-3 flex items-center gap-2">
                      <div className="p-1.5 bg-purple-100 dark:bg-purple-800 rounded-lg">
                        <Wallet size={16} className="text-purple-600 dark:text-purple-300" />
                      </div>
                      Primeros Pasos
                    </h4>
                    <ol className="list-decimal list-inside space-y-2.5 text-sm text-purple-800 dark:text-purple-200/90 ml-1">
                      <li>Crea tu primera cuenta</li>
                      <li>Registra tu saldo inicial</li>
                      <li>Agrega transacciones</li>
                      <li>Revisa tus estadísticas</li>
                    </ol>
                  </div>

                  <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800/50">
                    <h4 className="font-bold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
                       <div className="p-1.5 bg-blue-100 dark:bg-blue-800 rounded-lg">
                        <Settings size={16} className="text-blue-600 dark:text-blue-300" />
                      </div>
                      Privacidad
                    </h4>
                    <p className="text-sm text-blue-800 dark:text-blue-200/90 leading-relaxed">
                      Puedes usar la app sin cuenta (datos locales) o iniciar sesión con Google para sincronizar tus datos en la nube y acceder desde cualquier dispositivo.
                    </p>
                  </div>
                </div>
             </div>
          )}

           {activeTab === 'accounts' && (
             <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
              <div className="prose dark:prose-invert max-w-none">
                 <h3 className="text-xl font-semibold mb-2">Gestión de Cuentas</h3>
                 <p className="text-gray-500">Administra tus fuentes de dinero.</p>
              </div>
              
               <div className="border border-gray-100 dark:border-gray-700 rounded-xl p-0 overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-800/50 p-4 border-b border-gray-100 dark:border-gray-700">
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <GripVertical size={18} className="text-purple-500" />
                        Organización Drag & Drop
                     </h4>
                  </div>
                  <div className="p-4 space-y-3">
                     <p className="text-sm text-gray-600 dark:text-gray-400">
                        ¡Nuevo! Ahora puedes reordenar tus cuentas fácilmente según tu prioridad:
                     </p>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                           <span className="text-2xl">💻</span>
                           <div>
                              <strong className="block text-gray-900 dark:text-gray-100">En Computador</strong>
                              <span className="text-gray-500">Haz clic y arrastra desde el icono de las 3 líneas.</span>
                           </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                           <span className="text-2xl">📱</span>
                           <div>
                              <strong className="block text-gray-900 dark:text-gray-100">En Móvil</strong>
                              <span className="text-gray-500">Mantén presionado un momento y luego arrastra.</span>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
               
               {/* Grid para tipos de cuenta */}
               <div className="space-y-3">
                   <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider pl-1">Tipos Disponibles</h4>
                   <div className="grid gap-3">
                      <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-full text-emerald-600 dark:text-emerald-400">
                           <Wallet size={20} />
                        </div>
                        <div>
                           <p className="font-semibold text-gray-900 dark:text-gray-100">Ahorros / Débito</p>
                           <p className="text-sm text-gray-500">Cuentas estándar donde el dinero se descuenta inmediatamente.</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <div className="p-3 bg-rose-50 dark:bg-rose-900/20 rounded-full text-rose-600 dark:text-rose-400">
                           <CreditCard size={20} />
                        </div>
                        <div>
                           <p className="font-semibold text-gray-900 dark:text-gray-100">Tarjeta de Crédito</p>
                           <p className="text-sm text-gray-500">Maneja fechas de corte, cuotas y cupo disponible.</p>
                        </div>
                      </div>
                   </div>
               </div>
             </div>
           )}

           {activeTab === 'transactions' && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Transacciones</h3>
                    <p className="text-gray-600 dark:text-gray-400">El corazón de tu seguimiento financiero.</p>
                  </div>

                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                        <Edit2 size={18} className="text-gray-600 dark:text-gray-400" />
                        Edición Rápida
                     </h4>
                     <ul className="space-y-3">
                        <li className="flex gap-3 text-sm text-gray-600 dark:text-gray-300">
                           <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">1</span>
                           Haz clic en el icono del lápiz ✏️ en cualquier transacción.
                        </li>
                        <li className="flex gap-3 text-sm text-gray-600 dark:text-gray-300">
                           <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">2</span>
                           Edita el monto o la descripción directamente sin salir de la lista.
                        </li>
                        <li className="flex gap-3 text-sm text-gray-600 dark:text-gray-300">
                           <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">3</span>
                           Los cambios se guardan automáticamente al instante.
                        </li>
                     </ul>
                  </div>
              </div>
           )}

           {activeTab === 'features' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
               <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Utilitarios</h3>
               
               <div className="grid sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
                     <Eye className="w-8 h-8 text-purple-600 mb-3" />
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Modo Discreto</h4>
                     <p className="text-sm text-gray-500">¿Estás en un lugar público? Usa el botón de "Ojo" en las tarjetas superiores para ocultar tus saldos.</p>
                  </div>

                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
                     <Settings className="w-8 h-8 text-gray-600 mb-3" />
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Categorías</h4>
                     <p className="text-sm text-gray-500">Personaliza tus categorías desde la vista de Cuentas. Crea las que mejor se adapten a tu vida.</p>
                  </div>
               </div>
            </div>
           )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/80 shrink-0 flex items-center justify-center text-center">
          <p className="text-xs sm:text-sm text-gray-500 max-w-lg">
            MoneyTrack utiliza formato local colombiano: <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300">1.234.567,89</span>
          </p>
        </div>
      </div>
    </div>
  );
};
