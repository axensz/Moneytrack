'use client';

import React, { useState } from 'react';
import { X, Plus, Tag } from 'lucide-react';
import { BaseModal } from './BaseModal';
import { PROTECTED_CATEGORIES } from '../../config/constants';
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
}

export const CategoriesModal: React.FC<CategoriesModalProps> = ({
  isOpen,
  onClose,
  categories,
  addCategory,
  deleteCategory,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [newCategory, setNewCategory] = useState<{
    type: 'expense' | 'income';
    name: string;
  }>({ type: 'expense', name: '' });

  const [submitting, setSubmitting] = useState(false);

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

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Categorías"
      titleIcon={<Tag size={24} className="text-primary" />}
      maxWidth="max-w-2xl"
    >
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-h-[calc(90vh-80px)] overflow-y-auto">
        {/* Header con botón */}
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            Administra tus categorías de ingresos y gastos.
          </p>
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn-primary text-sm"
          >
            <Plus size={16} />
            Nueva
          </button>
        </div>

        {/* Formulario inline */}
        {showForm && (
          <div className="p-4 bg-muted rounded-xl border border-border space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-base">Tipo</label>
                <select
                  value={newCategory.type}
                  onChange={(e) =>
                    setNewCategory({
                      ...newCategory,
                      type: e.target.value as 'expense' | 'income',
                    })
                  }
                  className="input-base"
                >
                  <option value="expense">Gasto</option>
                  <option value="income">Ingreso</option>
                </select>
              </div>
              <div>
                <label className="label-base">Nombre</label>
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={(e) =>
                    setNewCategory({ ...newCategory, name: e.target.value })
                  }
                  placeholder="Ej: Suscripciones"
                  className="input-base"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSubmit();
                  }}
                />
              </div>
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
            <h5 className="text-sm font-semibold mb-3 text-foreground">
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
            <h5 className="text-sm font-semibold mb-3 text-foreground">
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

// Estado vacío por columna: enseña la acción para crear la primera categoría.
const EmptyCategories: React.FC<{ type: 'expense' | 'income' }> = ({ type }) => (
  <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
    <p className="text-sm text-muted-foreground">
      Aún no tienes categorías de {type === 'expense' ? 'gastos' : 'ingresos'}.
      Crea una con <span className="font-medium text-foreground">Nueva</span>.
    </p>
  </div>
);
