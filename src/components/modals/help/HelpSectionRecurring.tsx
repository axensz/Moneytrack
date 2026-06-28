import React from 'react';
import { Repeat, BarChart3, Clock, CheckCircle, AlertCircle, Calendar } from 'lucide-react';

export const HelpSectionRecurring: React.FC = () => (
  <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
      <div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Pagos Periódicos</h3>
        <p className="text-muted-foreground">Gestiona suscripciones, servicios y pagos recurrentes.</p>
      </div>

      {/* Qué son */}
      <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-accent)' }}>
         <h4 className="font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--primary-text)' }}>
            <Repeat size={18} style={{ color: 'var(--primary)' }} />
            ¿Qué son los Pagos Periódicos?
         </h4>
         <p className="text-sm mb-3" style={{ color: 'var(--primary-text)' }}>
            Son pagos que realizas regularmente: Netflix, Spotify, arriendo, servicios públicos, seguros, gimnasio, etc.
            MoneyTrack te ayuda a recordarlos y llevar el control de cuáles ya pagaste cada mes.
         </p>
         <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-lg text-center" style={{ background: 'var(--card)', color: 'var(--primary-text)' }}>
               <Calendar size={14} className="inline mr-1" /> Mensuales
            </div>
            <div className="p-2 rounded-lg text-center" style={{ background: 'var(--card)', color: 'var(--primary-text)' }}>
               <Calendar size={14} className="inline mr-1" /> Anuales
            </div>
         </div>
      </div>

      {/* Crear pago periódico */}
      <div className="border border-border rounded-xl overflow-hidden">
         <div className="bg-muted p-4 border-b border-border">
            <h4 className="font-semibold text-foreground">Crear un Pago Periódico</h4>
         </div>
         <div className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">Campos a configurar:</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
               <div className="p-2 bg-muted rounded-lg">
                  <span className="font-medium text-foreground">Nombre:</span>
                  <span className="text-muted-foreground ml-1">Netflix, Arriendo...</span>
               </div>
               <div className="p-2 bg-muted rounded-lg">
                  <span className="font-medium text-foreground">Monto:</span>
                  <span className="text-muted-foreground ml-1">Valor esperado</span>
               </div>
               <div className="p-2 bg-muted rounded-lg">
                  <span className="font-medium text-foreground">Día:</span>
                  <span className="text-muted-foreground ml-1">Del 1 al 31</span>
               </div>
               <div className="p-2 bg-muted rounded-lg">
                  <span className="font-medium text-foreground">Frecuencia:</span>
                  <span className="text-muted-foreground ml-1">Mensual/Anual</span>
               </div>
            </div>
            <p className="text-xs text-muted-foreground">
               Opcional: Categoría, cuenta preferida y notas adicionales.
            </p>
         </div>
      </div>

      {/* Cómo funciona */}
      <div className="border border-border rounded-xl overflow-hidden">
         <div className="bg-muted p-4 border-b border-border">
            <h4 className="font-semibold text-foreground">Flujo de Trabajo</h4>
         </div>
         <div className="p-4 space-y-4">
            <div className="flex gap-3">
               <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'var(--surface-primary)', color: 'var(--primary-text)' }}>1</span>
               <div>
                  <p className="font-medium text-foreground">Crea el pago periódico</p>
                  <p className="text-sm text-muted-foreground">Configura nombre, monto, día y frecuencia.</p>
               </div>
            </div>
            <div className="flex gap-3">
               <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'var(--surface-primary)', color: 'var(--primary-text)' }}>2</span>
               <div>
                  <p className="font-medium text-foreground">Recibe alertas de vencimiento</p>
                  <p className="text-sm text-muted-foreground">Verás los próximos a vencer en la parte superior.</p>
               </div>
            </div>
            <div className="flex gap-3">
               <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'var(--surface-primary)', color: 'var(--primary-text)' }}>3</span>
               <div>
                  <p className="font-medium text-foreground">Registra el pago</p>
                  <p className="text-sm text-muted-foreground">Crea un gasto y selecciona el pago periódico asociado.</p>
               </div>
            </div>
            <div className="flex gap-3">
               <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'var(--surface-primary)', color: 'var(--primary-text)' }}>4</span>
               <div>
                  <p className="font-medium text-foreground">Se marca automáticamente</p>
                  <p className="text-sm text-muted-foreground">El sistema detecta que ya pagaste este período.</p>
               </div>
            </div>
         </div>
      </div>

      {/* Estados */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
         <div className="p-3 rounded-xl border text-center" style={{ background: 'var(--success-muted)', borderColor: 'var(--success)' }}>
            <CheckCircle size={24} className="mx-auto mb-1" style={{ color: 'var(--success)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--success-text)' }}>Pagado</p>
            <p className="text-xs" style={{ color: 'var(--success-text)' }}>Ya pagaste este mes</p>
         </div>
         <div className="p-3 rounded-xl border text-center" style={{ background: 'var(--warning-muted)', borderColor: 'var(--warning)' }}>
            <AlertCircle size={24} className="mx-auto mb-1" style={{ color: 'var(--warning)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--warning-text)' }}>Próximo</p>
            <p className="text-xs" style={{ color: 'var(--warning-text)' }}>Vence en 7 días o menos</p>
         </div>
         <div className="p-3 bg-muted rounded-xl border border-border text-center">
            <Clock size={24} className="mx-auto mb-1 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Pendiente</p>
            <p className="text-xs text-muted-foreground">Aún no has pagado</p>
         </div>
      </div>

      {/* Panel de estadísticas */}
      <div className="p-4 bg-muted rounded-xl border border-border">
         <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
            <BarChart3 size={16} />
            Panel de Control
         </h4>
         <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
               <span className="text-muted-foreground">•</span>
               <span>Total mensual esperado de todos tus pagos periódicos</span>
            </li>
            <li className="flex items-start gap-2">
               <span className="text-muted-foreground">•</span>
               <span>Conteo de pagados vs pendientes del mes</span>
            </li>
            <li className="flex items-start gap-2">
               <span className="text-muted-foreground">•</span>
               <span>Historial de pagos por cada suscripción</span>
            </li>
            <li className="flex items-start gap-2">
               <span className="text-muted-foreground">•</span>
               <span>Sección de pagos inactivos (pausados temporalmente)</span>
            </li>
         </ul>
      </div>
  </div>
);
