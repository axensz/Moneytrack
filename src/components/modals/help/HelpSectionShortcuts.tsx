import React from 'react';
import { Compass, Zap } from 'lucide-react';

/**
 * Atajos de teclado — refleja EXACTAMENTE los registrados en finance-tracker.tsx
 * (useKeyboardShortcuts). Si cambian allí, actualizar aquí. Agrupados por intención
 * (navegar vs. actuar); las teclas se muestran como <kbd> con tokens del sistema.
 */
const shortcutGroups: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  items: { keys: string[]; desc: string }[];
}[] = [
  {
    title: 'Navegación',
    icon: Compass,
    items: [
      { keys: ['Alt', '1'], desc: 'Ir a Transacciones' },
      { keys: ['Alt', '2'], desc: 'Ir a Cuentas' },
      { keys: ['Alt', '3'], desc: 'Ir a Pagos Periódicos' },
      { keys: ['Alt', '4'], desc: 'Ir a Préstamos' },
      { keys: ['Alt', '5'], desc: 'Ir a Presupuestos' },
      { keys: ['Alt', '6'], desc: 'Ir a Metas' },
      { keys: ['Alt', '7'], desc: 'Ir a Estadísticas' },
    ],
  },
  {
    title: 'Acciones',
    icon: Zap,
    items: [
      { keys: ['Ctrl', 'N'], desc: 'Nueva transacción' },
      { keys: ['Ctrl', 'H'], desc: 'Abrir esta ayuda' },
      { keys: ['Esc'], desc: 'Cerrar ventana o formulario' },
    ],
  },
];

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="inline-flex min-w-[26px] items-center justify-center rounded-md border border-border bg-muted px-1.5 py-1 font-mono text-xs font-semibold text-foreground shadow-sm">
    {children}
  </kbd>
);

export const HelpSectionShortcuts: React.FC = () => (
  <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
    <div>
      <h3 className="text-xl font-semibold text-foreground mb-3">Atajos de Teclado</h3>
      <p className="text-muted-foreground mb-4 leading-relaxed">
        Muévete y registra más rápido sin soltar el teclado. Los atajos funcionan en
        cualquier pantalla, salvo mientras escribes en un campo.
      </p>
    </div>

    {shortcutGroups.map((group) => {
      const Icon = group.icon;
      return (
        <div key={group.title}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <Icon size={13} className="text-muted-foreground" />
            {group.title}
          </p>
          <div className="rounded-xl border border-border overflow-hidden bg-card divide-y divide-border">
            {group.items.map((item) => (
              <div
                key={item.desc}
                className="flex items-center justify-between gap-4 px-4 py-2.5"
              >
                <span className="text-sm text-foreground">{item.desc}</span>
                <span className="flex items-center gap-1 shrink-0">
                  {item.keys.map((k, i) => (
                    <React.Fragment key={k}>
                      {i > 0 && (
                        <span className="text-xs text-muted-foreground" aria-hidden="true">
                          +
                        </span>
                      )}
                      <Kbd>{k}</Kbd>
                    </React.Fragment>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    })}
  </div>
);
