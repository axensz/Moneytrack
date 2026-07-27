import {
  Activity,
  BarChart3,
  Download,
  Edit2,
  FilterX,
  HandCoins,
  PieChart,
  Plus,
  RefreshCw,
  Repeat,
  Save,
  Search,
  Settings,
  Sparkles,
  Target,
  Trash2,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ViewType } from '../types/finance';

type SectionLabels = {
  nav: string;
  title: string;
};

export const SECTION_LABELS = {
  transactions: { nav: 'Transacciones', title: 'Transacciones' },
  accounts: { nav: 'Cuentas', title: 'Cuentas' },
  recurring: { nav: 'Periódicos', title: 'Pagos periódicos' },
  debts: { nav: 'Préstamos', title: 'Préstamos y deudas' },
  budgets: { nav: 'Presupuestos', title: 'Presupuestos' },
  'financial-plan': { nav: 'Plan financiero', title: 'Plan financiero' },
  goals: { nav: 'Metas', title: 'Metas de ahorro' },
  stats: { nav: 'Estadísticas', title: 'Estadísticas' },
} as const satisfies Record<ViewType, SectionLabels>;

export interface NavTab {
  key: ViewType;
  label: string;
  icon: LucideIcon;
}

export const NAV_TABS: NavTab[] = [
  { key: 'transactions', label: SECTION_LABELS.transactions.nav, icon: Activity },
  { key: 'accounts', label: SECTION_LABELS.accounts.nav, icon: Wallet },
  { key: 'recurring', label: SECTION_LABELS.recurring.nav, icon: Repeat },
  { key: 'debts', label: SECTION_LABELS.debts.nav, icon: HandCoins },
  { key: 'budgets', label: SECTION_LABELS.budgets.nav, icon: PieChart },
  { key: 'goals', label: SECTION_LABELS.goals.nav, icon: Target },
  { key: 'stats', label: SECTION_LABELS.stats.nav, icon: BarChart3 },
  { key: 'financial-plan', label: SECTION_LABELS['financial-plan'].nav, icon: Sparkles },
];

export const navTabLabel = (key: ViewType): string =>
  SECTION_LABELS[key]?.nav ?? key;

export const sectionTitle = (key: ViewType): string =>
  SECTION_LABELS[key]?.title ?? navTabLabel(key);

export const VIEW_SHORTCUTS: readonly {
  key: string;
  view: ViewType;
  description: string;
}[] = [
  { key: '1', view: 'transactions', description: `Ir a ${sectionTitle('transactions')}` },
  { key: '2', view: 'accounts', description: `Ir a ${sectionTitle('accounts')}` },
  { key: '3', view: 'recurring', description: `Ir a ${sectionTitle('recurring')}` },
  { key: '4', view: 'debts', description: `Ir a ${sectionTitle('debts')}` },
  { key: '5', view: 'budgets', description: `Ir a ${sectionTitle('budgets')}` },
  { key: '6', view: 'goals', description: `Ir a ${sectionTitle('goals')}` },
  { key: '7', view: 'stats', description: `Ir a ${sectionTitle('stats')}` },
  { key: '8', view: 'financial-plan', description: `Ir a ${sectionTitle('financial-plan')}` },
];

export const UI_TEXT = {
  actions: {
    add: 'Agregar',
    cancel: 'Cancelar',
    clear: 'Limpiar',
    close: 'Cerrar',
    configure: 'Configurar',
    create: 'Crear',
    delete: 'Eliminar',
    edit: 'Editar',
    export: 'Exportar',
    new: 'Nuevo',
    newFeminine: 'Nueva',
    retry: 'Reintentar',
    save: 'Guardar',
    update: 'Actualizar',
  },
  states: {
    loading: 'Cargando...',
    saving: 'Guardando...',
  },
  titles: {
    helpManual: 'Manual de usuario',
    notificationSettings: 'Configuración de notificaciones',
    newAccount: 'Nueva cuenta',
    editAccount: 'Editar cuenta',
    newTransaction: 'Nueva transacción',
  },
  aria: {
    close: 'Cerrar',
    mainNavigation: 'Navegación principal',
    moreSections: 'Más secciones',
  },
} as const;

export const ACTION_ICONS = {
  clear: FilterX,
  close: X,
  configure: Settings,
  delete: Trash2,
  edit: Edit2,
  export: Download,
  new: Plus,
  retry: RefreshCw,
  save: Save,
  search: Search,
} as const satisfies Record<string, LucideIcon>;
