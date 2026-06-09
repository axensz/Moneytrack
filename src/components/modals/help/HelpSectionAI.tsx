import React from 'react';
import { CheckCircle, Bot, MessageSquare, Sparkles } from 'lucide-react';

export const HelpSectionAI: React.FC = () => (
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
);
