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
  addCategory: (type: 'expense' | 'income', name: string) => void;
  deleteCategory: (type: 'expense' | 'income', name: string) => void;
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

  const handleSubmit = () => {
    try {
      addCategory(newCategory.type, newCategory.name);
      setNewCategory({ type: 'expense', name: '' });
      setShowForm(false);
      showToast.success(SUCCESS_MESSAGES.CATEGORY_ADDED);
    } catch (error) {
      showToast.error((error as Error).message);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Categorías"
      titleIcon={<Tag size={24} className="text-purple-600" />}
      maxWidth="max-w-lg"
    >
      <div className="p-5 sm:p-6 space-y-6">
        {/* Header con botón */}
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
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
          <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-200 dark:border-purple-800 space-y-3">
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
              <button onClick={handleSubmit} className="btn-submit text-sm">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Gastos */}
          <div>
            <h5 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">
              Gastos ({categories.expense.length})
            </h5>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {categories.expense.map((cat) => (
                <CategoryItem
                  key={cat}
                  name={cat}
                  type="expense"
                  isProtected={(
                    PROTECTED_CATEGORIES.expense as readonly string[]
                  ).includes(cat)}
                  onDelete={() => deleteCategory('expense', cat)}
                />
              ))}
            </div>
          </div>

          {/* Ingresos */}
          <div>
            <h5 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">
              Ingresos ({categories.income.length})
            </h5>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {categories.income.map((cat) => (
                <CategoryItem
                  key={cat}
                  name={cat}
                  type="income"
                  isProtected={(
                    PROTECTED_CATEGORIES.income as readonly string[]
                  ).includes(cat)}
                  onDelete={() => deleteCategory('income', cat)}
                />
              ))}
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
  const colors = {
    expense: {
      bg: 'bg-rose-50 dark:bg-rose-900/20',
      border: 'border-rose-200 dark:border-rose-800',
      hover: 'hover:bg-rose-100 dark:hover:bg-rose-900/30',
    },
    income: {
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      border: 'border-purple-200 dark:border-purple-800',
      hover: 'hover:bg-purple-100 dark:hover:bg-purple-900/30',
    },
  };

  const style = colors[type];

  return (
    <div
      className={`flex justify-between items-center p-2.5 ${style.bg} border ${style.border} rounded-lg ${style.hover} transition-colors`}
    >
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
        {name}
      </span>
      {!isProtected && (
        <button
          onClick={onDelete}
          className="p-1 text-gray-400 hover:text-rose-600 rounded transition-colors"
          aria-label={`Eliminar categoría ${name}`}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};
