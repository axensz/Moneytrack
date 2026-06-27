import React from 'react';
import { Wallet, ArrowRightLeft, Repeat, Percent, Filter, PieChart, CheckCircle, Eye, Bot, Target, Download, HandCoins } from 'lucide-react';

/**
 * Las 11 funciones agrupadas en 3 categorías, lo esencial primero
 * (cuentas/transacciones). La jerarquía la marca el encabezado de grupo
 * (peso/tamaño), NO un color por icono: todos los iconos usan un solo tono
 * neutro de marca para no convertir la lista en un arcoíris de 11 hues.
 */
const featureGroups: {
  title: string;
  items: { icon: React.ComponentType<{ size?: number; className?: string }>; name: string; desc: string }[];
}[] = [
  {
    title: 'Cuentas y dinero',
    items: [
      { icon: Wallet, name: 'Múltiples Cuentas', desc: 'Ahorros, efectivo y tarjetas de crédito con cupo y fechas de corte.' },
      { icon: ArrowRightLeft, name: 'Transferencias', desc: 'Mueve dinero entre cuentas manteniendo el balance correcto.' },
      { icon: HandCoins, name: 'Préstamos', desc: 'Controla quién te debe y a quién le debes, con pagos parciales.' },
    ],
  },
  {
    title: 'Planificación',
    items: [
      { icon: Repeat, name: 'Pagos Periódicos', desc: 'Gestiona suscripciones y servicios con alertas de vencimiento.' },
      { icon: PieChart, name: 'Presupuestos', desc: 'Límites de gasto mensuales por categoría con alertas.' },
      { icon: Target, name: 'Metas de Ahorro', desc: 'Objetivos financieros con progreso y ahorro sugerido.' },
      { icon: Percent, name: 'Intereses TC', desc: 'Calcula intereses automáticamente en compras a cuotas.' },
    ],
  },
  {
    title: 'Análisis y herramientas',
    items: [
      { icon: PieChart, name: 'Estadísticas', desc: 'Gráficos de flujo de caja, categorías y tendencias.' },
      { icon: Bot, name: 'Asistente IA', desc: 'Chat inteligente que analiza y ejecuta acciones sobre tus finanzas.' },
      { icon: Filter, name: 'Filtros Avanzados', desc: 'Por cuenta, categoría, estado y rango de fechas.' },
      { icon: Download, name: 'Exportar CSV', desc: 'Descarga tus transacciones para Excel o Google Sheets.' },
    ],
  },
];

export const HelpSectionBasics: React.FC = () => (
  <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
    <div>
      <h3 className="text-xl font-semibold text-foreground mb-3">
        Bienvenido a MoneyTrack
      </h3>
      <p className="text-muted-foreground mb-4 leading-relaxed">
        MoneyTrack es tu administrador financiero personal. Controla tus cuentas, registra transacciones, gestiona pagos recurrentes, define presupuestos, establece metas de ahorro, lleva el control de préstamos y visualiza estadísticas detalladas de tus finanzas.
      </p>
    </div>

    <div className="grid sm:grid-cols-2 gap-4">
      <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-accent)' }}>
        <h4 className="font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--primary-text)' }}>
          <div className="p-1.5 rounded-lg" style={{ background: 'var(--card)', color: 'var(--primary)' }}>
            <CheckCircle size={16} />
          </div>
          Primeros Pasos
        </h4>
        <ol className="list-decimal list-inside space-y-2.5 text-sm ml-1" style={{ color: 'var(--primary-text)' }}>
          <li>Crea tu primera cuenta (ahorro, efectivo o TC)</li>
          <li>Registra tu saldo inicial</li>
          <li>Agrega tus primeras transacciones</li>
          <li>Configura pagos periódicos (suscripciones)</li>
          <li>Define presupuestos y metas de ahorro</li>
          <li>Revisa tus estadísticas</li>
        </ol>
      </div>

      <div className="p-4 rounded-xl border" style={{ background: 'var(--info-muted)', borderColor: 'var(--info)' }}>
        <h4 className="font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--info-text)' }}>
          <div className="p-1.5 rounded-lg" style={{ background: 'var(--card)', color: 'var(--info)' }}>
            <Eye size={16} />
          </div>
          Privacidad y Datos
        </h4>
        <ul className="space-y-2 text-sm" style={{ color: 'var(--info-text)' }}>
          <li className="flex items-start gap-2">
            <span className="mt-1" style={{ color: 'var(--info)' }}>•</span>
            <span><strong>Sin cuenta:</strong> Datos guardados localmente en tu navegador</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1" style={{ color: 'var(--info)' }}>•</span>
            <span><strong>Con Google:</strong> Sincronización en la nube, accede desde cualquier dispositivo</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1" style={{ color: 'var(--info)' }}>•</span>
            <span><strong>Modo discreto:</strong> Oculta saldos con el botón del ojo</span>
          </li>
        </ul>
      </div>
    </div>

    {/* Características principales — agrupadas, lo esencial primero. */}
    <div className="space-y-5">
      <h4 className="font-semibold text-foreground">Características Principales</h4>
      {featureGroups.map((group) => (
        <div key={group.title}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {group.title}
          </p>
          <div className="rounded-xl border border-border overflow-hidden bg-card grid sm:grid-cols-2 divide-y sm:divide-y-0 divide-border">
            {group.items.map((item, i) => {
              const Icon = item.icon;
              // En sm (2 col): borde izquierdo en la columna derecha y borde
              // superior a partir de la 2ª fila; dibuja la rejilla sin solapes.
              const isRightCol = i % 2 === 1;
              const isSecondRowPlus = i >= 2;
              return (
                <div
                  key={item.name}
                  className={`p-4 border-border ${isRightCol ? 'sm:border-l' : ''} ${isSecondRowPlus ? 'sm:border-t' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {/* Un solo tono neutro de marca para TODOS los iconos. */}
                    <Icon size={16} className="text-muted-foreground" />
                    <span className="font-medium text-foreground">{item.name}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  </div>
);
