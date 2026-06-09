import React from 'react';
import { Settings, Percent, Filter, BarChart3, PieChart, TrendingUp, Eye } from 'lucide-react';

export const HelpSectionStats: React.FC = () => (
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
);
