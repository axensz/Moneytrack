/**
 * Tipos del wizard de importación de extractos (Q-godfiles).
 * Extraídos de ImportTransactionsModal para compartir entre el hook
 * `useImportWizard` y los subcomponentes de paso.
 */

/** Paso actual del asistente de importación. */
export type WizardStep = 'upload' | 'review' | 'done';

/** Estadísticas del parseo de un archivo cargado. */
export interface ImportParseStats {
  total: number;
  skipped: number;
  duplicates: number;
  needsRate?: number;
}

/** Sugerencia de categorización por IA, agrupada por patrón de descripción. */
export interface AISuggestion {
  id: string;
  pattern: string;
  category: string;
  confidence: number;
  indexes: number[];
  sampleDescription: string;
  sampleAmount: number;
}
