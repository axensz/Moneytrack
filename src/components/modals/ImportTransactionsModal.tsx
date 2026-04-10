'use client';

import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, FileText, CheckCircle, AlertCircle, ChevronDown, Loader2, ToggleLeft, ToggleRight, ArrowLeft } from 'lucide-react';
import { useFinance } from '../../contexts/FinanceContext';
import { useAuth } from '../../hooks/useAuth';
import { useImportTransactions } from '../../hooks/useImportTransactions';
import { parseCSV } from '../../utils/csvParser';
import { DEFAULT_CATEGORIES } from '../../config/constants';
import type { ImportRow } from '../../hooks/useImportTransactions';

interface ImportTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'upload' | 'review' | 'done';

const ALL_CATEGORIES = [
  ...DEFAULT_CATEGORIES.expense,
  ...DEFAULT_CATEGORIES.income,
];

export function ImportTransactionsModal({ isOpen, onClose }: ImportTransactionsModalProps) {
  const { accounts } = useFinance();
  const { user } = useAuth();
  const { importTransactions, status, progress, result, reset } = useImportTransactions(user?.uid || null);

  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [parseError, setParseError] = useState('');
  const [fileName, setFileName] = useState('');
  const [parseStats, setParseStats] = useState<{ total: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nonCreditAccounts = accounts.filter(a => a.type !== 'credit');
  const creditAccounts = accounts.filter(a => a.type === 'credit');

  const handleClose = useCallback(() => {
    setStep('upload');
    setRows([]);
    setSelectedAccountId('');
    setParseError('');
    setFileName('');
    setParseStats(null);
    reset();
    onClose();
  }, [onClose, reset]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = parseCSV(text);

      if (result.rows.length === 0) {
        setParseError(
          result.errors.length > 0
            ? result.errors.join('. ')
            : 'No se encontraron transacciones válidas. Verifica que el archivo tenga columnas de fecha, descripción y monto.'
        );
        return;
      }

      setParseStats({ total: result.rows.length, skipped: result.skippedRows });

      const accountId = selectedAccountId || nonCreditAccounts[0]?.id || accounts[0]?.id || '';
      setRows(
        result.rows.map(r => ({
          ...r,
          category: r.suggestedCategory,
          accountId,
          include: true,
        }))
      );
    };
    reader.readAsText(file, 'UTF-8');
  }, [selectedAccountId, accounts, nonCreditAccounts]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    // Reusar la lógica del input
    const dt = new DataTransfer();
    dt.items.add(file);
    if (fileInputRef.current) {
      fileInputRef.current.files = dt.files;
      fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, []);

  const handleAccountChange = useCallback((accountId: string) => {
    setSelectedAccountId(accountId);
    setRows(prev => prev.map(r => ({ ...r, accountId })));
  }, []);

  const handleToggleRow = useCallback((index: number) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, include: !r.include } : r));
  }, []);

  const handleToggleAll = useCallback((include: boolean) => {
    setRows(prev => prev.map(r => ({ ...r, include })));
  }, []);

  const handleCategoryChange = useCallback((index: number, category: string) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, category } : r));
  }, []);

  const handleTypeChange = useCallback((index: number, type: 'income' | 'expense') => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, type } : r));
  }, []);

  const handleImport = useCallback(async () => {
    await importTransactions(rows);
    setStep('done');
  }, [importTransactions, rows]);

  const includedCount = rows.filter(r => r.include).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
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
        <div className="flex items-center gap-0 px-6 pt-4">
          {(['upload', 'review', 'done'] as Step[]).map((s, i) => (
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
        <div className="flex-1 overflow-y-auto px-6 py-4">

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
                className="border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-2xl p-8 text-center cursor-pointer hover:border-purple-500 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-all"
              >
                <Upload size={32} className="mx-auto mb-3 text-purple-400" />
                {fileName ? (
                  <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">{fileName}</p>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Arrastra tu extracto aquí o haz clic para seleccionar
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Formato CSV — Bancolombia, Davivienda, BBVA, Nequi y más</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
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

              {/* Stats del parse */}
              {parseStats && rows.length > 0 && (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl text-sm text-green-700 dark:text-green-400">
                  <CheckCircle size={16} className="flex-shrink-0" />
                  <span>
                    <strong>{rows.length} transacciones</strong> detectadas
                    {parseStats.skipped > 0 && `, ${parseStats.skipped} filas ignoradas (sin fecha o monto válido)`}
                  </span>
                </div>
              )}

              {/* Tip */}
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-xs text-blue-700 dark:text-blue-300">
                <strong>Tip:</strong> En tu banco, busca la opción "Descargar movimientos" o "Exportar" en formato CSV. El archivo debe tener columnas de fecha, descripción y monto.
              </div>
            </div>
          )}

          {/* ── PASO 2: REVIEW ── */}
          {step === 'review' && (
            <div className="space-y-3">
              {/* Controles bulk */}
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <button onClick={() => handleToggleAll(true)} className="text-xs px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 transition-colors">
                    Todas
                  </button>
                  <button onClick={() => handleToggleAll(false)} className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                    Ninguna
                  </button>
                </div>
                <span className="text-xs text-gray-500">
                  {includedCount} seleccionadas · {rows.length - includedCount} excluidas
                </span>
              </div>

              {/* Tabla de transacciones */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="w-8 py-2 px-3 text-center"></th>
                        <th className="py-2 px-3 text-left font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Fecha</th>
                        <th className="py-2 px-3 text-left font-semibold text-gray-600 dark:text-gray-400">Descripción</th>
                        <th className="py-2 px-3 text-left font-semibold text-gray-600 dark:text-gray-400">Categoría</th>
                        <th className="py-2 px-3 text-center font-semibold text-gray-600 dark:text-gray-400">Tipo</th>
                        <th className="py-2 px-3 text-right font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Monto</th>
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

                          {/* Fecha */}
                          <td className="py-2 px-3 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">
                            {row.date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' })}
                          </td>

                          {/* Descripción */}
                          <td className="py-2 px-3 text-gray-700 dark:text-gray-300 max-w-[200px]">
                            <span className="block truncate text-xs" title={row.description}>{row.description}</span>
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
                                {ALL_CATEGORIES.map(c => (
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
                            </div>
                          </td>

                          {/* Monto */}
                          <td className={`py-2 px-3 text-right font-semibold text-xs whitespace-nowrap ${row.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {row.type === 'income' ? '+' : '-'}
                            {row.amount.toLocaleString('es-CO')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 flex justify-between gap-3">
          {step === 'upload' && (
            <>
              <button onClick={handleClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => setStep('review')}
                disabled={rows.length === 0 || !selectedAccountId}
                className="px-5 py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="px-5 py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
