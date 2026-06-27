'use client';

import React from 'react';
import { Upload, CheckCircle, AlertCircle, ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { isAIAvailable } from '../../../utils/aiCategorizer';
import { AIDateAdjuster } from './AIDateAdjuster';
import type { Account } from '../../../types/finance';
import type { ImportRow } from '../../../hooks/useImportTransactions';
import type { ImportParseStats } from '../../../types/import';

interface ImportUploadStepProps {
  selectedAccountId: string;
  nonCreditAccounts: Account[];
  creditAccounts: Account[];
  onAccountChange: (accountId: string) => void;
  onDrop: (e: React.DragEvent) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  pdfParsing: boolean;
  fileName: string;
  parseError: string;
  pdfNeedsAI: boolean;
  aiUnavailableMessage: string;
  onClose: () => void;
  onOpenAISettings?: () => void;
  parseStats: ImportParseStats | null;
  rows: ImportRow[];
  setRows: React.Dispatch<React.SetStateAction<ImportRow[]>>;
}

/** Paso 1 del wizard: selección de cuenta + carga de archivo + estadísticas. */
export function ImportUploadStep({
  selectedAccountId,
  nonCreditAccounts,
  creditAccounts,
  onAccountChange,
  onDrop,
  fileInputRef,
  onFileChange,
  pdfParsing,
  fileName,
  parseError,
  pdfNeedsAI,
  aiUnavailableMessage,
  onClose,
  onOpenAISettings,
  parseStats,
  rows,
  setRows,
}: ImportUploadStepProps) {
  return (
    <div className="space-y-5">
      {/* Cuenta destino */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
          Cuenta destino
        </label>
        <div className="relative">
          <select
            value={selectedAccountId}
            onChange={e => onAccountChange(e.target.value)}
            className="w-full pl-3 pr-8 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Selecciona una cuenta</option>
            {nonCreditAccounts.length > 0 && (
              <optgroup label="Ahorros / Efectivo">
                {nonCreditAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </optgroup>
            )}
            {creditAccounts.length > 0 && (
              <optgroup label="Tarjetas de crédito">
                {creditAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </optgroup>
            )}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-2xl p-5 sm:p-8 text-center cursor-pointer hover:border-purple-500 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-colors"
      >
        {pdfParsing ? (
          <Loader2 size={32} className="mx-auto mb-3 text-purple-400 animate-spin" />
        ) : (
          <Upload size={32} className="mx-auto mb-3 text-purple-400" />
        )}
        {pdfParsing ? (
          <div className="text-center">
            <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">Analizando PDF con IA...</p>
            <p className="text-xs text-muted-foreground mt-1">Gemini está extrayendo las transacciones</p>
          </div>
        ) : fileName ? (
          <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">{fileName}</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Arrastra tu extracto aquí o haz clic para seleccionar
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              CSV · Excel (.xlsx) · PDF con IA
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Bancolombia, Davivienda, BBVA, Nequi y más
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt,.xlsx,.xls,.pdf"
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      {/* Error */}
      {parseError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-sm text-red-700 dark:text-red-400">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{parseError}</span>
        </div>
      )}

      {/* PDF necesita el Asistente IA */}
      {pdfNeedsAI && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-sm">
          <div className="flex items-start gap-2 text-blue-800 dark:text-blue-200">
            <Sparkles size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">La importación de PDF usa el Asistente IA</p>
              <p className="text-blue-700 dark:text-blue-300 mt-0.5">{aiUnavailableMessage}</p>
            </div>
          </div>
          {onOpenAISettings && (
            <button
              onClick={() => { onClose(); onOpenAISettings(); }}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Sparkles size={12} />
              Configurar IA
            </button>
          )}
          <p className="text-xs text-blue-600 dark:text-blue-300/80 mt-2">
            También puedes importar tu extracto en formato CSV o Excel sin IA.
          </p>
        </div>
      )}

      {/* Stats del parse */}
      {parseStats && rows.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl text-sm text-green-700 dark:text-green-400">
            <CheckCircle size={16} className="flex-shrink-0" />
            <span>
              <strong>{rows.length} transacciones</strong> detectadas
              {parseStats.skipped > 0 && `, ${parseStats.skipped} ignoradas`}
            </span>
          </div>
          {parseStats.duplicates > 0 && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-sm text-amber-700 dark:text-amber-400">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>
                <strong>{parseStats.duplicates} posibles duplicados</strong> detectados y excluidos automáticamente. Puedes incluirlos manualmente si lo necesitas.
              </span>
            </div>
          )}
          {(parseStats.needsRate ?? 0) > 0 && (
            <div className="flex items-center gap-2 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl text-sm text-orange-700 dark:text-orange-400">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>
                <strong>{parseStats.needsRate} movimientos en moneda extranjera sin TRM</strong> excluidos: no se pueden convertir a COP. Agrega la columna TRM al archivo o edítalos manualmente.
              </span>
            </div>
          )}

          {/* AI Date Adjustment */}
          {isAIAvailable() && (
            <AIDateAdjuster rows={rows} setRows={setRows} />
          )}
        </div>
      )}
    </div>
  );
}
