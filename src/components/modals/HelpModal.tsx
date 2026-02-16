import React, { useState } from 'react';
import { Wallet, TrendingUp, CreditCard, Settings, GripVertical, Eye, Edit2, Repeat, Percent, Filter, BarChart3, DollarSign, ArrowRightLeft, Clock, CheckCircle, AlertCircle, PieChart, TrendingDown, Calendar, Bot, Tag, MessageSquare, Sparkles, HandCoins, Target, Download, FileSpreadsheet, CircleDollarSign, Users, Plus, Receipt } from 'lucide-react';
import { BaseModal } from './BaseModal';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'basics' | 'accounts' | 'transactions' | 'recurring' | 'debts' | 'budgets' | 'goals' | 'stats' | 'ai'>('basics');

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Manual de Usuario"
      titleIcon={<Wallet size={24} className="text-purple-600" />}
      maxWidth="max-w-3xl"
      className="h-[85vh] sm:h-[600px] flex flex-col"
    >
        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 shrink-0">
          <div className="flex gap-1 sm:gap-2 p-2 sm:p-3 overflow-x-auto no-scrollbar scroll-smooth">
            {[
              { id: 'basics', label: 'Inicio', shortLabel: 'Inicio', icon: null },
              { id: 'accounts', label: 'Cuentas', shortLabel: 'Cuentas', icon: Wallet },
              { id: 'transactions', label: 'Transacciones', shortLabel: 'Trans.', icon: TrendingUp },
              { id: 'recurring', label: 'Periódicos', shortLabel: 'Peri.', icon: Repeat },
              { id: 'debts', label: 'Préstamos', shortLabel: 'Prést.', icon: HandCoins },
              { id: 'budgets', label: 'Presupuestos', shortLabel: 'Presup.', icon: PieChart },
              { id: 'goals', label: 'Metas', shortLabel: 'Metas', icon: Target },
              { id: 'stats', label: 'Estadísticas', shortLabel: 'Stats', icon: BarChart3 },
              { id: 'ai', label: 'Asistente IA', shortLabel: 'IA', icon: Bot },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`
                  flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-purple-500
                  ${activeTab === tab.id
                    ? 'bg-white dark:bg-gray-700 text-purple-700 dark:text-purple-300 shadow-sm ring-1 ring-gray-200 dark:ring-gray-600'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-200 active:scale-[0.98]'
                  }
                `}
              >
                {tab.icon && <tab.icon size={14} className="sm:w-4 sm:h-4" />}
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
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
                    MoneyTrack es tu administrador financiero personal. Controla tus cuentas, registra transacciones, gestiona pagos recurrentes, define presupuestos, establece metas de ahorro, lleva el control de préstamos y visualiza estadísticas detalladas de tus finanzas.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-800/50">
                    <h4 className="font-bold text-purple-900 dark:text-purple-100 mb-3 flex items-center gap-2">
                      <div className="p-1.5 bg-purple-100 dark:bg-purple-800 rounded-lg">
                        <CheckCircle size={16} className="text-purple-600 dark:text-purple-300" />
                      </div>
                      Primeros Pasos
                    </h4>
                    <ol className="list-decimal list-inside space-y-2.5 text-sm text-purple-800 dark:text-purple-200/90 ml-1">
                      <li>Crea tu primera cuenta (ahorro, efectivo o TC)</li>
                      <li>Registra tu saldo inicial</li>
                      <li>Agrega tus primeras transacciones</li>
                      <li>Configura pagos periódicos (suscripciones)</li>
                      <li>Define presupuestos y metas de ahorro</li>
                      <li>Revisa tus estadísticas</li>
                    </ol>
                  </div>

                  <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800/50">
                    <h4 className="font-bold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
                       <div className="p-1.5 bg-blue-100 dark:bg-blue-800 rounded-lg">
                        <Eye size={16} className="text-blue-600 dark:text-blue-300" />
                      </div>
                      Privacidad y Datos
                    </h4>
                    <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200/90">
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 mt-1">•</span>
                        <span><strong>Sin cuenta:</strong> Datos guardados localmente en tu navegador</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 mt-1">•</span>
                        <span><strong>Con Google:</strong> Sincronización en la nube, accede desde cualquier dispositivo</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 mt-1">•</span>
                        <span><strong>Modo discreto:</strong> Oculta saldos con el botón del ojo</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Características principales */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-800/50 p-4 border-b border-gray-200 dark:border-gray-700">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">Características Principales</h4>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-0">
                    <div className="p-4 border-b sm:border-r border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <Wallet size={16} className="text-emerald-600" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Múltiples Cuentas</span>
                      </div>
                      <p className="text-sm text-gray-500">Ahorros, efectivo y tarjetas de crédito con cupo y fechas de corte.</p>
                    </div>
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <ArrowRightLeft size={16} className="text-blue-600" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Transferencias</span>
                      </div>
                      <p className="text-sm text-gray-500">Mueve dinero entre cuentas manteniendo el balance correcto.</p>
                    </div>
                    <div className="p-4 border-b sm:border-r border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <Repeat size={16} className="text-purple-600" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Pagos Periódicos</span>
                      </div>
                      <p className="text-sm text-gray-500">Gestiona suscripciones y servicios con alertas de vencimiento.</p>
                    </div>
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <Percent size={16} className="text-amber-600" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Intereses TC</span>
                      </div>
                      <p className="text-sm text-gray-500">Calcula intereses automáticamente en compras a cuotas.</p>
                    </div>
                    <div className="p-4 sm:border-r border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <PieChart size={16} className="text-rose-600" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Estadísticas</span>
                      </div>
                      <p className="text-sm text-gray-500">Gráficos de flujo de caja, categorías y tendencias.</p>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Filter size={16} className="text-gray-600" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Filtros Avanzados</span>
                      </div>
                      <p className="text-sm text-gray-500">Por cuenta, categoría, estado y rango de fechas.</p>
                    </div>
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <HandCoins size={16} className="text-teal-600" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Préstamos</span>
                      </div>
                      <p className="text-sm text-gray-500">Controla quién te debe y a quién le debes, con pagos parciales.</p>
                    </div>
                    <div className="p-4 border-t sm:border-r border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <PieChart size={16} className="text-orange-600" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Presupuestos</span>
                      </div>
                      <p className="text-sm text-gray-500">Límites de gasto mensuales por categoría con alertas.</p>
                    </div>
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <Target size={16} className="text-cyan-600" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Metas de Ahorro</span>
                      </div>
                      <p className="text-sm text-gray-500">Objetivos financieros con progreso y ahorro sugerido.</p>
                    </div>
                    <div className="p-4 border-t sm:border-r border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <Bot size={16} className="text-indigo-600" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Asistente IA</span>
                      </div>
                      <p className="text-sm text-gray-500">Chat inteligente que analiza y ejecuta acciones sobre tus finanzas.</p>
                    </div>
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <Download size={16} className="text-gray-600" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Exportar CSV</span>
                      </div>
                      <p className="text-sm text-gray-500">Descarga tus transacciones para Excel o Google Sheets.</p>
                    </div>
                  </div>
                </div>
             </div>
          )}

           {activeTab === 'accounts' && (
             <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
              <div className="prose dark:prose-invert max-w-none">
                 <h3 className="text-xl font-semibold mb-2">Gestión de Cuentas</h3>
                 <p className="text-gray-500">Administra todas tus fuentes de dinero en un solo lugar.</p>
              </div>

               {/* Tipos de cuenta */}
               <div className="space-y-3">
                   <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider pl-1">Tipos de Cuenta</h4>
                   <div className="grid gap-3">
                      <div className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-full text-emerald-600 dark:text-emerald-400 shrink-0">
                           <Wallet size={20} />
                        </div>
                        <div>
                           <p className="font-semibold text-gray-900 dark:text-gray-100">Ahorros / Débito</p>
                           <p className="text-sm text-gray-500 mb-2">Cuentas bancarias donde el dinero se descuenta inmediatamente.</p>
                           <p className="text-xs text-gray-400">Campos: Nombre, saldo inicial</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-full text-blue-600 dark:text-blue-400 shrink-0">
                           <DollarSign size={20} />
                        </div>
                        <div>
                           <p className="font-semibold text-gray-900 dark:text-gray-100">Efectivo</p>
                           <p className="text-sm text-gray-500 mb-2">Dinero físico que manejas fuera del banco.</p>
                           <p className="text-xs text-gray-400">Campos: Nombre, saldo inicial</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <div className="p-3 bg-rose-50 dark:bg-rose-900/20 rounded-full text-rose-600 dark:text-rose-400 shrink-0">
                           <CreditCard size={20} />
                        </div>
                        <div>
                           <p className="font-semibold text-gray-900 dark:text-gray-100">Tarjeta de Crédito</p>
                           <p className="text-sm text-gray-500 mb-2">Maneja cupo, fechas de corte/pago y calcula intereses por cuotas.</p>
                           <p className="text-xs text-gray-400">Campos: Cupo, día corte, día pago, tasa E.A., cuenta asociada</p>
                        </div>
                      </div>
                   </div>
               </div>
              
               {/* Drag & Drop */}
               <div className="border border-gray-100 dark:border-gray-700 rounded-xl p-0 overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-800/50 p-4 border-b border-gray-100 dark:border-gray-700">
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <GripVertical size={18} className="text-purple-500" />
                        Organización con Drag & Drop
                     </h4>
                  </div>
                  <div className="p-4 space-y-3">
                     <p className="text-sm text-gray-600 dark:text-gray-400">
                        Reordena tus cuentas arrastrándolas según tu prioridad:
                     </p>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                           <div className="p-2 bg-gray-200 dark:bg-gray-700 rounded-lg">
                             <Settings size={16} className="text-gray-600 dark:text-gray-400" />
                           </div>
                           <div>
                              <strong className="block text-gray-900 dark:text-gray-100">Computador</strong>
                              <span className="text-gray-500">Clic y arrastra desde el icono de las 3 líneas.</span>
                           </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                           <div className="p-2 bg-gray-200 dark:bg-gray-700 rounded-lg">
                             <Wallet size={16} className="text-gray-600 dark:text-gray-400" />
                           </div>
                           <div>
                              <strong className="block text-gray-900 dark:text-gray-100">Móvil</strong>
                              <span className="text-gray-500">Mantén presionado un momento y luego arrastra.</span>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Tasa de Interés */}
               <div className="border border-amber-200 dark:border-amber-800 rounded-xl p-0 overflow-hidden bg-amber-50/50 dark:bg-amber-900/10">
                  <div className="bg-amber-100 dark:bg-amber-900/30 p-4 border-b border-amber-200 dark:border-amber-800">
                     <h4 className="font-semibold text-amber-900 dark:text-amber-100 flex items-center gap-2">
                        <Percent size={18} className="text-amber-600 dark:text-amber-400" />
                        Tasa de Interés E.A. (Tarjetas de Crédito)
                     </h4>
                  </div>
                  <div className="p-4 space-y-3">
                     <p className="text-sm text-amber-800 dark:text-amber-200">
                        Configura la tasa efectiva anual de tus tarjetas para:
                     </p>
                     <ul className="space-y-2 text-sm text-amber-700 dark:text-amber-300">
                        <li className="flex items-start gap-2">
                           <span className="text-amber-500">•</span>
                           <span>Calcular intereses automáticamente en compras a cuotas (1, 3, 6, 12, 24, 36 meses)</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-amber-500">•</span>
                           <span>Ver resumen de intereses pagados y pendientes en Estadísticas</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-amber-500">•</span>
                           <span>La tasa se guarda con cada compra (snapshot histórico)</span>
                        </li>
                     </ul>
                  </div>
               </div>

               {/* Categorías */}
               <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-200 dark:border-blue-800">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                     <Tag size={16} />
                     Gestión de Categorías
                  </h4>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                     Administra tus categorías de ingresos y gastos desde el menú de configuración
                     (icono de engranaje en la esquina superior). Allí encontrarás la opción "Categorías"
                     para crear nuevas o eliminar las que no uses.
                  </p>
               </div>

               {/* Cuenta predeterminada */}
               <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Cuenta Predeterminada</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                     Marca una cuenta como predeterminada y se seleccionará automáticamente al crear nuevas transacciones.
                     Usa el menú de opciones (...) en cada tarjeta de cuenta.
                  </p>
               </div>

               {/* Estado de Cuenta TC */}
               <div className="border border-rose-200 dark:border-rose-800 rounded-xl overflow-hidden">
                  <div className="bg-rose-50 dark:bg-rose-900/20 p-4 border-b border-rose-200 dark:border-rose-800">
                     <h4 className="font-semibold text-rose-900 dark:text-rose-100 flex items-center gap-2">
                        <Receipt size={18} className="text-rose-600 dark:text-rose-400" />
                        Estado de Cuenta — Tarjetas de Crédito
                     </h4>
                  </div>
                  <div className="p-4 space-y-3">
                     <p className="text-sm text-rose-800 dark:text-rose-200">
                        Para cada tarjeta de crédito con día de corte y día de pago configurados, se muestra automáticamente un estado de cuenta:
                     </p>
                     <ul className="space-y-2 text-sm text-rose-700 dark:text-rose-300">
                        <li className="flex items-start gap-2">
                           <span className="text-rose-500">•</span>
                           <span><strong>Ciclo de facturación:</strong> período entre cortes calculado automáticamente</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-rose-500">•</span>
                           <span><strong>Cargos del período:</strong> total de gastos en el ciclo actual</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-rose-500">•</span>
                           <span><strong>Pagos realizados:</strong> abonos registrados en el período</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-rose-500">•</span>
                           <span><strong>Fecha de pago:</strong> con indicador de urgencia (próximo a vencer o vencido)</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-rose-500">•</span>
                           <span><strong>Transacciones:</strong> lista expandible de movimientos del ciclo</span>
                        </li>
                     </ul>
                     <p className="text-xs text-rose-600 dark:text-rose-400">
                        El estado de cuenta aparece debajo de tus cuentas, en la pestaña de Cuentas. Solo se muestra para tarjetas con día de corte y pago configurados.
                     </p>
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

                  {/* Tipos de transacción */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                     <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
                        <div className="flex items-center gap-2 mb-2">
                           <TrendingUp size={18} className="text-emerald-600" />
                           <span className="font-semibold text-emerald-900 dark:text-emerald-100">Ingreso</span>
                        </div>
                        <p className="text-sm text-emerald-700 dark:text-emerald-300">Dinero que entra (salario, ventas, etc.)</p>
                     </div>
                     <div className="p-4 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-800">
                        <div className="flex items-center gap-2 mb-2">
                           <TrendingDown size={18} className="text-rose-600" />
                           <span className="font-semibold text-rose-900 dark:text-rose-100">Gasto</span>
                        </div>
                        <p className="text-sm text-rose-700 dark:text-rose-300">Dinero que sale (compras, servicios, etc.)</p>
                     </div>
                     <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-2 mb-2">
                           <ArrowRightLeft size={18} className="text-blue-600" />
                           <span className="font-semibold text-blue-900 dark:text-blue-100">Transferencia</span>
                        </div>
                        <p className="text-sm text-blue-700 dark:text-blue-300">Mover dinero entre tus cuentas</p>
                     </div>
                  </div>

                  {/* Crear transacción */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                     <div className="bg-gray-50 dark:bg-gray-800/50 p-4 border-b border-gray-200 dark:border-gray-700">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100">Crear una Transacción</h4>
                     </div>
                     <div className="p-4 space-y-3">
                        <ol className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                           <li className="flex gap-2"><span className="font-bold text-purple-600">1.</span> Clic en el botón + o "Nueva Transacción"</li>
                           <li className="flex gap-2"><span className="font-bold text-purple-600">2.</span> Selecciona el tipo (Ingreso, Gasto, Transferencia)</li>
                           <li className="flex gap-2"><span className="font-bold text-purple-600">3.</span> Ingresa el monto (acepta: 1000, 1.000, 1,000)</li>
                           <li className="flex gap-2"><span className="font-bold text-purple-600">4.</span> Selecciona categoría, cuenta y fecha</li>
                           <li className="flex gap-2"><span className="font-bold text-purple-600">5.</span> La descripción es opcional (si la omites, se muestra la categoría)</li>
                           <li className="flex gap-2"><span className="font-bold text-purple-600">6.</span> Marca como "Pagado" si ya se realizó</li>
                        </ol>
                     </div>
                  </div>

                  {/* Compras con TC */}
                  <div className="border border-amber-200 dark:border-amber-800 rounded-xl p-0 overflow-hidden bg-amber-50/50 dark:bg-amber-900/10">
                     <div className="bg-amber-100 dark:bg-amber-900/30 p-4 border-b border-amber-200 dark:border-amber-800">
                        <h4 className="font-semibold text-amber-900 dark:text-amber-100 flex items-center gap-2">
                           <CreditCard size={18} className="text-amber-600 dark:text-amber-400" />
                           Compras con Tarjeta de Crédito
                        </h4>
                     </div>
                     <div className="p-4 space-y-3">
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                           Cuando gastas desde una TC con tasa configurada:
                        </p>
                        <ul className="space-y-2 text-sm text-amber-700 dark:text-amber-300">
                           <li className="flex items-start gap-2">
                              <span className="text-amber-500">•</span>
                              <span>Activa "Compra con intereses"</span>
                           </li>
                           <li className="flex items-start gap-2">
                              <span className="text-amber-500">•</span>
                              <span>Selecciona cuotas: 1, 3, 6, 12, 24 o 36 meses</span>
                           </li>
                           <li className="flex items-start gap-2">
                              <span className="text-amber-500">•</span>
                              <span>El sistema calcula intereses con la fórmula de interés compuesto</span>
                           </li>
                        </ul>
                     </div>
                  </div>

                  {/* Edición Rápida */}
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                        <Edit2 size={18} className="text-gray-600 dark:text-gray-400" />
                        Edición Rápida
                     </h4>
                     <ul className="space-y-3">
                        <li className="flex gap-3 text-sm text-gray-600 dark:text-gray-300">
                           <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center text-xs font-bold">1</span>
                           Clic en el icono del lápiz en cualquier transacción
                        </li>
                        <li className="flex gap-3 text-sm text-gray-600 dark:text-gray-300">
                           <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center text-xs font-bold">2</span>
                           Edita monto, descripción, categoría y fecha directamente en la lista
                        </li>
                        <li className="flex gap-3 text-sm text-gray-600 dark:text-gray-300">
                           <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center text-xs font-bold">3</span>
                           Los cambios se guardan al confirmar con el botón de guardar
                        </li>
                     </ul>
                  </div>

                  {/* Filtros */}
                  <div className="border border-blue-200 dark:border-blue-800 rounded-xl p-0 overflow-hidden">
                     <div className="bg-blue-50 dark:bg-blue-900/20 p-4 border-b border-blue-200 dark:border-blue-800">
                        <h4 className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                           <Filter size={18} className="text-blue-600 dark:text-blue-400" />
                           Filtros Disponibles
                        </h4>
                     </div>
                     <div className="p-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                           <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-700 dark:text-blue-300 text-center">
                              <Calendar size={14} className="inline mr-1" /> Fecha
                           </div>
                           <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-700 dark:text-blue-300 text-center">
                              <Wallet size={14} className="inline mr-1" /> Cuenta
                           </div>
                           <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-700 dark:text-blue-300 text-center">
                              <Settings size={14} className="inline mr-1" /> Categoría
                           </div>
                           <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-700 dark:text-blue-300 text-center">
                              <CheckCircle size={14} className="inline mr-1" /> Estado
                           </div>
                        </div>
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-3">
                           Presets de fecha: Hoy, Esta semana, Este mes, Mes anterior, Este año, Año anterior, o rango personalizado.
                        </p>
                     </div>
                  </div>

                  {/* Estado de pago */}
                  <div className="grid grid-cols-2 gap-4">
                     <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-200 dark:border-emerald-800">
                        <h4 className="font-semibold text-emerald-900 dark:text-emerald-100 mb-2 flex items-center gap-2">
                           <CheckCircle size={16} /> Pagado
                        </h4>
                        <p className="text-sm text-emerald-700 dark:text-emerald-300">
                           El dinero ya salió o entró de la cuenta. Afecta el saldo actual.
                        </p>
                     </div>
                     <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-800">
                        <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-2 flex items-center gap-2">
                           <Clock size={16} /> Pendiente
                        </h4>
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                           Programado pero aún no ejecutado. Aparece en "Gastos pendientes".
                        </p>
                     </div>
                  </div>

                  {/* Exportar CSV */}
                  <div className="border border-emerald-200 dark:border-emerald-800 rounded-xl overflow-hidden">
                     <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 border-b border-emerald-200 dark:border-emerald-800">
                        <h4 className="font-semibold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                           <Download size={18} className="text-emerald-600 dark:text-emerald-400" />
                           Exportar a CSV / Excel
                        </h4>
                     </div>
                     <div className="p-4 space-y-3">
                        <p className="text-sm text-emerald-800 dark:text-emerald-200">
                           Descarga tus transacciones como archivo CSV para abrir en Excel o Google Sheets:
                        </p>
                        <ul className="space-y-2 text-sm text-emerald-700 dark:text-emerald-300">
                           <li className="flex items-start gap-2">
                              <span className="text-emerald-500">•</span>
                              <span>Busca el botón de descarga junto al conteo de transacciones</span>
                           </li>
                           <li className="flex items-start gap-2">
                              <span className="text-emerald-500">•</span>
                              <span>Se exportan las transacciones filtradas (aplica los filtros activos)</span>
                           </li>
                           <li className="flex items-start gap-2">
                              <span className="text-emerald-500">•</span>
                              <span>Incluye: fecha, tipo, categoría, descripción, monto, cuenta y estado</span>
                           </li>
                           <li className="flex items-start gap-2">
                              <span className="text-emerald-500">•</span>
                              <span>Compatible con Excel (codificación UTF-8 con acentos)</span>
                           </li>
                        </ul>
                     </div>
                  </div>
              </div>
           )}

           {/* Pagos Periódicos */}
           {activeTab === 'recurring' && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Pagos Periódicos</h3>
                    <p className="text-gray-600 dark:text-gray-400">Gestiona suscripciones, servicios y pagos recurrentes.</p>
                  </div>

                  {/* Qué son */}
                  <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-200 dark:border-purple-800">
                     <h4 className="font-bold text-purple-900 dark:text-purple-100 mb-3 flex items-center gap-2">
                        <Repeat size={18} className="text-purple-600" />
                        ¿Qué son los Pagos Periódicos?
                     </h4>
                     <p className="text-sm text-purple-800 dark:text-purple-200 mb-3">
                        Son pagos que realizas regularmente: Netflix, Spotify, arriendo, servicios públicos, seguros, gimnasio, etc.
                        MoneyTrack te ayuda a recordarlos y llevar el control de cuáles ya pagaste cada mes.
                     </p>
                     <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-700 dark:text-purple-300 text-center">
                           <Calendar size={14} className="inline mr-1" /> Mensuales
                        </div>
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-700 dark:text-purple-300 text-center">
                           <Calendar size={14} className="inline mr-1" /> Anuales
                        </div>
                     </div>
                  </div>

                  {/* Crear pago periódico */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                     <div className="bg-gray-50 dark:bg-gray-800/50 p-4 border-b border-gray-200 dark:border-gray-700">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100">Crear un Pago Periódico</h4>
                     </div>
                     <div className="p-4 space-y-3">
                        <p className="text-sm text-gray-600 dark:text-gray-400">Campos a configurar:</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                           <div className="p-2 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                              <span className="font-medium text-gray-900 dark:text-gray-100">Nombre:</span>
                              <span className="text-gray-500 ml-1">Netflix, Arriendo...</span>
                           </div>
                           <div className="p-2 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                              <span className="font-medium text-gray-900 dark:text-gray-100">Monto:</span>
                              <span className="text-gray-500 ml-1">Valor esperado</span>
                           </div>
                           <div className="p-2 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                              <span className="font-medium text-gray-900 dark:text-gray-100">Día:</span>
                              <span className="text-gray-500 ml-1">Del 1 al 31</span>
                           </div>
                           <div className="p-2 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                              <span className="font-medium text-gray-900 dark:text-gray-100">Frecuencia:</span>
                              <span className="text-gray-500 ml-1">Mensual/Anual</span>
                           </div>
                        </div>
                        <p className="text-xs text-gray-500">
                           Opcional: Categoría, cuenta preferida y notas adicionales.
                        </p>
                     </div>
                  </div>

                  {/* Cómo funciona */}
                  <div className="border border-emerald-200 dark:border-emerald-800 rounded-xl overflow-hidden">
                     <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 border-b border-emerald-200 dark:border-emerald-800">
                        <h4 className="font-semibold text-emerald-900 dark:text-emerald-100">Flujo de Trabajo</h4>
                     </div>
                     <div className="p-4 space-y-4">
                        <div className="flex gap-3">
                           <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">1</span>
                           <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">Crea el pago periódico</p>
                              <p className="text-sm text-gray-500">Configura nombre, monto, día y frecuencia.</p>
                           </div>
                        </div>
                        <div className="flex gap-3">
                           <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">2</span>
                           <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">Recibe alertas de vencimiento</p>
                              <p className="text-sm text-gray-500">Verás los próximos a vencer en la parte superior.</p>
                           </div>
                        </div>
                        <div className="flex gap-3">
                           <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">3</span>
                           <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">Registra el pago</p>
                              <p className="text-sm text-gray-500">Crea un gasto y selecciona el pago periódico asociado.</p>
                           </div>
                        </div>
                        <div className="flex gap-3">
                           <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">4</span>
                           <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">Se marca automáticamente</p>
                              <p className="text-sm text-gray-500">El sistema detecta que ya pagaste este período.</p>
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Estados */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                     <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800 text-center">
                        <CheckCircle size={24} className="mx-auto mb-1 text-emerald-600" />
                        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Pagado</p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">Ya pagaste este mes</p>
                     </div>
                     <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 text-center">
                        <AlertCircle size={24} className="mx-auto mb-1 text-amber-600" />
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Próximo</p>
                        <p className="text-xs text-amber-600 dark:text-amber-400">Vence en 7 días o menos</p>
                     </div>
                     <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-center">
                        <Clock size={24} className="mx-auto mb-1 text-gray-500" />
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Pendiente</p>
                        <p className="text-xs text-gray-500">Aún no has pagado</p>
                     </div>
                  </div>

                  {/* Panel de estadísticas */}
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-200 dark:border-blue-800">
                     <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                        <BarChart3 size={16} />
                        Panel de Control
                     </h4>
                     <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                        <li className="flex items-start gap-2">
                           <span className="text-blue-500">•</span>
                           <span>Total mensual esperado de todos tus pagos periódicos</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-blue-500">•</span>
                           <span>Conteo de pagados vs pendientes del mes</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-blue-500">•</span>
                           <span>Historial de pagos por cada suscripción</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-blue-500">•</span>
                           <span>Sección de pagos inactivos (pausados temporalmente)</span>
                        </li>
                     </ul>
                  </div>
              </div>
           )}

           {/* Préstamos / Deudas */}
           {activeTab === 'debts' && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Préstamos y Deudas</h3>
                    <p className="text-gray-600 dark:text-gray-400">Controla quién te debe y a quién le debes.</p>
                  </div>

                  {/* Tipos de deuda */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                     <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
                        <div className="flex items-center gap-2 mb-2">
                           <TrendingUp size={18} className="text-emerald-600" />
                           <span className="font-semibold text-emerald-900 dark:text-emerald-100">Me deben</span>
                        </div>
                        <p className="text-sm text-emerald-700 dark:text-emerald-300">Dinero que prestaste a alguien. Se registra como gasto con categoría &quot;Préstamo&quot;.</p>
                     </div>
                     <div className="p-4 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-800">
                        <div className="flex items-center gap-2 mb-2">
                           <TrendingDown size={18} className="text-rose-600" />
                           <span className="font-semibold text-rose-900 dark:text-rose-100">Yo debo</span>
                        </div>
                        <p className="text-sm text-rose-700 dark:text-rose-300">Dinero que alguien te prestó. Se registra como ingreso a tu cuenta.</p>
                     </div>
                  </div>

                  {/* Crear préstamo */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                     <div className="bg-gray-50 dark:bg-gray-800/50 p-4 border-b border-gray-200 dark:border-gray-700">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100">Registrar un Préstamo</h4>
                     </div>
                     <div className="p-4 space-y-3">
                        <p className="text-sm text-gray-600 dark:text-gray-400">Campos del formulario:</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                           <div className="p-2 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                              <span className="font-medium text-gray-900 dark:text-gray-100">Tipo:</span>
                              <span className="text-gray-500 ml-1">Me deben / Yo debo</span>
                           </div>
                           <div className="p-2 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                              <span className="font-medium text-gray-900 dark:text-gray-100">Persona:</span>
                              <span className="text-gray-500 ml-1">Nombre</span>
                           </div>
                           <div className="p-2 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                              <span className="font-medium text-gray-900 dark:text-gray-100">Monto:</span>
                              <span className="text-gray-500 ml-1">Cantidad prestada</span>
                           </div>
                           <div className="p-2 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                              <span className="font-medium text-gray-900 dark:text-gray-100">Cuenta:</span>
                              <span className="text-gray-500 ml-1">Desde cuál cuenta</span>
                           </div>
                        </div>
                        <p className="text-xs text-gray-500">
                           Opcional: Descripción o motivo del préstamo.
                        </p>
                     </div>
                  </div>

                  {/* Cobros parciales */}
                  <div className="border border-emerald-200 dark:border-emerald-800 rounded-xl overflow-hidden">
                     <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 border-b border-emerald-200 dark:border-emerald-800">
                        <h4 className="font-semibold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                           <CircleDollarSign size={18} className="text-emerald-600" />
                           Registrar Pagos / Cobros
                        </h4>
                     </div>
                     <div className="p-4 space-y-4">
                        <p className="text-sm text-emerald-800 dark:text-emerald-200">
                           Cuando la persona te paga (o tú pagas tu deuda):
                        </p>
                        <div className="flex gap-3">
                           <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">1</span>
                           <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">Abre la tarjeta del préstamo</p>
                              <p className="text-sm text-gray-500">Verás el monto original y el saldo pendiente.</p>
                           </div>
                        </div>
                        <div className="flex gap-3">
                           <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">2</span>
                           <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">Ingresa el monto del pago</p>
                              <p className="text-sm text-gray-500">Puede ser parcial o el total pendiente.</p>
                           </div>
                        </div>
                        <div className="flex gap-3">
                           <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">3</span>
                           <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">Se actualiza automáticamente</p>
                              <p className="text-sm text-gray-500">El saldo pendiente se reduce. Si llega a $0, se marca como saldado.</p>
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Panel de estadísticas */}
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-200 dark:border-blue-800">
                     <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                        <BarChart3 size={16} />
                        Panel de Control
                     </h4>
                     <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                        <li className="flex items-start gap-2">
                           <span className="text-blue-500">•</span>
                           <span><strong>Me deben:</strong> Total pendiente de cobro</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-blue-500">•</span>
                           <span><strong>Debo:</strong> Total pendiente de pago</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-blue-500">•</span>
                           <span><strong>Balance neto:</strong> Diferencia entre lo que te deben y lo que debes</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-blue-500">•</span>
                           <span><strong>Saldados:</strong> Préstamos completamente pagados (se pueden mostrar/ocultar)</span>
                        </li>
                     </ul>
                  </div>

                  {/* Barra de progreso */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Barra de Progreso</h4>
                     <p className="text-sm text-gray-600 dark:text-gray-400">
                        Cada préstamo muestra una barra visual del porcentaje pagado vs el monto original.
                        Cuando el saldo llega a cero, el préstamo se marca automáticamente como saldado.
                     </p>
                  </div>
              </div>
           )}

           {/* Presupuestos */}
           {activeTab === 'budgets' && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Presupuestos</h3>
                    <p className="text-gray-600 dark:text-gray-400">Define límites de gasto mensuales por categoría.</p>
                  </div>

                  {/* Qué son */}
                  <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-200 dark:border-purple-800">
                     <h4 className="font-bold text-purple-900 dark:text-purple-100 mb-3 flex items-center gap-2">
                        <div className="p-1.5 bg-purple-100 dark:bg-purple-800 rounded-lg">
                           <PieChart size={16} className="text-purple-600 dark:text-purple-300" />
                        </div>
                        ¿Cómo funcionan?
                     </h4>
                     <p className="text-sm text-purple-800 dark:text-purple-200">
                        Un presupuesto establece un límite máximo de gasto mensual para una categoría específica.
                        El sistema compara automáticamente tus gastos del mes actual contra el límite y te alerta cuando te acercas o lo superas.
                     </p>
                  </div>

                  {/* Crear presupuesto */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                     <div className="bg-gray-50 dark:bg-gray-800/50 p-4 border-b border-gray-200 dark:border-gray-700">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100">Crear un Presupuesto</h4>
                     </div>
                     <div className="p-4 space-y-3">
                        <ol className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                           <li className="flex gap-2"><span className="font-bold text-purple-600">1.</span> Selecciona una categoría de gasto</li>
                           <li className="flex gap-2"><span className="font-bold text-purple-600">2.</span> Define el límite mensual en pesos</li>
                           <li className="flex gap-2"><span className="font-bold text-purple-600">3.</span> El sistema empieza a rastrear tus gastos automáticamente</li>
                        </ol>
                        <p className="text-xs text-gray-500">
                           Solo puedes crear un presupuesto por categoría. Las categorías ya presupuestadas no aparecen en la lista.
                        </p>
                     </div>
                  </div>

                  {/* Estados */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                     <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800 text-center">
                        <CheckCircle size={24} className="mx-auto mb-1 text-emerald-600" />
                        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Normal</p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">Gasto menor al 80%</p>
                     </div>
                     <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 text-center">
                        <AlertCircle size={24} className="mx-auto mb-1 text-amber-600" />
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Advertencia</p>
                        <p className="text-xs text-amber-600 dark:text-amber-400">Gasto entre 80% y 100%</p>
                     </div>
                     <div className="p-3 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-800 text-center">
                        <AlertCircle size={24} className="mx-auto mb-1 text-rose-600" />
                        <p className="text-sm font-medium text-rose-700 dark:text-rose-300">Excedido</p>
                        <p className="text-xs text-rose-600 dark:text-rose-400">Gasto mayor al 100%</p>
                     </div>
                  </div>

                  {/* Barra de progreso */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                     <div className="bg-gray-50 dark:bg-gray-800/50 p-4 border-b border-gray-200 dark:border-gray-700">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100">Indicadores Visuales</h4>
                     </div>
                     <div className="p-4 space-y-3">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                           Cada presupuesto muestra:
                        </p>
                        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                           <li className="flex items-start gap-2">
                              <span className="text-gray-500">•</span>
                              <span><strong>Barra de progreso</strong> con color según el estado (verde → ámbar → rojo)</span>
                           </li>
                           <li className="flex items-start gap-2">
                              <span className="text-gray-500">•</span>
                              <span><strong>Gastado / Límite</strong> en formato de moneda</span>
                           </li>
                           <li className="flex items-start gap-2">
                              <span className="text-gray-500">•</span>
                              <span><strong>Porcentaje</strong> de uso del presupuesto</span>
                           </li>
                           <li className="flex items-start gap-2">
                              <span className="text-gray-500">•</span>
                              <span><strong>Restante</strong> o <strong>excedido</strong> según corresponda</span>
                           </li>
                        </ul>
                     </div>
                  </div>

                  {/* Panel */}
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-200 dark:border-blue-800">
                     <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                        <BarChart3 size={16} />
                        Panel de Control
                     </h4>
                     <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                        <li className="flex items-start gap-2">
                           <span className="text-blue-500">•</span>
                           <span>Presupuestos activos y su estado general</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-blue-500">•</span>
                           <span>Total presupuestado vs total gastado del mes</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-blue-500">•</span>
                           <span>Cantidad de presupuestos excedidos y en advertencia</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-blue-500">•</span>
                           <span>Puedes activar/desactivar presupuestos sin eliminarlos</span>
                        </li>
                     </ul>
                  </div>
              </div>
           )}

           {/* Metas de Ahorro */}
           {activeTab === 'goals' && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Metas de Ahorro</h3>
                    <p className="text-gray-600 dark:text-gray-400">Define objetivos financieros y haz seguimiento de tu progreso.</p>
                  </div>

                  {/* Qué son */}
                  <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-200 dark:border-purple-800">
                     <h4 className="font-bold text-purple-900 dark:text-purple-100 mb-3 flex items-center gap-2">
                        <div className="p-1.5 bg-purple-100 dark:bg-purple-800 rounded-lg">
                           <Target size={16} className="text-purple-600 dark:text-purple-300" />
                        </div>
                        ¿Cómo funcionan?
                     </h4>
                     <p className="text-sm text-purple-800 dark:text-purple-200">
                        Define un objetivo (ej: &quot;Vacaciones&quot;, &quot;Fondo de emergencia&quot;) con un monto meta y una fecha límite opcional.
                        Luego ve aportando dinero gradualmente y el sistema te muestra el progreso.
                     </p>
                  </div>

                  {/* Crear meta */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                     <div className="bg-gray-50 dark:bg-gray-800/50 p-4 border-b border-gray-200 dark:border-gray-700">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100">Crear una Meta</h4>
                     </div>
                     <div className="p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                           <div className="p-2 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                              <span className="font-medium text-gray-900 dark:text-gray-100">Nombre:</span>
                              <span className="text-gray-500 ml-1">Vacaciones, Auto...</span>
                           </div>
                           <div className="p-2 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                              <span className="font-medium text-gray-900 dark:text-gray-100">Objetivo:</span>
                              <span className="text-gray-500 ml-1">Monto a alcanzar</span>
                           </div>
                           <div className="p-2 bg-gray-50 dark:bg-gray-900/30 rounded-lg col-span-2">
                              <span className="font-medium text-gray-900 dark:text-gray-100">Fecha límite:</span>
                              <span className="text-gray-500 ml-1">Opcional — si la pones, se calcula el ahorro mensual sugerido</span>
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Aportar */}
                  <div className="border border-emerald-200 dark:border-emerald-800 rounded-xl overflow-hidden">
                     <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 border-b border-emerald-200 dark:border-emerald-800">
                        <h4 className="font-semibold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                           <Plus size={18} className="text-emerald-600" />
                           Agregar Ahorro
                        </h4>
                     </div>
                     <div className="p-4 space-y-3">
                        <p className="text-sm text-emerald-800 dark:text-emerald-200">
                           En cada tarjeta de meta verás un formulario para aportar:
                        </p>
                        <ul className="space-y-2 text-sm text-emerald-700 dark:text-emerald-300">
                           <li className="flex items-start gap-2">
                              <span className="text-emerald-500">•</span>
                              <span>Ingresa el monto que quieres agregar al ahorro</span>
                           </li>
                           <li className="flex items-start gap-2">
                              <span className="text-emerald-500">•</span>
                              <span>El progreso se actualiza al instante</span>
                           </li>
                           <li className="flex items-start gap-2">
                              <span className="text-emerald-500">•</span>
                              <span>Al alcanzar el objetivo, la meta se marca como completada automáticamente</span>
                           </li>
                        </ul>
                     </div>
                  </div>

                  {/* Ahorro sugerido */}
                  <div className="border border-amber-200 dark:border-amber-800 rounded-xl p-0 overflow-hidden bg-amber-50/50 dark:bg-amber-900/10">
                     <div className="bg-amber-100 dark:bg-amber-900/30 p-4 border-b border-amber-200 dark:border-amber-800">
                        <h4 className="font-semibold text-amber-900 dark:text-amber-100 flex items-center gap-2">
                           <Calendar size={18} className="text-amber-600 dark:text-amber-400" />
                           Ahorro Mensual Sugerido
                        </h4>
                     </div>
                     <div className="p-4 space-y-3">
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                           Si defines una fecha límite, el sistema calcula cuánto necesitas ahorrar cada mes:
                        </p>
                        <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-sm text-amber-700 dark:text-amber-300 font-mono text-center">
                           sugerido = monto faltante ÷ meses restantes
                        </div>
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                           Si la fecha ya pasó y no se alcanzó la meta, se muestra como &quot;vencida&quot; con un indicador rojo.
                        </p>
                     </div>
                  </div>

                  {/* Panel */}
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-200 dark:border-blue-800">
                     <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                        <BarChart3 size={16} />
                        Panel de Control
                     </h4>
                     <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                        <li className="flex items-start gap-2">
                           <span className="text-blue-500">•</span>
                           <span>Metas activas con barra de progreso visual</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-blue-500">•</span>
                           <span>Total del objetivo vs total ahorrado</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-blue-500">•</span>
                           <span>Metas completadas (sección colapsable)</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-blue-500">•</span>
                           <span>Días restantes y ahorro sugerido por meta</span>
                        </li>
                     </ul>
                  </div>
              </div>
           )}

           {/* Estadísticas */}
           {activeTab === 'stats' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
               <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Estadísticas</h3>
                  <p className="text-gray-600 dark:text-gray-400">Visualiza y analiza el comportamiento de tus finanzas.</p>
               </div>
               
               {/* Gráficos disponibles */}
               <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider pl-1">Gráficos Disponibles</h4>
                  <div className="grid gap-3">
                     <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <div className="flex items-center gap-3 mb-2">
                           <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                              <BarChart3 size={18} className="text-blue-600" />
                           </div>
                           <div>
                              <h5 className="font-semibold text-gray-900 dark:text-gray-100">Flujo de Caja Mensual</h5>
                           </div>
                        </div>
                        <p className="text-sm text-gray-500 ml-11">
                           Barras comparativas de ingresos vs gastos por mes. Incluye línea de tendencia del balance neto. Muestra los últimos 6 meses.
                        </p>
                     </div>

                     <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <div className="flex items-center gap-3 mb-2">
                           <div className="p-2 bg-rose-50 dark:bg-rose-900/20 rounded-lg">
                              <PieChart size={18} className="text-rose-600" />
                           </div>
                           <div>
                              <h5 className="font-semibold text-gray-900 dark:text-gray-100">Distribución por Categoría</h5>
                           </div>
                        </div>
                        <p className="text-sm text-gray-500 ml-11">
                           Gráfico circular que muestra en qué categorías gastas más. Incluye porcentajes y leyenda detallada.
                        </p>
                     </div>

                     <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <div className="flex items-center gap-3 mb-2">
                           <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                              <TrendingUp size={18} className="text-purple-600" />
                           </div>
                           <div>
                              <h5 className="font-semibold text-gray-900 dark:text-gray-100">Comparativa Mensual</h5>
                           </div>
                        </div>
                        <p className="text-sm text-gray-500 ml-11">
                           Compara el mes actual con el anterior. Muestra cambios porcentuales en ingresos, gastos y balance.
                        </p>
                     </div>

                     <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <div className="flex items-center gap-3 mb-2">
                           <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                              <TrendingUp size={18} className="text-emerald-600" />
                           </div>
                           <div>
                              <h5 className="font-semibold text-gray-900 dark:text-gray-100">Tendencia Anual</h5>
                           </div>
                        </div>
                        <p className="text-sm text-gray-500 ml-11">
                           Gráfico de área con la evolución año a año. Útil para ver el crecimiento o decrecimiento financiero a largo plazo.
                        </p>
                     </div>
                  </div>
               </div>

               {/* Tarjeta de intereses */}
               <div className="border border-amber-200 dark:border-amber-800 rounded-xl p-0 overflow-hidden bg-amber-50/50 dark:bg-amber-900/10">
                  <div className="bg-amber-100 dark:bg-amber-900/30 p-4 border-b border-amber-200 dark:border-amber-800">
                     <h4 className="font-semibold text-amber-900 dark:text-amber-100 flex items-center gap-2">
                        <Percent size={18} className="text-amber-600 dark:text-amber-400" />
                        Tarjeta de Intereses de TC
                     </h4>
                  </div>
                  <div className="p-4 space-y-3">
                     <p className="text-sm text-amber-800 dark:text-amber-200">
                        Si tienes tarjetas de crédito con tasa E.A. configurada y compras a cuotas, verás:
                     </p>
                     <ul className="space-y-2 text-sm text-amber-700 dark:text-amber-300">
                        <li className="flex items-start gap-2">
                           <span className="text-amber-500">•</span>
                           <span>Total de intereses generados por tus compras</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-amber-500">•</span>
                           <span>Desglose por tarjeta de crédito</span>
                        </li>
                        <li className="flex items-start gap-2">
                           <span className="text-amber-500">•</span>
                           <span>Intereses pagados vs pendientes</span>
                        </li>
                     </ul>
                     <p className="text-xs text-amber-600 dark:text-amber-400">
                        Esta tarjeta solo aparece si tienes compras con intereses registradas.
                     </p>
                  </div>
               </div>

               {/* Filtros en estadísticas */}
               <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-200 dark:border-blue-800">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                     <Filter size={16} />
                     Filtros Aplicados
                  </h4>
                  <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                     Los filtros que apliques en la vista de Transacciones también afectan las estadísticas:
                  </p>
                  <ul className="space-y-1 text-sm text-blue-700 dark:text-blue-300">
                     <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        <span>Filtra por cuenta para ver estadísticas solo de esa cuenta</span>
                     </li>
                     <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        <span>Filtra por categoría para analizar un tipo específico de gasto</span>
                     </li>
                     <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        <span>Usa rangos de fecha para comparar períodos específicos</span>
                     </li>
                  </ul>
               </div>

               {/* Funciones adicionales */}
               <div className="grid sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                     <Eye className="w-8 h-8 text-purple-600 mb-3" />
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Modo Discreto</h4>
                     <p className="text-sm text-gray-500">Usa el botón del ojo en las tarjetas superiores para ocultar los saldos cuando estés en público.</p>
                  </div>

                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                     <Settings className="w-8 h-8 text-gray-600 mb-3" />
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Tema Claro/Oscuro</h4>
                     <p className="text-sm text-gray-500">Cambia entre tema claro y oscuro desde el botón en la esquina superior. Se adapta a tu preferencia del sistema.</p>
                  </div>
               </div>
            </div>
           )}

           {/* Asistente IA */}
           {activeTab === 'ai' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
               <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Asistente IA</h3>
                  <p className="text-gray-600 dark:text-gray-400">Tu asistente financiero personal potenciado por inteligencia artificial.</p>
               </div>

               {/* Cómo acceder */}
               <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-200 dark:border-purple-800">
                  <h4 className="font-bold text-purple-900 dark:text-purple-100 mb-3 flex items-center gap-2">
                     <div className="p-1.5 bg-purple-100 dark:bg-purple-800 rounded-lg">
                        <Bot size={16} className="text-purple-600 dark:text-purple-300" />
                     </div>
                     ¿Cómo usarlo?
                  </h4>
                  <p className="text-sm text-purple-800 dark:text-purple-200 mb-3">
                     Busca el botón flotante con el ícono de chat en la esquina inferior derecha. 
                     Al abrirlo, podrás conversar con el asistente sobre tus finanzas. Solo está disponible cuando inicias sesión.
                  </p>
               </div>

               {/* Consultas */}
               <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-800/50 p-4 border-b border-gray-200 dark:border-gray-700">
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <MessageSquare size={18} className="text-blue-600" />
                        Consultas que puedes hacer
                     </h4>
                  </div>
                  <div className="p-4 space-y-3">
                     <p className="text-sm text-gray-600 dark:text-gray-400">
                        El asistente conoce tus cuentas, transacciones y estadísticas. Puedes preguntarle:
                     </p>
                     <div className="grid gap-2 text-sm">
                        <div className="p-2.5 bg-gray-50 dark:bg-gray-900/30 rounded-lg text-gray-700 dark:text-gray-300">
                           💬 <em>"¿Cómo voy este mes?"</em> — Resumen de ingresos vs gastos
                        </div>
                        <div className="p-2.5 bg-gray-50 dark:bg-gray-900/30 rounded-lg text-gray-700 dark:text-gray-300">
                           💬 <em>"¿En qué gasto más?"</em> — Análisis de categorías
                        </div>
                        <div className="p-2.5 bg-gray-50 dark:bg-gray-900/30 rounded-lg text-gray-700 dark:text-gray-300">
                           💬 <em>"¿Cuánto debo en tarjetas de crédito?"</em> — Deuda TC
                        </div>
                        <div className="p-2.5 bg-gray-50 dark:bg-gray-900/30 rounded-lg text-gray-700 dark:text-gray-300">
                           💬 <em>"Dame consejos para ahorrar"</em> — Recomendaciones personalizadas
                        </div>
                     </div>
                  </div>
               </div>

               {/* Acciones */}
               <div className="border border-emerald-200 dark:border-emerald-800 rounded-xl overflow-hidden">
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 border-b border-emerald-200 dark:border-emerald-800">
                     <h4 className="font-semibold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                        <Sparkles size={18} className="text-emerald-600 dark:text-emerald-400" />
                        Acciones desde el chat
                     </h4>
                  </div>
                  <div className="p-4 space-y-4">
                     <p className="text-sm text-emerald-800 dark:text-emerald-200">
                        Además de consultar, el asistente puede realizar acciones en tu cuenta:
                     </p>
                     <div className="space-y-3">
                        <div className="flex gap-3">
                           <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">+</span>
                           <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">Agregar transacciones</p>
                              <p className="text-sm text-gray-500">Escribe: <em>"Gasté 35mil en almuerzo"</em> y lo registra por ti.</p>
                           </div>
                        </div>
                        <div className="flex gap-3">
                           <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">↻</span>
                           <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">Recategorizar transacciones</p>
                              <p className="text-sm text-gray-500">Pídele: <em>"Recategoriza mis transacciones de comida"</em></p>
                           </div>
                        </div>
                        <div className="flex gap-3">
                           <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">📋</span>
                           <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">Recategorización masiva</p>
                              <p className="text-sm text-gray-500">Puede recategorizar varias transacciones a la vez automáticamente.</p>
                           </div>
                        </div>
                        <div className="flex gap-3">
                           <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">🏷️</span>
                           <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">Crear categorías</p>
                              <p className="text-sm text-gray-500">Si una recategorización necesita una categoría nueva, la crea automáticamente.</p>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Confirmación */}
               <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-800">
                  <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-2 flex items-center gap-2">
                     <CheckCircle size={16} className="text-amber-600" />
                     Confirmación de acciones
                  </h4>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                     Todas las acciones propuestas por el asistente requieren tu confirmación antes de ejecutarse.
                     Verás una tarjeta con los detalles de la acción y botones para confirmar o rechazar.
                  </p>
               </div>

               {/* Token usage */}
               <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Uso de tokens</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                     Al pasar el cursor sobre el ícono del bot en cada respuesta, verás el uso de tokens 
                     (una medida del procesamiento utilizado por la IA). Esto es solo informativo.
                  </p>
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
    </BaseModal>
  );
};
