'use client';

import React from 'react';
import { CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';

interface ImportResultLike {
  imported: number;
  skipped: number;
  errors: string[];
}

interface ImportDoneStepProps {
  result: ImportResultLike;
  /**
   * CTA de salida opcional. Si el padre la provee, mostramos un botón primario
   * "Ver movimientos"; si no, el modal ya ofrece "Cerrar" en su footer.
   */
  onViewTransactions?: () => void;
}

/**
 * Mapea un mensaje de error de importación a copy en español legible.
 * Los errores conocidos ya vienen en español (ver useImportTransactions); este
 * fallback evita exponer un mensaje técnico crudo (p. ej. de Firestore en inglés).
 */
function friendlyError(message: string | undefined): string {
  if (!message) return 'Ocurrió un error al guardar las transacciones. Intenta de nuevo.';
  // Los errores conocidos del importador están en español y contienen estas
  // palabras; los mostramos tal cual. Cualquier otro mensaje (técnico/en inglés,
  // p. ej. de Firestore) se reemplaza por un texto genérico en español.
  const isKnownSpanish = /omitid|inválid|inexistente|autenticad|destino|moneda/i.test(message);
  return isKnownSpanish
    ? message
    : 'No pudimos guardar las transacciones. Revisa tu conexión e intenta de nuevo.';
}

/** Paso 3 del wizard: confirmación de importación (éxito o error). */
export function ImportDoneStep({ result, onViewTransactions }: ImportDoneStepProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-4">
      {result.errors.length === 0 ? (
        <>
          <div className="w-16 h-16 bg-success-muted rounded-full flex items-center justify-center">
            <CheckCircle size={32} className="text-success" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">
              {result.imported} transacciones importadas
            </p>
            {result.skipped > 0 && (
              <p className="text-sm text-muted-foreground mt-1">{result.skipped} excluidas manualmente</p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="w-16 h-16 bg-destructive-muted rounded-full flex items-center justify-center">
            <AlertCircle size={32} className="text-destructive" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">Error al importar</p>
            <p className="text-sm text-muted-foreground mt-1">{friendlyError(result.errors[0])}</p>
            {result.imported > 0 && (
              <p className="text-sm text-success mt-1">{result.imported} transacciones guardadas antes del error</p>
            )}
          </div>
        </>
      )}

      {onViewTransactions && (
        <button onClick={onViewTransactions} className="btn-primary mt-2">
          Ver movimientos
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}
