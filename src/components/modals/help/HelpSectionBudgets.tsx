import React from 'react';
import { BarChart3, PieChart, CheckCircle, AlertCircle } from 'lucide-react';

export const HelpSectionBudgets: React.FC = () => (
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
);
