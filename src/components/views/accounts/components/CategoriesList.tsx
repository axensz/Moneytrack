'use client';

import React from 'react';
import { X } from 'lucide-react';
import { PROTECTED_CATEGORIES } from '../../../../config/constants';

interface CategoriesListProps {
  categories: {
    expense: string[];
    income: string[];
  };
  deleteCategory: (type: 'expense' | 'income', name: string) => void;
}

/**
 * Lista de categorías de gastos e ingresos
 */
export const CategoriesList: React.FC<CategoriesListProps> = ({
  categories,
  deleteCategory,
}) => {
  return (
    <div className="mt-8">
      <h4 className="text-base font-semibold mb-4 text-gray-900 dark:text-gray-100">
        Categorías
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Gastos */}
        <div>
          <h5 className="text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">
            Gastos
          </h5>
          <div className="space-y-2">
            {categories.expense.map((cat) => (
              <CategoryItem
                key={cat}
                name={cat}
                type="expense"
                isProtected={(PROTECTED_CATEGORIES.expense as readonly string[]).includes(cat)}
                onDelete={() => deleteCategory('expense', cat)}
              />
            ))}
          </div>
        </div>

        {/* Ingresos */}
        <div>
          <h5 className="text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">
            Ingresos
          </h5>
          <div className="space-y-2">
            {categories.income.map((cat) => (
              <CategoryItem
                key={cat}
                name={cat}
                type="income"
                isProtected={(PROTECTED_CATEGORIES.income as readonly string[]).includes(cat)}
                onDelete={() => deleteCategory('income', cat)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
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
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};
