import React from 'react';
import { BarChart3, PieChart, CheckCircle, AlertCircle } from 'lucide-react';

export const HelpSectionBudgets: React.FC = () => (
  <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
      <div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Presupuestos</h3>
        <p className="text-muted-foreground">Define límites de gasto mensuales por categoría.</p>
      </div>

      {/* Qué son — acento de marca */}
      <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-accent)' }}>
         <h4 className="font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--primary-text)' }}>
            <div className="p-1.5 rounded-lg" style={{ background: 'var(--card)', color: 'var(--primary)' }}>
               <PieChart size={16} />
            </div>
            ¿Cómo funcionan?
         </h4>
         <p className="text-sm" style={{ color: 'var(--primary-text)' }}>
            Un presupuesto establece un límite máximo de gasto mensual para una categoría específica.
            El sistema compara automáticamente tus gastos del mes actual contra el límite y te alerta cuando te acercas o lo superas.
         </p>
      </div>

      {/* Crear presupuesto — panel neutro */}
      <div className="border border-border rounded-xl overflow-hidden">
         <div className="bg-muted p-4 border-b border-border">
            <h4 className="font-semibold text-foreground">Crear un Presupuesto</h4>
         </div>
         <div className="p-4 space-y-3">
            <ol className="space-y-2 text-sm text-muted-foreground">
               <li className="flex gap-2"><span className="font-bold text-foreground">1.</span> Selecciona una categoría de gasto</li>
               <li className="flex gap-2"><span className="font-bold text-foreground">2.</span> Define el límite mensual en pesos</li>
               <li className="flex gap-2"><span className="font-bold text-foreground">3.</span> El sistema empieza a rastrear tus gastos automáticamente</li>
            </ol>
            <p className="text-xs text-muted-foreground">
               Solo puedes crear un presupuesto por categoría. Las categorías ya presupuestadas no aparecen en la lista.
            </p>
         </div>
      </div>

      {/* Estados — color = estado (verde / ámbar / rojo) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
         <div className="p-3 rounded-xl border text-center" style={{ background: 'var(--success-muted)', borderColor: 'var(--success)' }}>
            <CheckCircle size={24} className="mx-auto mb-1" style={{ color: 'var(--success)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--success-text)' }}>Normal</p>
            <p className="text-xs" style={{ color: 'var(--success-text)' }}>Gasto menor al 80%</p>
         </div>
         <div className="p-3 rounded-xl border text-center" style={{ background: 'var(--warning-muted)', borderColor: 'var(--warning)' }}>
            <AlertCircle size={24} className="mx-auto mb-1" style={{ color: 'var(--warning)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--warning-text)' }}>Advertencia</p>
            <p className="text-xs" style={{ color: 'var(--warning-text)' }}>Gasto entre 80% y 100%</p>
         </div>
         <div className="p-3 rounded-xl border text-center" style={{ background: 'var(--destructive-muted)', borderColor: 'var(--destructive)' }}>
            <AlertCircle size={24} className="mx-auto mb-1" style={{ color: 'var(--destructive)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--destructive-text)' }}>Excedido</p>
            <p className="text-xs" style={{ color: 'var(--destructive-text)' }}>Gasto mayor al 100%</p>
         </div>
      </div>

      {/* Barra de progreso — panel neutro */}
      <div className="border border-border rounded-xl overflow-hidden">
         <div className="bg-muted p-4 border-b border-border">
            <h4 className="font-semibold text-foreground">Indicadores Visuales</h4>
         </div>
         <div className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
               Cada presupuesto muestra:
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
               <li className="flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span><strong>Barra de progreso</strong> con color según el estado (verde → ámbar → rojo)</span>
               </li>
               <li className="flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span><strong>Gastado / Límite</strong> en formato de moneda</span>
               </li>
               <li className="flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span><strong>Porcentaje</strong> de uso del presupuesto</span>
               </li>
               <li className="flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span><strong>Restante</strong> o <strong>excedido</strong> según corresponda</span>
               </li>
            </ul>
         </div>
      </div>

      {/* Panel — resumen neutro (no es estado de info real) */}
      <div className="p-4 bg-muted rounded-xl border border-border">
         <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
            <BarChart3 size={16} className="text-muted-foreground" />
            Panel de Control
         </h4>
         <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
               <span className="text-muted-foreground">•</span>
               <span>Presupuestos activos y su estado general</span>
            </li>
            <li className="flex items-start gap-2">
               <span className="text-muted-foreground">•</span>
               <span>Total presupuestado vs total gastado del mes</span>
            </li>
            <li className="flex items-start gap-2">
               <span className="text-muted-foreground">•</span>
               <span>Cantidad de presupuestos excedidos y en advertencia</span>
            </li>
            <li className="flex items-start gap-2">
               <span className="text-muted-foreground">•</span>
               <span>Puedes activar/desactivar presupuestos sin eliminarlos</span>
            </li>
         </ul>
      </div>
  </div>
);
