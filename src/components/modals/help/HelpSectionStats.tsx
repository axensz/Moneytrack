import React from 'react';
import { Settings, Percent, Filter, BarChart3, PieChart, TrendingUp, Eye } from 'lucide-react';

export const HelpSectionStats: React.FC = () => (
  <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
     <div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Estadísticas</h3>
        <p className="text-muted-foreground">Visualiza y analiza el comportamiento de tus finanzas.</p>
     </div>

     {/* Gráficos disponibles — iconos en un solo tono neutro (los colores reales
         de cada gráfico viven en chartConfig, no en estos marcadores del manual). */}
     <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider pl-1">Gráficos Disponibles</h4>
        <div className="grid gap-3">
           <div className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-3 mb-2">
                 <div className="p-2 bg-muted rounded-lg">
                    <BarChart3 size={18} className="text-muted-foreground" />
                 </div>
                 <div>
                    <h5 className="font-semibold text-foreground">Flujo de Caja Mensual</h5>
                 </div>
              </div>
              <p className="text-sm text-muted-foreground ml-11">
                 Barras comparativas de ingresos vs gastos por mes. Incluye línea de tendencia del balance neto. Muestra los últimos 6 meses.
              </p>
           </div>

           <div className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-3 mb-2">
                 <div className="p-2 bg-muted rounded-lg">
                    <PieChart size={18} className="text-muted-foreground" />
                 </div>
                 <div>
                    <h5 className="font-semibold text-foreground">Distribución por Categoría</h5>
                 </div>
              </div>
              <p className="text-sm text-muted-foreground ml-11">
                 Gráfico circular que muestra en qué categorías gastas más. Incluye porcentajes y leyenda detallada.
              </p>
           </div>

           <div className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-3 mb-2">
                 <div className="p-2 bg-muted rounded-lg">
                    <TrendingUp size={18} className="text-muted-foreground" />
                 </div>
                 <div>
                    <h5 className="font-semibold text-foreground">Comparativa Mensual</h5>
                 </div>
              </div>
              <p className="text-sm text-muted-foreground ml-11">
                 Compara el mes actual con el anterior. Muestra cambios porcentuales en ingresos, gastos y balance.
              </p>
           </div>

           <div className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-3 mb-2">
                 <div className="p-2 bg-muted rounded-lg">
                    <TrendingUp size={18} className="text-muted-foreground" />
                 </div>
                 <div>
                    <h5 className="font-semibold text-foreground">Tendencia Anual</h5>
                 </div>
              </div>
              <p className="text-sm text-muted-foreground ml-11">
                 Gráfico de área con la evolución año a año. Útil para ver el crecimiento o decrecimiento financiero a largo plazo.
              </p>
           </div>
        </div>
     </div>

     {/* Tarjeta de intereses — estado de advertencia (ámbar = intereses). */}
     <div className="border rounded-xl p-0 overflow-hidden" style={{ background: 'var(--warning-muted)', borderColor: 'var(--warning)' }}>
        <div className="p-4 border-b" style={{ background: 'var(--warning-muted)', borderColor: 'var(--warning)' }}>
           <h4 className="font-semibold flex items-center gap-2" style={{ color: 'var(--warning-text)' }}>
              <Percent size={18} style={{ color: 'var(--warning)' }} />
              Tarjeta de Intereses de TC
           </h4>
        </div>
        <div className="p-4 space-y-3">
           <p className="text-sm" style={{ color: 'var(--warning-text)' }}>
              Si tienes tarjetas de crédito con tasa E.A. configurada y compras a cuotas, verás:
           </p>
           <ul className="space-y-2 text-sm" style={{ color: 'var(--warning-text)' }}>
              <li className="flex items-start gap-2">
                 <span style={{ color: 'var(--warning)' }}>•</span>
                 <span>Total de intereses generados por tus compras</span>
              </li>
              <li className="flex items-start gap-2">
                 <span style={{ color: 'var(--warning)' }}>•</span>
                 <span>Desglose por tarjeta de crédito</span>
              </li>
              <li className="flex items-start gap-2">
                 <span style={{ color: 'var(--warning)' }}>•</span>
                 <span>Intereses pagados vs pendientes</span>
              </li>
           </ul>
           <p className="text-xs" style={{ color: 'var(--warning-text)' }}>
              Esta tarjeta solo aparece si tienes compras con intereses registradas.
           </p>
        </div>
     </div>

     {/* Filtros en estadísticas — panel neutro (explicación genérica, no estado). */}
     <div className="p-4 bg-muted rounded-xl border border-border">
        <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
           <Filter size={16} className="text-muted-foreground" />
           Filtros Aplicados
        </h4>
        <p className="text-sm text-muted-foreground mb-3">
           Los filtros que apliques en la vista de Transacciones también afectan las estadísticas:
        </p>
        <ul className="space-y-1 text-sm text-muted-foreground">
           <li className="flex items-start gap-2">
              <span className="text-muted-foreground">•</span>
              <span>Filtra por cuenta para ver estadísticas solo de esa cuenta</span>
           </li>
           <li className="flex items-start gap-2">
              <span className="text-muted-foreground">•</span>
              <span>Filtra por categoría para analizar un tipo específico de gasto</span>
           </li>
           <li className="flex items-start gap-2">
              <span className="text-muted-foreground">•</span>
              <span>Usa rangos de fecha para comparar períodos específicos</span>
           </li>
        </ul>
     </div>

     {/* Funciones adicionales — iconos neutros de marca, no decoración violeta. */}
     <div className="grid sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-border">
           <Eye className="w-8 h-8 text-muted-foreground mb-3" />
           <h4 className="font-semibold text-foreground mb-1">Modo Discreto</h4>
           <p className="text-sm text-muted-foreground">Usa el botón del ojo en las tarjetas superiores para ocultar los saldos cuando estés en público.</p>
        </div>

        <div className="p-4 rounded-xl border border-border">
           <Settings className="w-8 h-8 text-muted-foreground mb-3" />
           <h4 className="font-semibold text-foreground mb-1">Tema Claro/Oscuro</h4>
           <p className="text-sm text-muted-foreground">Cambia entre tema claro y oscuro desde el botón en la esquina superior. Se adapta a tu preferencia del sistema.</p>
        </div>
     </div>
  </div>
);
