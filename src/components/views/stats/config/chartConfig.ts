/**
 * Configuración centralizada para gráficos de estadísticas
 * Single source of truth para estilos, colores y configuraciones
 */

// Paleta de colores para categorías (tonos morados)
export const CHART_COLORS = [
  '#8b5cf6', '#a78bfa', '#c4b5fd', '#d8b4fe', 
  '#e9d5ff', '#f3e8ff', '#7c3aed', '#6d28d9'
] as const;

// Colores semánticos para tipos de datos
export const SEMANTIC_COLORS = {
  income: '#8b5cf6',      // Morado - Ingresos
  expense: '#f43f5e',     // Rosa/Rojo - Gastos
  interest: '#f59e0b',    // Ámbar - Intereses
  pending: '#eab308',     // Amarillo - Pendiente
} as const;

// Configuración común de ejes
export const AXIS_CONFIG = {
  stroke: '#9ca3af',
  style: { fontSize: '11px' },
  tick: { fontSize: 11 },
} as const;

// Configuración de YAxis con formateo
export const Y_AXIS_CONFIG = {
  ...AXIS_CONFIG,
  width: 45,
  tickFormatter: (value: number) => `${(value / 1000).toFixed(0)}k`,
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
