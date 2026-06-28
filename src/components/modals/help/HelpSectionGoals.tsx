import React from 'react';
import { BarChart3, Calendar, Target, Plus } from 'lucide-react';

export const HelpSectionGoals: React.FC = () => (
  <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
      <div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Metas de Ahorro</h3>
        <p className="text-muted-foreground">Define objetivos financieros y haz seguimiento de tu progreso.</p>
      </div>

      {/* Qué son */}
      <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-accent)' }}>
         <h4 className="font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--primary-text)' }}>
            <div className="p-1.5 rounded-lg" style={{ background: 'var(--card)', color: 'var(--primary)' }}>
               <Target size={16} />
            </div>
            ¿Cómo funcionan?
         </h4>
         <p className="text-sm" style={{ color: 'var(--primary-text)' }}>
            Define un objetivo (ej: &quot;Vacaciones&quot;, &quot;Fondo de emergencia&quot;) con un monto meta y una fecha límite opcional.
            Luego ve aportando dinero gradualmente y el sistema te muestra el progreso.
         </p>
      </div>

      {/* Crear meta */}
      <div className="border border-border rounded-xl overflow-hidden">
         <div className="bg-muted p-4 border-b border-border">
            <h4 className="font-semibold text-foreground">Crear una Meta</h4>
         </div>
         <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
               <div className="p-2 bg-muted rounded-lg">
                  <span className="font-medium text-foreground">Nombre:</span>
                  <span className="text-muted-foreground ml-1">Vacaciones, Auto...</span>
               </div>
               <div className="p-2 bg-muted rounded-lg">
                  <span className="font-medium text-foreground">Objetivo:</span>
                  <span className="text-muted-foreground ml-1">Monto a alcanzar</span>
               </div>
               <div className="p-2 bg-muted rounded-lg col-span-2">
                  <span className="font-medium text-foreground">Fecha límite:</span>
                  <span className="text-muted-foreground ml-1">Opcional — si la pones, se calcula el ahorro mensual sugerido</span>
               </div>
            </div>
         </div>
      </div>

      {/* Aportar */}
      <div className="border rounded-xl overflow-hidden" style={{ borderColor: 'var(--success)' }}>
         <div className="p-4 border-b" style={{ background: 'var(--success-muted)', borderColor: 'var(--success)' }}>
            <h4 className="font-semibold flex items-center gap-2" style={{ color: 'var(--success-text)' }}>
               <Plus size={18} style={{ color: 'var(--success)' }} />
               Agregar Ahorro
            </h4>
         </div>
         <div className="p-4 space-y-3">
            <p className="text-sm" style={{ color: 'var(--success-text)' }}>
               En cada tarjeta de meta verás un formulario para aportar:
            </p>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--success-text)' }}>
               <li className="flex items-start gap-2">
                  <span style={{ color: 'var(--success)' }}>•</span>
                  <span>Ingresa el monto que quieres agregar al ahorro</span>
               </li>
               <li className="flex items-start gap-2">
                  <span style={{ color: 'var(--success)' }}>•</span>
                  <span>El progreso se actualiza al instante</span>
               </li>
               <li className="flex items-start gap-2">
                  <span style={{ color: 'var(--success)' }}>•</span>
                  <span>Al alcanzar el objetivo, la meta se marca como completada automáticamente</span>
               </li>
            </ul>
         </div>
      </div>

      {/* Ahorro sugerido */}
      <div className="border rounded-xl p-0 overflow-hidden" style={{ background: 'var(--warning-muted)', borderColor: 'var(--warning)' }}>
         <div className="p-4 border-b" style={{ background: 'var(--warning-muted)', borderColor: 'var(--warning)' }}>
            <h4 className="font-semibold flex items-center gap-2" style={{ color: 'var(--warning-text)' }}>
               <Calendar size={18} style={{ color: 'var(--warning)' }} />
               Ahorro Mensual Sugerido
            </h4>
         </div>
         <div className="p-4 space-y-3">
            <p className="text-sm" style={{ color: 'var(--warning-text)' }}>
               Si defines una fecha límite, el sistema calcula cuánto necesitas ahorrar cada mes:
            </p>
            <div className="p-3 rounded-lg text-sm font-mono text-center" style={{ background: 'var(--card)', color: 'var(--warning-text)' }}>
               sugerido = monto faltante ÷ meses restantes
            </div>
            <p className="text-xs" style={{ color: 'var(--warning-text)' }}>
               Si la fecha ya pasó y no se alcanzó la meta, se muestra como &quot;vencida&quot; con un indicador rojo.
            </p>
         </div>
      </div>

      {/* Panel */}
      <div className="p-4 rounded-xl border border-border bg-muted">
         <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
            <BarChart3 size={16} className="text-muted-foreground" />
            Panel de Control
         </h4>
         <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
               <span className="text-muted-foreground">•</span>
               <span>Metas activas con barra de progreso visual</span>
            </li>
            <li className="flex items-start gap-2">
               <span className="text-muted-foreground">•</span>
               <span>Total del objetivo vs total ahorrado</span>
            </li>
            <li className="flex items-start gap-2">
               <span className="text-muted-foreground">•</span>
               <span>Metas completadas (sección colapsable)</span>
            </li>
            <li className="flex items-start gap-2">
               <span className="text-muted-foreground">•</span>
               <span>Días restantes y ahorro sugerido por meta</span>
            </li>
         </ul>
      </div>
  </div>
);
