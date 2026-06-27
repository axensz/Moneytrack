import React from 'react';
import { BarChart3, Calendar, Target, Plus } from 'lucide-react';

export const HelpSectionGoals: React.FC = () => (
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
                  <span className="text-muted-foreground ml-1">Vacaciones, Auto...</span>
               </div>
               <div className="p-2 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                  <span className="font-medium text-gray-900 dark:text-gray-100">Objetivo:</span>
                  <span className="text-muted-foreground ml-1">Monto a alcanzar</span>
               </div>
               <div className="p-2 bg-gray-50 dark:bg-gray-900/30 rounded-lg col-span-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">Fecha límite:</span>
                  <span className="text-muted-foreground ml-1">Opcional — si la pones, se calcula el ahorro mensual sugerido</span>
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
);
