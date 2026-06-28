import React from 'react';
import { Wallet, CreditCard, Settings, GripVertical, Percent, DollarSign, Tag, Receipt } from 'lucide-react';

export const HelpSectionAccounts: React.FC = () => (
  <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
   <div className="prose dark:prose-invert max-w-none">
      <h3 className="text-xl font-semibold text-foreground mb-2">Gestión de Cuentas</h3>
      <p className="text-muted-foreground">Administra todas tus fuentes de dinero en un solo lugar.</p>
   </div>

    {/* Tipos de cuenta — tarjetas neutras; el TIPO lo marca el icono, no el color. */}
    <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider pl-1">Tipos de Cuenta</h4>
        <div className="grid gap-3">
           <div className="flex items-start gap-4 p-4 rounded-xl border border-border bg-card">
             <div className="p-3 bg-muted rounded-full text-muted-foreground shrink-0">
                <Wallet size={20} />
             </div>
             <div>
                <p className="font-semibold text-foreground">Ahorros / Débito</p>
                <p className="text-sm text-muted-foreground mb-2">Cuentas bancarias donde el dinero se descuenta inmediatamente.</p>
                <p className="text-xs text-muted-foreground">Campos: Nombre, saldo inicial</p>
             </div>
           </div>

           <div className="flex items-start gap-4 p-4 rounded-xl border border-border bg-card">
             <div className="p-3 bg-muted rounded-full text-muted-foreground shrink-0">
                <DollarSign size={20} />
             </div>
             <div>
                <p className="font-semibold text-foreground">Efectivo</p>
                <p className="text-sm text-muted-foreground mb-2">Dinero físico que manejas fuera del banco.</p>
                <p className="text-xs text-muted-foreground">Campos: Nombre, saldo inicial</p>
             </div>
           </div>

           <div className="flex items-start gap-4 p-4 rounded-xl border border-border bg-card">
             <div className="p-3 bg-muted rounded-full text-muted-foreground shrink-0">
                <CreditCard size={20} />
             </div>
             <div>
                <p className="font-semibold text-foreground">Tarjeta de Crédito</p>
                <p className="text-sm text-muted-foreground mb-2">Maneja cupo, fechas de corte/pago y calcula intereses por cuotas.</p>
                <p className="text-xs text-muted-foreground">Campos: Cupo, día corte, día pago, tasa E.A., cuenta asociada</p>
             </div>
           </div>
        </div>
    </div>

    {/* Drag & Drop — panel neutro (sin acento de marca decorativo). */}
    <div className="border border-border rounded-xl p-0 overflow-hidden">
       <div className="bg-muted p-4 border-b border-border">
          <h4 className="font-semibold text-foreground flex items-center gap-2">
             <GripVertical size={18} className="text-muted-foreground" />
             Organización con Drag & Drop
          </h4>
       </div>
       <div className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
             Reordena tus cuentas arrastrándolas según tu prioridad:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
             <div className="flex items-start gap-3 p-3 rounded-lg bg-muted">
                <div className="p-2 bg-card rounded-lg">
                  <Settings size={16} className="text-muted-foreground" />
                </div>
                <div>
                   <strong className="block text-foreground">Computador</strong>
                   <span className="text-muted-foreground">Clic y arrastra desde el icono de las 3 líneas.</span>
                </div>
             </div>
             <div className="flex items-start gap-3 p-3 rounded-lg bg-muted">
                <div className="p-2 bg-card rounded-lg">
                  <Wallet size={16} className="text-muted-foreground" />
                </div>
                <div>
                   <strong className="block text-foreground">Móvil</strong>
                   <span className="text-muted-foreground">Mantén presionado un momento y luego arrastra.</span>
                </div>
             </div>
          </div>
       </div>
    </div>

    {/* Tasa de Interés — estado de advertencia (warning). */}
    <div className="border rounded-xl p-0 overflow-hidden" style={{ background: 'var(--warning-muted)', borderColor: 'var(--warning)' }}>
       <div className="p-4 border-b" style={{ borderColor: 'var(--warning)' }}>
          <h4 className="font-semibold flex items-center gap-2" style={{ color: 'var(--warning-text)' }}>
             <Percent size={18} style={{ color: 'var(--warning)' }} />
             Tasa de Interés E.A. (Tarjetas de Crédito)
          </h4>
       </div>
       <div className="p-4 space-y-3">
          <p className="text-sm" style={{ color: 'var(--warning-text)' }}>
             Configura la tasa efectiva anual de tus tarjetas para:
          </p>
          <ul className="space-y-2 text-sm" style={{ color: 'var(--warning-text)' }}>
             <li className="flex items-start gap-2">
                <span style={{ color: 'var(--warning)' }}>•</span>
                <span>Calcular intereses automáticamente en compras a cuotas (1, 3, 6, 12, 24, 36 meses)</span>
             </li>
             <li className="flex items-start gap-2">
                <span style={{ color: 'var(--warning)' }}>•</span>
                <span>Ver resumen de intereses pagados y pendientes en Estadísticas</span>
             </li>
             <li className="flex items-start gap-2">
                <span style={{ color: 'var(--warning)' }}>•</span>
                <span>La tasa se guarda con cada compra (snapshot histórico)</span>
             </li>
          </ul>
       </div>
    </div>

    {/* Categorías — panel informativo genérico, neutralizado (sin azul-info decorativo). */}
    <div className="p-4 bg-muted rounded-xl border border-border">
       <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
          <Tag size={16} className="text-muted-foreground" />
          Gestión de Categorías
       </h4>
       <p className="text-sm text-muted-foreground">
          Administra tus categorías de ingresos y gastos desde el menú de configuración
          (icono de engranaje en la esquina superior). Allí encontrarás la opción "Categorías"
          para crear nuevas o eliminar las que no uses.
       </p>
    </div>

    {/* Cuenta predeterminada — panel neutro. */}
    <div className="p-4 bg-muted rounded-xl border border-border">
       <h4 className="font-semibold text-foreground mb-2">Cuenta Predeterminada</h4>
       <p className="text-sm text-muted-foreground">
          Marca una cuenta como predeterminada y se seleccionará automáticamente al crear nuevas transacciones.
          Usa el menú de opciones (...) en cada tarjeta de cuenta.
       </p>
    </div>

    {/* Estado de Cuenta TC — estado de deuda/vencimiento (destructive). */}
    <div className="border rounded-xl overflow-hidden" style={{ borderColor: 'var(--destructive)' }}>
       <div className="p-4 border-b" style={{ background: 'var(--destructive-muted)', borderColor: 'var(--destructive)' }}>
          <h4 className="font-semibold flex items-center gap-2" style={{ color: 'var(--destructive-text)' }}>
             <Receipt size={18} style={{ color: 'var(--destructive)' }} />
             Estado de Cuenta — Tarjetas de Crédito
          </h4>
       </div>
       <div className="p-4 space-y-3">
          <p className="text-sm" style={{ color: 'var(--destructive-text)' }}>
             Para cada tarjeta de crédito con día de corte y día de pago configurados, se muestra automáticamente un estado de cuenta:
          </p>
          <ul className="space-y-2 text-sm" style={{ color: 'var(--destructive-text)' }}>
             <li className="flex items-start gap-2">
                <span style={{ color: 'var(--destructive)' }}>•</span>
                <span><strong>Ciclo de facturación:</strong> período entre cortes calculado automáticamente</span>
             </li>
             <li className="flex items-start gap-2">
                <span style={{ color: 'var(--destructive)' }}>•</span>
                <span><strong>Cargos del período:</strong> total de gastos en el ciclo actual</span>
             </li>
             <li className="flex items-start gap-2">
                <span style={{ color: 'var(--destructive)' }}>•</span>
                <span><strong>Pagos realizados:</strong> abonos registrados en el período</span>
             </li>
             <li className="flex items-start gap-2">
                <span style={{ color: 'var(--destructive)' }}>•</span>
                <span><strong>Fecha de pago:</strong> con indicador de urgencia (próximo a vencer o vencido)</span>
             </li>
             <li className="flex items-start gap-2">
                <span style={{ color: 'var(--destructive)' }}>•</span>
                <span><strong>Transacciones:</strong> lista expandible de movimientos del ciclo</span>
             </li>
          </ul>
          <p className="text-xs" style={{ color: 'var(--destructive-text)' }}>
             El estado de cuenta aparece debajo de tus cuentas, en la pestaña de Cuentas. Solo se muestra para tarjetas con día de corte y pago configurados.
          </p>
       </div>
    </div>
  </div>
);
