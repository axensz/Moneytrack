import React from 'react';
import { Bot, CalendarRange, ListChecks, PiggyBank } from 'lucide-react';
import { sectionTitle } from '../../../config/ui';

export const HelpSectionFinancialPlan: React.FC = () => (
  <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
    <div>
      <h3 className="mb-2 text-xl font-semibold text-foreground">
        {sectionTitle('financial-plan')}
      </h3>
      <p className="text-muted-foreground">
        Convierte tus movimientos reales en prioridades de ahorro y límites de gasto que puedes revisar antes de aplicar.
      </p>
    </div>

    <div className="overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border bg-muted p-4">
        <h4 className="flex items-center gap-2 font-semibold text-foreground">
          <CalendarRange size={18} className="text-muted-foreground" aria-hidden="true" />
          Configura el punto de partida
        </h4>
      </div>
      <div className="space-y-3 p-4 text-sm text-muted-foreground">
        <p>
          Al iniciar el plan, indica tu ingreso mensual y el mes desde el que quieres analizar tus movimientos.
          Puedes editar ambos datos más adelante.
        </p>
        <p>
          Si el plan indica que no hay suficientes datos, revisa el mes inicial o registra más movimientos pagados.
          Los pendientes no se usan para calcular el gasto real.
        </p>
      </div>
    </div>

    <div className="rounded-xl border border-border bg-card p-4">
      <h4 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
        <ListChecks size={18} className="text-muted-foreground" aria-hidden="true" />
        Lleva una sugerencia a Presupuestos
      </h4>
      <ol className="space-y-3 text-sm text-muted-foreground">
        <li className="flex gap-3">
          <span className="font-semibold text-foreground">1.</span>
          Revisa la categoría, el límite sugerido y la razón que presenta el plan.
        </li>
        <li className="flex gap-3">
          <span className="font-semibold text-foreground">2.</span>
          <span>
            <strong className="text-foreground">Usar sugerencia</strong> envía un borrador a Presupuestos;
            allí puedes ajustarlo y decidir si lo guardas.
          </span>
        </li>
      </ol>
    </div>

    <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <PiggyBank size={19} aria-hidden="true" />
      </div>
      <div>
        <h4 className="font-semibold text-foreground">El plan funciona sin IA</h4>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          El análisis, el score y las sugerencias se calculan con tus datos financieros. La IA es una mejora opcional
          para obtener consejos personalizados; no es necesaria para crear ni usar el plan.
        </p>
        <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
          <Bot size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Si decides activarla, MoneyTrack te pedirá autorización antes de enviar datos a Gemini.
        </p>
      </div>
    </div>
  </div>
);
