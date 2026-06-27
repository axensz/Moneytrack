/**
 * Configuración centralizada para gráficos de estadísticas
 * Single source of truth para estilos, colores y configuraciones
 */

// Rampa violeta (la marca) para las porciones del pastel. Saltos de luminancia
// perceptibles entre pasos para que las categorías se distingan; el último tono
// (gris muted) queda reservado por convención para la categoría agregada "Otros".
// Solo se usan los primeros 5 + "Otros" (ver MAX_PIE_SLICES en CategoryPieChart).
export const CHART_COLORS = [
  '#6d28d9', // violet-700
  '#8b5cf6', // violet-500
  '#a78bfa', // violet-400
  '#c4b5fd', // violet-300
  '#ddd6fe', // violet-200
  '#9ca3af', // gris muted → "Otros"
] as const;

// Colores semánticos por ESTADO. Se referencian como CSS vars para adaptarse a
// claro/oscuro automáticamente: ingreso = verde (--success), gasto = rojo
// (--destructive). Recharts las pasa tal cual a los atributos SVG stroke/fill.
export const SEMANTIC_COLORS = {
  income: 'var(--success)',       // Verde - Ingresos
  expense: 'var(--destructive)',  // Rojo - Gastos
  interest: 'var(--warning)',     // Ámbar - Intereses
  pending: 'var(--warning)',      // Ámbar - Pendiente
} as const;

// Patrón de trazo para reforzar la distinción ingresos/gastos sin depender solo
// del color (a11y): ingresos línea continua, gastos discontinua.
export const SERIES_DASH = {
  income: undefined,      // continua
  expense: '6 4',         // discontinua
} as const;

// Configuración común de ejes (tokens: ejes en muted-foreground)
export const AXIS_CONFIG = {
  stroke: 'var(--muted-foreground)',
  style: { fontSize: '11px' },
  tick: { fontSize: 11 },
} as const;

// Configuración de YAxis con formateo
export const Y_AXIS_CONFIG = {
  ...AXIS_CONFIG,
  width: 45,
  // Compacto pero sin colapsar todo <1000 a "0k": montos pequeños se muestran
  // tal cual, miles como "Nk", millones como "N,NM". (#stats-yaxis)
  tickFormatter: (value: number) => {
    if (!Number.isFinite(value) || value === 0) return '0';
    const abs = Math.abs(value);
    if (abs < 1000) return `${Math.round(value)}`;
    if (abs < 1_000_000) return `${(value / 1000).toFixed(abs < 10_000 ? 1 : 0)}k`;
    return `${(value / 1_000_000).toFixed(1)}M`;
  },
} as const;

// Márgenes estándar para gráficos
export const CHART_MARGINS = {
  top: 5,
  right: 10,
  left: 0,
  bottom: 5,
} as const;

// Configuración de leyendas
export const LEGEND_CONFIG = {
  iconType: 'circle' as const,
  wrapperStyle: { fontSize: '12px' },
} as const;

// Configuración de gradientes para gráficos de área
export const GRADIENT_CONFIG = {
  income: {
    id: 'colorIngresos',
    color: SEMANTIC_COLORS.income,
    startOpacity: 0.3,
    endOpacity: 0,
  },
  expense: {
    id: 'colorGastos',
    color: SEMANTIC_COLORS.expense,
    startOpacity: 0.3,
    endOpacity: 0,
  },
} as const;

// Configuración de líneas/áreas
export const LINE_CONFIG = {
  strokeWidth: 2.5,
  dotRadius: 5,
} as const;

// Configuración de barras
export const BAR_CONFIG = {
  radius: [6, 6, 0, 0] as [number, number, number, number],
} as const;

// Configuración del gráfico de pastel
export const PIE_CONFIG = {
  innerRadius: 55,
  outerRadius: 75,
  paddingAngle: 2,
} as const;

// Alturas estándar de gráficos
export const CHART_HEIGHTS = {
  large: 320,
  medium: 280,
  small: 220,
} as const;
