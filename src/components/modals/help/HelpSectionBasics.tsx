import React from 'react';
import { Wallet, ArrowRightLeft, Repeat, Percent, Filter, PieChart, CheckCircle, Eye, Bot, Target, Download, HandCoins } from 'lucide-react';

export const HelpSectionBasics: React.FC = () => (
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
);
