'use client';

import React from 'react';
import { X, Upload, FileText, CheckCircle, AlertCircle, ChevronDown, Loader2, ToggleLeft, ToggleRight, ArrowLeft, Sparkles, Calendar } from 'lucide-react';
import { useAccountDomain, useTransactionDomain, useCategoryDomain } from '../../hooks/useFinanceSelectors';
import { useImportWizard } from '../../hooks/useImportWizard';
import { isAIAvailable } from '../../utils/aiCategorizer';
import { formatCurrency } from '../../utils/formatters';
import { AIDateAdjuster } from './import/AIDateAdjuster';
import type { WizardStep } from '../../types/import';

interface ImportTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAISettings?: () => void;
}

/**
 * Wizard de importación de extractos (Q-godfiles). El estado y la lógica viven
 * en `useImportWizard`; este componente es la capa de presentación (3 pasos:
 * upload → review → done). El commit de dinero está aislado en
 * `useImportTransactions`, que el hook orquesta.
 */
export function ImportTransactionsModal({ isOpen, onClose, onOpenAISettings }: ImportTransactionsModalProps) {
  const { accounts } = useAccountDomain();
  const { transactions: existingTransactions } = useTransactionDomain();
  const { categories } = useCategoryDomain();
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
  } = useImportWizard({ accounts, existingTransactions, categories, onClose });

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
                {step === 'done' && 'Importación completada'}
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

          {/* ── PASO 1: UPLOAD ── */}
          {step === 'upload' && (
            <div className="space-y-5">
              {/* Cuenta destino */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Cuenta destino
                </label>
                <div className="relative">
                  <select
                    value={selectedAccountId}
                    onChange={e => handleAccountChange(e.target.value)}
                    className="w-full pl-3 pr-8 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white appearance-none focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-2xl p-5 sm:p-8 text-center cursor-pointer hover:border-purple-500 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-all"
              >
                {pdfParsing ? (
                  <Loader2 size={32} className="mx-auto mb-3 text-purple-400 animate-spin" />
                ) : (
                  <Upload size={32} className="mx-auto mb-3 text-purple-400" />
                )}
                {pdfParsing ? (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">Analizando PDF con IA...</p>
                    <p className="text-xs text-gray-400 mt-1">Gemini está extrayendo las transacciones</p>
                  </div>
                ) : fileName ? (
                  <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">{fileName}</p>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Arrastra tu extracto aquí o haz clic para seleccionar
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      CSV · Excel (.xlsx) · PDF con IA
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Bancolombia, Davivienda, BBVA, Nequi y más
                    </p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.xlsx,.xls,.pdf"
                  className="hidden"
                  onChange={handleFileChange}
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
                      onClick={() => { handleClose(); onOpenAISettings(); }}
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
          )}

          {/* ── PASO 2: REVIEW ── */}
          {step === 'review' && (
            <div className="space-y-3">
              {/* Controles bulk */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleToggleAll(true)} className="text-xs px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 transition-colors">
                    Todas
                  </button>
                  <button onClick={() => handleToggleAll(false)} className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                    Ninguna
                  </button>
                  {isAIAvailable() && (
                    <button
                      onClick={handleAICategorize}
                      disabled={aiCategorizing || includedCount === 0}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {aiCategorizing ? (
                        <><Loader2 size={12} className="animate-spin" /> Analizando...</>
                      ) : (
                        <><Sparkles size={12} /> {aiSuggestions.length > 0 ? 'Actualizar sugerencias' : aiApplied ? 'Re-categorizar con IA' : 'Categorizar con IA'}</>
                      )}
                    </button>
                  )}
                  {!isAIAvailable() && onOpenAISettings && (
                    <button
                      onClick={onOpenAISettings}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                      title={aiUnavailableMessage}
                    >
                      <Sparkles size={12} /> Activar IA para categorizar
                    </button>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {includedCount} seleccionadas
                  {rows.filter(r => r.isDuplicate).length > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {' · '}{rows.filter(r => r.isDuplicate).length} duplicados
                    </span>
                  )}
                </span>
              </div>

              {/* Ajuste masivo de año */}
              <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <Calendar size={14} className="text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-600 dark:text-gray-400">Ajustar año:</span>
                <select
                  onChange={(e) => {
                    const targetYear = parseInt(e.target.value);
                    if (!targetYear) return;
                    setRows(prev => prev.map(r => {
                      const d = new Date(r.date);
                      d.setFullYear(targetYear);
                      return { ...r, date: d };
                    }));
                  }}
                  className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  defaultValue=""
                >
                  <option value="" disabled>Cambiar todas a...</option>
                  <option value="2024">2024</option>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                </select>
                <span className="text-[10px] text-gray-400">o edita individual</span>
              </div>

              {aiApplied && (
                <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-700 dark:text-blue-300">
                  <Sparkles size={12} />
                  Categorías actualizadas con IA. Revisa y ajusta si es necesario.
                </div>
              )}

              {aiSuggestions.length > 0 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800/60 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <Sparkles size={14} className="text-blue-600 dark:text-blue-400 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">
                          Sugerencias por comercio
                        </p>
                        <p className="text-[11px] text-blue-600 dark:text-blue-300">
                          {aiSuggestions.length} grupos cubren {aiSuggestionTransactionCount} transacciones
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={handleDiscardAISuggestions}
                        className="text-xs px-2.5 py-1 rounded-lg bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-blue-100 dark:border-blue-800 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        Descartar
                      </button>
                      <button
                        onClick={handleApplyAISuggestions}
                        className="text-xs px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {aiSuggestionsByCategory.map(group => (
                      <div key={group.category} className="space-y-1.5">
                        <div className="text-[11px] font-semibold text-blue-900 dark:text-blue-100">
                          {group.category}
                        </div>
                        {group.suggestions.map(suggestion => (
                          <div
                            key={suggestion.id}
                            className="grid grid-cols-[1fr_auto] gap-2 items-center p-2 rounded-lg bg-white/80 dark:bg-gray-900/50 border border-blue-100 dark:border-blue-900/60"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">
                                  {suggestion.pattern.toUpperCase()}
                                </span>
                                <span className="text-[10px] text-gray-400 shrink-0">
                                  {suggestion.indexes.length} mov.
                                </span>
                              </div>
                              <p className="text-[10px] text-gray-400 truncate" title={suggestion.sampleDescription}>
                                {suggestion.sampleDescription} · {Math.round(suggestion.confidence * 100)}%
                              </p>
                            </div>
                            <select
                              value={suggestion.category}
                              onChange={e => handleSuggestionCategoryChange(suggestion.id, e.target.value)}
                              className="text-[11px] px-2 py-1 border border-blue-100 dark:border-blue-800 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[150px]"
                            >
                              {availableCategoryOptions.map(category => (
                                <option key={category} value={category}>{category}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tabla de transacciones */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* S15: tabla visible solo en sm+ para evitar scroll horizontal en 320-375px */}
                <div className="hidden sm:block overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm min-w-[540px]">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th scope="col" className="w-8 py-2 px-3 text-center"></th>
                        <th scope="col" className="py-2 px-3 text-left font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Fecha</th>
                        <th scope="col" className="py-2 px-3 text-left font-semibold text-gray-600 dark:text-gray-400">Descripción</th>
                        <th scope="col" className="py-2 px-3 text-left font-semibold text-gray-600 dark:text-gray-400">Categoría</th>
                        <th scope="col" className="py-2 px-3 text-center font-semibold text-gray-600 dark:text-gray-400">Tipo</th>
                        <th scope="col" className="py-2 px-3 text-right font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {rows.map((row, i) => (
                        <tr
                          key={i}
                          className={`transition-colors ${!row.include ? 'opacity-40' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                        >
                          {/* Toggle incluir */}
                          <td className="py-2 px-3 text-center">
                            <button onClick={() => handleToggleRow(i)} className="text-gray-400 hover:text-purple-600 transition-colors">
                              {row.include
                                ? <ToggleRight size={18} className="text-purple-600" />
                                : <ToggleLeft size={18} />}
                            </button>
                          </td>

                          {/* Fecha - editable */}
                          <td className="py-2 px-3 whitespace-nowrap">
                            <input
                              type="date"
                              value={row.date.toISOString().split('T')[0]}
                              onChange={(e) => {
                                const newDate = new Date(e.target.value + 'T12:00:00');
                                if (!isNaN(newDate.getTime())) {
                                  setRows(prev => prev.map((r, idx) => idx === i ? { ...r, date: newDate } : r));
                                }
                              }}
                              disabled={!row.include}
                              className="text-xs px-1.5 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500 w-[120px]"
                            />
                          </td>

                          {/* Descripción */}
                          <td className="py-2 px-3 text-gray-700 dark:text-gray-300 max-w-[200px]">
                            <span className="block truncate text-xs" title={row.description}>{row.description}</span>
                            {row.isDuplicate && (
                              <span className="inline-block text-[10px] px-1.5 py-0.5 mt-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded font-medium">
                                duplicado
                              </span>
                            )}
                          </td>

                          {/* Categoría */}
                          <td className="py-2 px-3">
                            <div className="relative">
                              <select
                                value={row.category}
                                onChange={e => handleCategoryChange(i, e.target.value)}
                                className="text-xs pl-2 pr-6 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 appearance-none focus:outline-none focus:ring-1 focus:ring-purple-500 w-full"
                                disabled={!row.include}
                              >
                                {availableCategoryOptions.map(c => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                              <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            </div>
                          </td>

                          {/* Tipo ingreso/gasto */}
                          <td className="py-2 px-3">
                            <div className="flex gap-1 justify-center">
                              <button
                                onClick={() => handleTypeChange(i, 'expense')}
                                disabled={!row.include}
                                className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${row.type === 'expense' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                              >
                                Gasto
                              </button>
                              <button
                                onClick={() => handleTypeChange(i, 'income')}
                                disabled={!row.include}
                                className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${row.type === 'income' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                              >
                                Ingreso
                              </button>
                              <button
                                onClick={() => handleTypeChange(i, 'transfer')}
                                disabled={!row.include}
                                className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${row.type === 'transfer' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                              >
                                Transferencia
                              </button>
                            </div>
                          </td>

                          {/* Monto */}
                          <td className={`py-2 px-3 text-right font-semibold text-xs whitespace-nowrap ${row.type === 'income' ? 'text-green-600 dark:text-green-400' : row.type === 'transfer' ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                            {row.type === 'income' ? '+' : row.type === 'transfer' ? '' : '-'}
                            {formatCurrency(row.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* S15: Layout en tarjetas para móvil (<sm) — sin scroll horizontal */}
                <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800 max-h-[50vh] overflow-y-auto">
                  {rows.map((row, i) => {
                    const amountColor =
                      row.type === 'income'
                        ? 'text-green-600 dark:text-green-400'
                        : row.type === 'transfer'
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-red-600 dark:text-red-400';
                    const amountSign =
                      row.type === 'income' ? '+' : row.type === 'transfer' ? '' : '-';
                    return (
                      <div
                        key={i}
                        className={`p-3 transition-colors ${!row.include ? 'opacity-40' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                      >
                        {/* Fila 1: toggle + descripción + monto */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <button
                              onClick={() => handleToggleRow(i)}
                              aria-label={row.include ? 'Excluir transacción' : 'Incluir transacción'}
                              className="flex-shrink-0 text-gray-400 hover:text-purple-600 transition-colors"
                            >
                              {row.include
                                ? <ToggleRight size={16} className="text-purple-600" />
                                : <ToggleLeft size={16} />}
                            </button>
                            <div className="min-w-0">
                              <span
                                className="block text-xs font-medium text-gray-800 dark:text-gray-200 truncate"
                                title={row.description}
                              >
                                {row.description}
                              </span>
                              {row.isDuplicate && (
                                <span className="inline-block text-[10px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded font-medium">
                                  duplicado
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`text-xs font-bold whitespace-nowrap flex-shrink-0 ${amountColor}`}>
                            {amountSign}{formatCurrency(row.amount)}
                          </span>
                        </div>

                        {/* Fila 2: fecha + categoría */}
                        <div className="flex gap-2 mb-2">
                          <input
                            type="date"
                            value={row.date.toISOString().split('T')[0]}
                            onChange={(e) => {
                              const newDate = new Date(e.target.value + 'T12:00:00');
                              if (!isNaN(newDate.getTime())) {
                                setRows(prev => prev.map((r, idx) => idx === i ? { ...r, date: newDate } : r));
                              }
                            }}
                            disabled={!row.include}
                            className="text-xs px-1.5 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500 w-[112px] flex-shrink-0"
                          />
                          <div className="flex-1 relative min-w-0">
                            <select
                              value={row.category}
                              onChange={e => handleCategoryChange(i, e.target.value)}
                              className="text-xs pl-2 pr-6 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 appearance-none focus:outline-none focus:ring-1 focus:ring-purple-500 w-full"
                              disabled={!row.include}
                            >
                              {availableCategoryOptions.map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          </div>
                        </div>

                        {/* Fila 3: tipo */}
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleTypeChange(i, 'expense')}
                            disabled={!row.include}
                            className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${row.type === 'expense' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                          >
                            Gasto
                          </button>
                          <button
                            onClick={() => handleTypeChange(i, 'income')}
                            disabled={!row.include}
                            className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${row.type === 'income' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                          >
                            Ingreso
                          </button>
                          <button
                            onClick={() => handleTypeChange(i, 'transfer')}
                            disabled={!row.include}
                            className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${row.type === 'transfer' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                          >
                            Transferencia
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── PASO 3: DONE ── */}
          {step === 'done' && result && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              {result.errors.length === 0 ? (
                <>
                  <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                    <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {result.imported} transacciones importadas
                    </p>
                    {result.skipped > 0 && (
                      <p className="text-sm text-gray-500 mt-1">{result.skipped} excluidas manualmente</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                    <AlertCircle size={32} className="text-red-600 dark:text-red-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900 dark:text-white">Error al importar</p>
                    <p className="text-sm text-gray-500 mt-1">{result.errors[0]}</p>
                    {result.imported > 0 && (
                      <p className="text-sm text-green-600 mt-1">{result.imported} transacciones guardadas antes del error</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

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
