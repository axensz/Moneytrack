'use client';

import React from 'react';
import { X, FileText, Loader2, ArrowLeft } from 'lucide-react';
import { useAccountDomain, useTransactionDomain, useCategoryDomain } from '../../hooks/useFinanceSelectors';
import { useImportWizard } from '../../hooks/useImportWizard';
import { ImportUploadStep } from './import/ImportUploadStep';
import { ImportReviewStep } from './import/ImportReviewStep';
import { ImportDoneStep } from './import/ImportDoneStep';
import type { WizardStep } from '../../types/import';

interface ImportTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAISettings?: () => void;
}

/**
 * Wizard de importación de extractos (Q-godfiles). Shell de presentación: el
 * estado y la lógica viven en `useImportWizard` y cada paso en su componente
 * (ImportUploadStep / ImportReviewStep / ImportDoneStep). El commit de dinero
 * está aislado en `useImportTransactions`, que el hook orquesta.
 */
export function ImportTransactionsModal({ isOpen, onClose, onOpenAISettings }: ImportTransactionsModalProps) {
  const { accounts } = useAccountDomain();
  const { transactions: existingTransactions } = useTransactionDomain();
  const { categories } = useCategoryDomain();
  const wizard = useImportWizard({ accounts, existingTransactions, categories, onClose });
  const {
    step, setStep,
    rows, setRows,
    selectedAccountId,
    parseError,
    fileName,
    parseStats,
    aiCategorizing,
    aiApplied,
    aiSuggestions,
    pdfParsing,
    pdfNeedsAI,
    fileInputRef,
    status, progress, result,
    nonCreditAccounts,
    creditAccounts,
    availableCategoryOptions,
    includedCount,
    aiSuggestionTransactionCount,
    aiSuggestionsByCategory,
    aiUnavailableMessage,
    handleClose,
    handleFileChange,
    handleDrop,
    handleAccountChange,
    handleToggleRow,
    handleToggleAll,
    handleCategoryChange,
    handleTypeChange,
    handleImport,
    handleAICategorize,
    handleSuggestionCategoryChange,
    handleDiscardAISuggestions,
    handleApplyAISuggestions,
  } = wizard;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full sm:max-w-3xl max-h-[100dvh] sm:max-h-[90dvh] bg-white dark:bg-gray-900 sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col overflow-hidden sm:my-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
          <div className="flex items-center gap-3">
            {step === 'review' && (
              <button
                onClick={() => setStep('upload')}
                className="p-1.5 hover:bg-white/70 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <ArrowLeft size={16} className="text-gray-600 dark:text-gray-400" />
              </button>
            )}
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
              <FileText size={18} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                Importar Extracto Bancario
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {step === 'upload' && 'Carga tu extracto en formato CSV'}
                {step === 'review' && `${includedCount} de ${rows.length} transacciones seleccionadas`}
                {step === 'done' && (result && result.errors.length > 0 ? 'Importación con errores' : 'Importación completada')}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/70 dark:hover:bg-gray-700 rounded-xl transition-colors"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-0 px-4 sm:px-6 pt-3 sm:pt-4">
          {(['upload', 'review', 'done'] as WizardStep[]).map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step === s ? 'text-purple-600 dark:text-purple-400' : i < ['upload', 'review', 'done'].indexOf(step) ? 'text-green-600' : 'text-gray-400'}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === s ? 'bg-purple-600 text-white' : i < ['upload', 'review', 'done'].indexOf(step) ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>
                  {i < ['upload', 'review', 'done'].indexOf(step) ? '✓' : i + 1}
                </div>
                <span className="hidden sm:inline">{s === 'upload' ? 'Cargar' : s === 'review' ? 'Revisar' : 'Listo'}</span>
              </div>
              {i < 2 && <div className={`flex-1 h-px mx-2 ${i < ['upload', 'review', 'done'].indexOf(step) ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {step === 'upload' && (
            <ImportUploadStep
              selectedAccountId={selectedAccountId}
              nonCreditAccounts={nonCreditAccounts}
              creditAccounts={creditAccounts}
              onAccountChange={handleAccountChange}
              onDrop={handleDrop}
              fileInputRef={fileInputRef}
              onFileChange={handleFileChange}
              pdfParsing={pdfParsing}
              fileName={fileName}
              parseError={parseError}
              pdfNeedsAI={pdfNeedsAI}
              aiUnavailableMessage={aiUnavailableMessage}
              onClose={handleClose}
              onOpenAISettings={onOpenAISettings}
              parseStats={parseStats}
              rows={rows}
              setRows={setRows}
            />
          )}

          {step === 'review' && (
            <ImportReviewStep
              rows={rows}
              setRows={setRows}
              includedCount={includedCount}
              availableCategoryOptions={availableCategoryOptions}
              aiCategorizing={aiCategorizing}
              aiApplied={aiApplied}
              aiSuggestions={aiSuggestions}
              aiSuggestionTransactionCount={aiSuggestionTransactionCount}
              aiSuggestionsByCategory={aiSuggestionsByCategory}
              aiUnavailableMessage={aiUnavailableMessage}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
              onCategoryChange={handleCategoryChange}
              onTypeChange={handleTypeChange}
              onAICategorize={handleAICategorize}
              onSuggestionCategoryChange={handleSuggestionCategoryChange}
              onApplyAISuggestions={handleApplyAISuggestions}
              onDiscardAISuggestions={handleDiscardAISuggestions}
              onOpenAISettings={onOpenAISettings}
            />
          )}

          {step === 'done' && result && <ImportDoneStep result={result} />}

          {/* Barra de progreso durante importación */}
          {status === 'importing' && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400">
                <Loader2 size={16} className="animate-spin" />
                <span>Importando {progress}%...</span>
              </div>
              <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 flex justify-between gap-3">
          {step === 'upload' && (
            <>
              <button onClick={handleClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => setStep('review')}
                disabled={rows.length === 0 || !selectedAccountId}
                className="flex-1 sm:flex-none px-5 py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Revisar {rows.length > 0 ? `(${rows.length})` : ''}
              </button>
            </>
          )}

          {step === 'review' && (
            <>
              <button onClick={() => setStep('upload')} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                Atrás
              </button>
              <button
                onClick={handleImport}
                disabled={includedCount === 0 || status === 'importing'}
                className="flex-1 sm:flex-none px-5 py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {status === 'importing' && <Loader2 size={14} className="animate-spin" />}
                Importar {includedCount} transacciones
              </button>
            </>
          )}

          {step === 'done' && (
            <button
              onClick={handleClose}
              className="ml-auto px-5 py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors"
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
