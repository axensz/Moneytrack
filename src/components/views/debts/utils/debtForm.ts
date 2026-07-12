import { formatDateForInput } from '../../../../utils/formatters';

export interface DebtFormData {
  personName: string;
  type: 'lent' | 'borrowed';
  originalAmount: string;
  description: string;
  accountId: string;
  lentDate: string;
  dueDate: string;
}

export const createInitialDebtFormData = (): DebtFormData => ({
  personName: '',
  type: 'lent',
  originalAmount: '',
  description: '',
  accountId: '',
  lentDate: formatDateForInput(new Date()),
  dueDate: '',
});
