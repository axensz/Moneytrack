import React from 'react';
import { BarChart3, TrendingUp, TrendingDown, CircleDollarSign } from 'lucide-react';

export const HelpSectionDebts: React.FC = () => (
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
);
