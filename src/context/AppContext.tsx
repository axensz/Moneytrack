'use client';

import { createContext, useContext, useReducer, ReactNode } from 'react';
import { Transaction, Account, Category } from '../types';

interface AppState {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category;
  showForm: boolean;
  showAccountForm: boolean;
  showCategoryForm: boolean;
  editingAccount: Account | null;
  view: string;
  filterCategory: string;
  filterStatus: string;
  filterAccount: string;
}

type AppAction = 
  | { type: 'SET_TRANSACTIONS'; payload: Transaction[] }
  | { type: 'ADD_TRANSACTION'; payload: Transaction }
  | { type: 'DELETE_TRANSACTION'; payload: string }
  | { type: 'TOGGLE_PAID'; payload: string }
  | { type: 'SET_ACCOUNTS'; payload: Account[] }
  | { type: 'ADD_ACCOUNT'; payload: Account }
  | { type: 'UPDATE_ACCOUNT'; payload: Account }
  | { type: 'DELETE_ACCOUNT'; payload: string }
  | { type: 'SET_DEFAULT_ACCOUNT'; payload: string }
  | { type: 'SET_CATEGORIES'; payload: Category }
  | { type: 'ADD_CATEGORY'; payload: { type: 'expense' | 'income'; name: string } }
  | { type: 'DELETE_CATEGORY'; payload: { type: 'expense' | 'income'; name: string } }
  | { type: 'SET_SHOW_FORM'; payload: boolean }
  | { type: 'SET_SHOW_ACCOUNT_FORM'; payload: boolean }
  | { type: 'SET_SHOW_CATEGORY_FORM'; payload: boolean }
  | { type: 'SET_EDITING_ACCOUNT'; payload: Account | null }
  | { type: 'SET_VIEW'; payload: string }
  | { type: 'SET_FILTERS'; payload: { category?: string; status?: string; account?: string } };

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'SET_TRANSACTIONS':
      return { ...state, transactions: action.payload };
    case 'ADD_TRANSACTION':
      return { ...state, transactions: [action.payload, ...state.transactions] };
    case 'DELETE_TRANSACTION':
      return { ...state, transactions: state.transactions.filter(t => t.id !== action.payload) };
    case 'TOGGLE_PAID':
      return {
        ...state,
        transactions: state.transactions.map(t => 
          t.id === action.payload ? { ...t, paid: !t.paid } : t
        )
      };
    case 'SET_ACCOUNTS':
      return { ...state, accounts: action.payload };
    case 'ADD_ACCOUNT':
      return { ...state, accounts: [...state.accounts, action.payload] };
    case 'UPDATE_ACCOUNT':
      return {
        ...state,
        accounts: state.accounts.map(a => 
          a.id === action.payload.id ? action.payload : a
        )
      };
    case 'DELETE_ACCOUNT':
      return { ...state, accounts: state.accounts.filter(a => a.id !== action.payload) };
    case 'SET_DEFAULT_ACCOUNT':
      return {
        ...state,
        accounts: state.accounts.map(a => ({
          ...a,
          isDefault: a.id === action.payload
        }))
      };
    case 'SET_CATEGORIES':
      return { ...state, categories: action.payload };
    case 'ADD_CATEGORY':
      return {
        ...state,
        categories: {
          ...state.categories,
          [action.payload.type]: [...state.categories[action.payload.type], action.payload.name]
        }
      };
    case 'DELETE_CATEGORY':
      return {
        ...state,
        categories: {
          ...state.categories,
          [action.payload.type]: state.categories[action.payload.type].filter(c => c !== action.payload.name)
        }
      };
    case 'SET_SHOW_FORM':
      return { ...state, showForm: action.payload };
    case 'SET_SHOW_ACCOUNT_FORM':
      return { ...state, showAccountForm: action.payload };
    case 'SET_SHOW_CATEGORY_FORM':
      return { ...state, showCategoryForm: action.payload };
    case 'SET_EDITING_ACCOUNT':
      return { ...state, editingAccount: action.payload };
    case 'SET_VIEW':
      return { ...state, view: action.payload };
    case 'SET_FILTERS':
      return {
        ...state,
        filterCategory: action.payload.category || state.filterCategory,
        filterStatus: action.payload.status || state.filterStatus,
        filterAccount: action.payload.account || state.filterAccount
      };
    default:
      return state;
  }
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(appReducer, {
    transactions: [],
    accounts: [],
    categories: {
      expense: ['Alimentación', 'Transporte', 'Servicios', 'Vivienda', 'Salud', 'Entretenimiento', 'Educación', 'Otros'],
      income: ['Salario', 'Freelance', 'Inversiones', 'Otros']
    },
    showForm: false,
    showAccountForm: false,
    showCategoryForm: false,
    editingAccount: null,
    view: 'transactions',
    filterCategory: 'all',
    filterStatus: 'all',
    filterAccount: 'all'
  });

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};