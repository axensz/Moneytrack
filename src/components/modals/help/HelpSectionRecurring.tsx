import React from 'react';
import { Repeat, BarChart3, Clock, CheckCircle, AlertCircle, Calendar } from 'lucide-react';

export const HelpSectionRecurring: React.FC = () => (
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
                  <span className="text-muted-foreground ml-1">Netflix, Arriendo...</span>
               </div>
               <div className="p-2 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                  <span className="font-medium text-gray-900 dark:text-gray-100">Monto:</span>
                  <span className="text-muted-foreground ml-1">Valor esperado</span>
               </div>
               <div className="p-2 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                  <span className="font-medium text-gray-900 dark:text-gray-100">Día:</span>
                  <span className="text-muted-foreground ml-1">Del 1 al 31</span>
               </div>
               <div className="p-2 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                  <span className="font-medium text-gray-900 dark:text-gray-100">Frecuencia:</span>
                  <span className="text-muted-foreground ml-1">Mensual/Anual</span>
               </div>
            </div>
            <p className="text-xs text-muted-foreground">
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
                  <p className="text-sm text-muted-foreground">Configura nombre, monto, día y frecuencia.</p>
               </div>
            </div>
            <div className="flex gap-3">
               <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">2</span>
               <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Recibe alertas de vencimiento</p>
                  <p className="text-sm text-muted-foreground">Verás los próximos a vencer en la parte superior.</p>
               </div>
            </div>
            <div className="flex gap-3">
               <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">3</span>
               <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Registra el pago</p>
                  <p className="text-sm text-muted-foreground">Crea un gasto y selecciona el pago periódico asociado.</p>
               </div>
            </div>
            <div className="flex gap-3">
               <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">4</span>
               <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Se marca automáticamente</p>
                  <p className="text-sm text-muted-foreground">El sistema detecta que ya pagaste este período.</p>
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
            <Clock size={24} className="mx-auto mb-1 text-muted-foreground" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Pendiente</p>
            <p className="text-xs text-muted-foreground">Aún no has pagado</p>
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
);
