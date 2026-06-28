import React from 'react';
import { CheckCircle, Bot, MessageSquare, Sparkles, Plus, RefreshCw, ListChecks, Tags } from 'lucide-react';

export const HelpSectionAI: React.FC = () => (
  <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
     <div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Asistente IA</h3>
        <p className="text-muted-foreground">Tu asistente financiero personal potenciado por inteligencia artificial.</p>
     </div>

     {/* Cómo acceder */}
     <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-accent)' }}>
        <h4 className="font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--primary-text)' }}>
           <div className="p-1.5 rounded-lg" style={{ background: 'var(--card)', color: 'var(--primary)' }}>
              <Bot size={16} />
           </div>
           ¿Cómo usarlo?
        </h4>
        <p className="text-sm" style={{ color: 'var(--primary-text)' }}>
           Busca el botón flotante con el ícono de chat en la esquina inferior derecha.
           Al abrirlo, podrás conversar con el asistente sobre tus finanzas. Solo está disponible cuando inicias sesión.
        </p>
     </div>

     {/* Consultas */}
     <div className="border border-border rounded-xl overflow-hidden">
        <div className="bg-muted p-4 border-b border-border">
           <h4 className="font-semibold text-foreground flex items-center gap-2">
              <MessageSquare size={18} />
              Consultas que puedes hacer
           </h4>
        </div>
        <div className="p-4 space-y-3">
           <p className="text-sm text-muted-foreground">
              El asistente conoce tus cuentas, transacciones y estadísticas. Puedes preguntarle:
           </p>
           <div className="grid gap-2 text-sm">
              <div className="flex items-start gap-2 p-2.5 bg-muted rounded-lg text-muted-foreground">
                 <MessageSquare size={14} className="flex-shrink-0 mt-0.5" />
                 <span><em>"¿Cómo voy este mes?"</em> — Resumen de ingresos vs gastos</span>
              </div>
              <div className="flex items-start gap-2 p-2.5 bg-muted rounded-lg text-muted-foreground">
                 <MessageSquare size={14} className="flex-shrink-0 mt-0.5" />
                 <span><em>"¿En qué gasto más?"</em> — Análisis de categorías</span>
              </div>
              <div className="flex items-start gap-2 p-2.5 bg-muted rounded-lg text-muted-foreground">
                 <MessageSquare size={14} className="flex-shrink-0 mt-0.5" />
                 <span><em>"¿Cuánto debo en tarjetas de crédito?"</em> — Deuda TC</span>
              </div>
              <div className="flex items-start gap-2 p-2.5 bg-muted rounded-lg text-muted-foreground">
                 <MessageSquare size={14} className="flex-shrink-0 mt-0.5" />
                 <span><em>"Dame consejos para ahorrar"</em> — Recomendaciones personalizadas</span>
              </div>
           </div>
        </div>
     </div>

     {/* Acciones */}
     <div className="border border-border rounded-xl overflow-hidden">
        <div className="bg-muted p-4 border-b border-border">
           <h4 className="font-semibold text-foreground flex items-center gap-2">
              <Sparkles size={18} style={{ color: 'var(--primary)' }} />
              Acciones desde el chat
           </h4>
        </div>
        <div className="p-4 space-y-4">
           <p className="text-sm text-muted-foreground">
              Además de consultar, el asistente puede realizar acciones en tu cuenta:
           </p>
           <div className="space-y-3">
              <div className="flex gap-3">
                 <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-primary)', color: 'var(--primary-text)' }}>
                    <Plus size={14} />
                 </span>
                 <div>
                    <p className="font-medium text-foreground">Agregar transacciones</p>
                    <p className="text-sm text-muted-foreground">Escribe: <em>"Gasté 35mil en almuerzo"</em> y lo registra por ti.</p>
                 </div>
              </div>
              <div className="flex gap-3">
                 <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-primary)', color: 'var(--primary-text)' }}>
                    <RefreshCw size={14} />
                 </span>
                 <div>
                    <p className="font-medium text-foreground">Recategorizar transacciones</p>
                    <p className="text-sm text-muted-foreground">Pídele: <em>"Recategoriza mis transacciones de comida"</em></p>
                 </div>
              </div>
              <div className="flex gap-3">
                 <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-primary)', color: 'var(--primary-text)' }}>
                    <ListChecks size={14} />
                 </span>
                 <div>
                    <p className="font-medium text-foreground">Recategorización masiva</p>
                    <p className="text-sm text-muted-foreground">Puede recategorizar varias transacciones a la vez automáticamente.</p>
                 </div>
              </div>
              <div className="flex gap-3">
                 <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-primary)', color: 'var(--primary-text)' }}>
                    <Tags size={14} />
                 </span>
                 <div>
                    <p className="font-medium text-foreground">Crear categorías</p>
                    <p className="text-sm text-muted-foreground">Si una recategorización necesita una categoría nueva, la crea automáticamente.</p>
                 </div>
              </div>
           </div>
        </div>
     </div>

     {/* Confirmación */}
     <div className="p-4 rounded-xl border" style={{ background: 'var(--warning-muted)', borderColor: 'var(--warning)' }}>
        <h4 className="font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--warning-text)' }}>
           <CheckCircle size={16} style={{ color: 'var(--warning)' }} />
           Confirmación de acciones
        </h4>
        <p className="text-sm" style={{ color: 'var(--warning-text)' }}>
           Todas las acciones propuestas por el asistente requieren tu confirmación antes de ejecutarse.
           Verás una tarjeta con los detalles de la acción y botones para confirmar o rechazar.
        </p>
     </div>

     {/* Token usage */}
     <div className="p-4 bg-muted rounded-xl border border-border">
        <h4 className="font-semibold text-foreground mb-2">Uso de tokens</h4>
        <p className="text-sm text-muted-foreground">
           Al pasar el cursor sobre el ícono del bot en cada respuesta, verás el uso de tokens
           (una medida del procesamiento utilizado por la IA). Esto es solo informativo.
        </p>
     </div>
  </div>
);
