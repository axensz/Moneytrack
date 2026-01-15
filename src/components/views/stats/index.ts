/**
 * Stats Module
 * 
 * Exporta el componente principal de estadísticas y sus dependencias
 * para ser utilizado en el resto de la aplicación.
 * 
 * Uso:
 * import { StatsView } from '@/components/views/stats';
 */

export { StatsView } from './StatsView';

// También exportamos hooks y tipos por si se necesitan en otros módulos
export { useCreditCardInterests } from './hooks/useCreditCardInterests';
export { useStatsData } from './hooks/useStatsData';
