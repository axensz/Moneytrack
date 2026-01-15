'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { showToast } from '../../../../utils/toastHelpers';
import { SUCCESS_MESSAGES } from '../../../../config/constants';

interface CategoryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  addCategory: (type: 'expense' | 'income', name: string) => void;
}

/**
 * Modal para crear una nueva categoría
 */
export const CategoryFormModal: React.FC<CategoryFormModalProps> = ({
  isOpen,
  onClose,
  addCategory,
}) => {
  const [newCategory, setNewCategory] = useState<{
    type: 'expense' | 'income';
    name: string;
  }>({
    type: 'expense',
    name: '',
  });

  const handleSubmit = () => {
    try {
      addCategory(newCategory.type, newCategory.name);
      setNewCategory({ type: 'expense', name: '' });
      onClose();
      showToast.success(SUCCESS_MESSAGES.CATEGORY_ADDED);
    } catch (error) {
      showToast.error((error as Error).message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Nueva Categoría
            </h4>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X size={24} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                placeholder="Ej: Suscripciones"
                className="input-base"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={handleSubmit} className="btn-submit">
              Crear
            </button>
            <button onClick={onClose} className="btn-cancel">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
