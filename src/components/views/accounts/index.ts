/**
 * Accounts Module
 * 
 * Exporta el componente principal de cuentas y sus dependencias
 * para ser utilizado en el resto de la aplicación.
 * 
 * Uso:
 * import { AccountsView } from '@/components/views/accounts';
 */

export { AccountsView } from './AccountsView';

// Componentes (por si se necesitan individualmente)
export { AccountFormModal } from './components/AccountFormModal';
export { CategoryFormModal } from './components/CategoryFormModal';
export { DeleteConfirmModal } from './components/DeleteConfirmModal';
export { AccountCard } from './components/AccountCard';
export { CategoriesList } from './components/CategoriesList';

// Hooks
export { useDragAndDrop } from './hooks/useDragAndDrop';
export { useAccountForm } from './hooks/useAccountForm';
