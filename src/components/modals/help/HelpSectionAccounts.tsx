import React from 'react';
import { Wallet, CreditCard, Settings, GripVertical, Percent, DollarSign, Tag, Receipt } from 'lucide-react';

export const HelpSectionAccounts: React.FC = () => (
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
);
