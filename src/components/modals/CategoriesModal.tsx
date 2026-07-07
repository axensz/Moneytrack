'use client';

import React, { useState } from 'react';
import { X, Plus, Tag, UserRound } from 'lucide-react';
import { BaseModal } from './BaseModal';
import { DEFAULT_TRANSACTION_BENEFICIARIES, PROTECTED_CATEGORIES } from '../../config/constants';
import { showToast } from '../../utils/toastHelpers';
import { SUCCESS_MESSAGES } from '../../config/constants';

interface CategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: {
    expense: string[];
    income: string[];
  };
  addCategory: (type: 'expense' | 'income', name: string) => void | Promise<void>;
  deleteCategory: (type: 'expense' | 'income', name: string) => void | Promise<void>;
  beneficiaries: string[];
  addBeneficiary: (name: string) => void | Promise<void>;
  deleteBeneficiary: (name: string) => void | Promise<void>;
}

export const CategoriesModal: React.FC<CategoriesModalProps> = ({
  isOpen,
  onClose,
  categories,
  addCategory,
  deleteCategory,
  beneficiaries,
  addBeneficiary,
  deleteBeneficiary,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [showBeneficiaryForm, setShowBeneficiaryForm] = useState(false);
  const [newBeneficiary, setNewBeneficiary] = useState('');
  const [newCategory, setNewCategory] = useState<{
    type: 'expense' | 'income';
    name: string;
  }>({ type: 'expense', name: '' });

  const [submitting, setSubmitting] = useState(false);
  const [submittingBeneficiary, setSubmittingBeneficiary] = useState(false);

  // addCategory es async: hay que await-earlo para capturar errores (nombre
  // duplicado, fallo de Firestore) y para no mostrar el toast de éxito ni doble
  // crear ante un doble clic / Enter repetido.
  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await addCategory(newCategory.type, newCategory.name);
      setNewCategory({ type: 'expense', name: '' });
      setShowForm(false);
      showToast.success(SUCCESS_MESSAGES.CATEGORY_ADDED);
    } catch (error) {
      showToast.error((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // deleteCategory también es async y puede lanzar (p.ej. categoría en uso por
  // transacciones); sin manejarlo, el throw quedaba sin capturar y el ítem no
  // desaparecía sin explicación para el usuario.
  const handleDelete = async (type: 'expense' | 'income', name: string) => {
    try {
      await deleteCategory(type, name);
    } catch (error) {
      showToast.error((error as Error).message);
    }
  };

  const handleBeneficiarySubmit = async () => {
    if (submittingBeneficiary) return;
    setSubmittingBeneficiary(true);
    try {
      await addBeneficiary(newBeneficiary);
      setNewBeneficiary('');
      setShowBeneficiaryForm(false);
      showToast.success('Persona agregada');
    } catch (error) {
      showToast.error((error as Error).message);
    } finally {
      setSubmittingBeneficiary(false);
    }
  };

  const handleBeneficiaryDelete = async (name: string) => {
    try {
      await deleteBeneficiary(name);
      showToast.success('Persona eliminada');
    } catch (error) {
      showToast.error((error as Error).message);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Categorías y personas"
      titleIcon={<Tag size={24} className="text-primary" />}
      maxWidth="max-w-2xl"
    >
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-h-[calc(90vh-80px)] overflow-y-auto">
        {/* Header con botón */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Administra tus categorías de ingresos y gastos.
          </p>
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn-primary text-sm shrink-0"
            aria-expanded={showForm}
          >
            <Plus size={16} />
            Nueva
          </button>
        </div>

        {/* Formulario inline */}
        {showForm && (
          <div className="p-4 bg-muted rounded-xl border border-border space-y-3">
            <div>
              <span className="label-base" id="new-cat-type-label">Tipo</span>
              <div className="flex gap-2" role="group" aria-labelledby="new-cat-type-label">
                <button
                  type="button"
                  onClick={() => setNewCategory({ ...newCategory, type: 'expense' })}
                  className={`btn-type ${newCategory.type === 'expense' ? 'btn-type-active-destructive' : 'btn-type-inactive'}`}
                >
                  Gasto
                </button>
                <button
                  type="button"
                  onClick={() => setNewCategory({ ...newCategory, type: 'income' })}
                  className={`btn-type ${newCategory.type === 'income' ? 'btn-type-active-success' : 'btn-type-inactive'}`}
                >
                  Ingreso
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="new-cat-name" className="label-base">Nombre</label>
              <input
                id="new-cat-name"
                type="text"
                value={newCategory.name}
                onChange={(e) =>
                  setNewCategory({ ...newCategory, name: e.target.value })
                }
                placeholder="Ej: Suscripciones"
                className="input-base"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                }}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSubmit} disabled={submitting} className="btn-submit text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                Crear
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setNewCategory({ type: 'expense', name: '' });
                }}
                className="btn-cancel text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Listas de categorías */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {/* Gastos */}
          <div>
            <h5 className="flex items-center gap-2 text-sm font-semibold mb-3 text-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" aria-hidden="true" />
              Gastos ({categories.expense.length})
            </h5>
            <div className="space-y-0.5 max-h-48 sm:max-h-64 overflow-y-auto">
              {categories.expense.length === 0 ? (
                <EmptyCategories type="expense" />
              ) : (
                categories.expense.map((cat) => (
                  <CategoryItem
                    key={cat}
                    name={cat}
                    type="expense"
                    isProtected={(
                      PROTECTED_CATEGORIES.expense as readonly string[]
                    ).includes(cat)}
                    onDelete={() => handleDelete('expense', cat)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Ingresos */}
          <div>
            <h5 className="flex items-center gap-2 text-sm font-semibold mb-3 text-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
              Ingresos ({categories.income.length})
            </h5>
            <div className="space-y-0.5 max-h-48 sm:max-h-64 overflow-y-auto">
              {categories.income.length === 0 ? (
                <EmptyCategories type="income" />
              ) : (
                categories.income.map((cat) => (
                  <CategoryItem
                    key={cat}
                    name={cat}
                    type="income"
                    isProtected={(
                      PROTECTED_CATEGORIES.income as readonly string[]
                    ).includes(cat)}
                    onDelete={() => handleDelete('income', cat)}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4 sm:pt-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h5 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <UserRound size={16} className="text-primary" aria-hidden="true" />
                Personas / Beneficiarios ({beneficiaries.length})
              </h5>
              <p className="text-xs text-muted-foreground mt-1">
                Etiquetas para saber para quién fue cada movimiento.
              </p>
            </div>
            <button
              onClick={() => setShowBeneficiaryForm(!showBeneficiaryForm)}
              className="btn-primary text-sm shrink-0"
              aria-expanded={showBeneficiaryForm}
            >
              <Plus size={16} />
              Nueva
            </button>
          </div>

          {showBeneficiaryForm && (
            <div className="p-4 bg-muted rounded-xl border border-border space-y-3">
              <div>
                <label htmlFor="new-beneficiary-name" className="label-base">Nombre</label>
                <input
                  id="new-beneficiary-name"
                  type="text"
                  value={newBeneficiary}
                  onChange={(e) => setNewBeneficiary(e.target.value)}
                  placeholder="Ej: Ana, Padres, Casa"
                  className="input-base"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleBeneficiarySubmit();
                  }}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={handleBeneficiarySubmit} disabled={submittingBeneficiary} className="btn-submit text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  Crear
                </button>
                <button
                  onClick={() => {
                    setShowBeneficiaryForm(false);
                    setNewBeneficiary('');
                  }}
                  className="btn-cancel text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {beneficiaries.map((beneficiary) => (
              <BeneficiaryItem
                key={beneficiary}
                name={beneficiary}
                isProtected={(DEFAULT_TRANSACTION_BENEFICIARIES as readonly string[]).includes(beneficiary)}
                onDelete={() => handleBeneficiaryDelete(beneficiary)}
              />
            ))}
          </div>
        </div>
      </div>
    </BaseModal>
  );
};

// Sub-componente para cada categoría
interface CategoryItemProps {
  name: string;
  type: 'expense' | 'income';
  isProtected: boolean;
  onDelete: () => void;
}

const CategoryItem: React.FC<CategoryItemProps> = ({
  name,
  type,
  isProtected,
  onDelete,
}) => {
  // COLOR = ESTADO: gasto → destructive (rojo), ingreso → success (verde).
  // El violet es marca, NUNCA estado, así que no tiñe ninguna categoría; aquí
  // solo es un punto de acento pequeño (no una tarjeta con borde tintado).
  const dotColor = type === 'expense' ? 'bg-destructive' : 'bg-success';

  return (
    <div className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`}
        aria-hidden="true"
      />
      <span className="flex-1 truncate text-sm text-foreground">{name}</span>
      {!isProtected && (
        // Se revela en hover/foco (puntero fino) y queda siempre visible en
        // pantallas táctiles (pointer-coarse) para no romper la a11y.
        <button
          onClick={onDelete}
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
          aria-label={`Eliminar categoría ${name}`}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};

interface BeneficiaryItemProps {
  name: string;
  isProtected: boolean;
  onDelete: () => void;
}

const BeneficiaryItem: React.FC<BeneficiaryItemProps> = ({
  name,
  isProtected,
  onDelete,
}) => (
  <div className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted">
    <UserRound size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
    <span className="flex-1 truncate text-sm text-foreground">{name}</span>
    {!isProtected && (
      <button
        onClick={onDelete}
        className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
        aria-label={`Eliminar persona ${name}`}
      >
        <X size={14} />
      </button>
    )}
  </div>
);

// Estado vacío por columna: enseña la acción para crear la primera categoría.
const EmptyCategories: React.FC<{ type: 'expense' | 'income' }> = ({ type }) => (
  <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
    <p className="text-sm text-muted-foreground">
      Aún no tienes categorías de {type === 'expense' ? 'gastos' : 'ingresos'}.
      Crea una con <span className="font-medium text-foreground">Nueva</span>.
    </p>
  </div>
);
