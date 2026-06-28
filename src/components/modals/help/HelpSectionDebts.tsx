import React from 'react';
import { BarChart3, TrendingUp, TrendingDown, CircleDollarSign } from 'lucide-react';

export const HelpSectionDebts: React.FC = () => (
  <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
      <div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Préstamos y Deudas</h3>
        <p className="text-muted-foreground">Controla quién te debe y a quién le debes.</p>
      </div>

      {/* Tipos de deuda — estado real: success = me deben, destructive = yo debo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
         <div className="p-4 rounded-xl border" style={{ background: 'var(--success-muted)', borderColor: 'var(--success)' }}>
            <div className="flex items-center gap-2 mb-2">
               <TrendingUp size={18} style={{ color: 'var(--success)' }} />
               <span className="font-semibold" style={{ color: 'var(--success-text)' }}>Me deben</span>
            </div>
            <p className="text-sm" style={{ color: 'var(--success-text)' }}>Dinero que prestaste a alguien. Se registra como gasto con categoría &quot;Préstamo&quot;.</p>
         </div>
         <div className="p-4 rounded-xl border" style={{ background: 'var(--destructive-muted)', borderColor: 'var(--destructive)' }}>
            <div className="flex items-center gap-2 mb-2">
               <TrendingDown size={18} style={{ color: 'var(--destructive)' }} />
               <span className="font-semibold" style={{ color: 'var(--destructive-text)' }}>Yo debo</span>
            </div>
            <p className="text-sm" style={{ color: 'var(--destructive-text)' }}>Dinero que alguien te prestó. Se registra como ingreso a tu cuenta.</p>
         </div>
      </div>

      {/* Crear préstamo — panel neutro */}
      <div className="border border-border rounded-xl overflow-hidden">
         <div className="bg-muted p-4 border-b border-border">
            <h4 className="font-semibold text-foreground">Registrar un Préstamo</h4>
         </div>
         <div className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">Campos del formulario:</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
               <div className="p-2 bg-muted rounded-lg">
                  <span className="font-medium text-foreground">Tipo:</span>
                  <span className="text-muted-foreground ml-1">Me deben / Yo debo</span>
               </div>
               <div className="p-2 bg-muted rounded-lg">
                  <span className="font-medium text-foreground">Persona:</span>
                  <span className="text-muted-foreground ml-1">Nombre</span>
               </div>
               <div className="p-2 bg-muted rounded-lg">
                  <span className="font-medium text-foreground">Monto:</span>
                  <span className="text-muted-foreground ml-1">Cantidad prestada</span>
               </div>
               <div className="p-2 bg-muted rounded-lg">
                  <span className="font-medium text-foreground">Cuenta:</span>
                  <span className="text-muted-foreground ml-1">Desde cuál cuenta</span>
               </div>
            </div>
            <p className="text-xs text-muted-foreground">
               Opcional: Descripción o motivo del préstamo.
            </p>
         </div>
      </div>

      {/* Cobros parciales — estado de cobro/saldado: success */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--success)' }}>
         <div className="p-4 border-b" style={{ background: 'var(--success-muted)', borderColor: 'var(--success)' }}>
            <h4 className="font-semibold flex items-center gap-2" style={{ color: 'var(--success-text)' }}>
               <CircleDollarSign size={18} style={{ color: 'var(--success)' }} />
               Registrar Pagos / Cobros
            </h4>
         </div>
         <div className="p-4 space-y-4">
            <p className="text-sm" style={{ color: 'var(--success-text)' }}>
               Cuando la persona te paga (o tú pagas tu deuda):
            </p>
            <div className="flex gap-3">
               <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'var(--success-muted)', color: 'var(--success)' }}>1</span>
               <div>
                  <p className="font-medium text-foreground">Abre la tarjeta del préstamo</p>
                  <p className="text-sm text-muted-foreground">Verás el monto original y el saldo pendiente.</p>
               </div>
            </div>
            <div className="flex gap-3">
               <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'var(--success-muted)', color: 'var(--success)' }}>2</span>
               <div>
                  <p className="font-medium text-foreground">Ingresa el monto del pago</p>
                  <p className="text-sm text-muted-foreground">Puede ser parcial o el total pendiente.</p>
               </div>
            </div>
            <div className="flex gap-3">
               <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'var(--success-muted)', color: 'var(--success)' }}>3</span>
               <div>
                  <p className="font-medium text-foreground">Se actualiza automáticamente</p>
                  <p className="text-sm text-muted-foreground">El saldo pendiente se reduce. Si llega a $0, se marca como saldado.</p>
               </div>
            </div>
         </div>
      </div>

      {/* Panel de estadísticas — panel neutro; el color marca el estado real (success/destructive) */}
      <div className="p-4 bg-muted rounded-xl border border-border">
         <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
            <BarChart3 size={16} className="text-muted-foreground" />
            Panel de Control
         </h4>
         <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
               <span style={{ color: 'var(--success)' }}>•</span>
               <span><strong style={{ color: 'var(--success-text)' }}>Me deben:</strong> Total pendiente de cobro</span>
            </li>
            <li className="flex items-start gap-2">
               <span style={{ color: 'var(--destructive)' }}>•</span>
               <span><strong style={{ color: 'var(--destructive-text)' }}>Debo:</strong> Total pendiente de pago</span>
            </li>
            <li className="flex items-start gap-2">
               <span className="text-muted-foreground">•</span>
               <span><strong className="text-foreground">Balance neto:</strong> Diferencia entre lo que te deben y lo que debes</span>
            </li>
            <li className="flex items-start gap-2">
               <span className="text-muted-foreground">•</span>
               <span><strong className="text-foreground">Saldados:</strong> Préstamos completamente pagados (se pueden mostrar/ocultar)</span>
            </li>
         </ul>
      </div>

      {/* Barra de progreso — panel neutro */}
      <div className="p-4 bg-muted rounded-xl border border-border">
         <h4 className="font-semibold text-foreground mb-2">Barra de Progreso</h4>
         <p className="text-sm text-muted-foreground">
            Cada préstamo muestra una barra visual del porcentaje pagado vs el monto original.
            Cuando el saldo llega a cero, el préstamo se marca automáticamente como saldado.
         </p>
      </div>
  </div>
);
