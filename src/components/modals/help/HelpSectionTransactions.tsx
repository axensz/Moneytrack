import React from 'react';
import { Wallet, CreditCard, Settings, Edit2, Filter, ArrowRightLeft, Clock, CheckCircle, TrendingUp, TrendingDown, Calendar, Download } from 'lucide-react';

export const HelpSectionTransactions: React.FC = () => (
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
);
