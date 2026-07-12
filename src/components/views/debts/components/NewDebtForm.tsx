import React from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarClock } from 'lucide-react';
import { formatNumberForInput, unformatNumber } from '../../../../utils/formatters';
import type { Account } from '../../../../types/finance';
import type { DebtFormData } from '../utils/debtForm';
import type { PaymentScheduleFormState } from '../utils/paymentScheduleForm';
import { PaymentScheduleFields } from './PaymentScheduleFields';

interface NewDebtFormProps {
  accounts: Account[];
  formData: DebtFormData;
  isSubmitting: boolean;
  paymentSchedule: PaymentScheduleFormState;
  onCancel: () => void;
  onSubmit: () => void;
  setFormData: React.Dispatch<React.SetStateAction<DebtFormData>>;
  setPaymentSchedule: React.Dispatch<React.SetStateAction<PaymentScheduleFormState>>;
}

export const NewDebtForm: React.FC<NewDebtFormProps> = ({
  accounts,
  formData,
  isSubmitting,
  paymentSchedule,
  onCancel,
  onSubmit,
  setFormData,
  setPaymentSchedule,
}) => {
  const selectedAccount = accounts.find(account => account.id === formData.accountId);
  const isCreditSelected = selectedAccount?.type === 'credit';

  return (
    <div className="bg-muted rounded-xl p-5 mb-6 space-y-4 border border-border shadow-sm">
      <div className="flex gap-3 mb-4">
        <button
          onClick={() => setFormData(form => ({ ...form, type: 'lent' }))}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-[background-color,box-shadow,transform,color] shadow-md hover:shadow-lg ${formData.type === 'lent'
            ? 'bg-primary-solid text-white ring-2 ring-primary scale-105'
            : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
          }`}
        >
          <ArrowUpRight size={16} className="inline mr-2" />
          Yo presté
        </button>
        <button
          onClick={() => setFormData(form => ({ ...form, type: 'borrowed' }))}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-[background-color,box-shadow,transform,color] shadow-md hover:shadow-lg ${formData.type === 'borrowed'
            ? 'bg-primary-solid text-white ring-2 ring-primary scale-105'
            : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
          }`}
        >
          <ArrowDownLeft size={16} className="inline mr-2" />
          Me prestaron
        </button>
      </div>

      <input type="text" value={formData.personName} onChange={event => setFormData(form => ({ ...form, personName: event.target.value }))} placeholder="Nombre de la persona" className="input-base" />
      <input type="text" inputMode="numeric" value={formatNumberForInput(formData.originalAmount)} onChange={event => setFormData(form => ({ ...form, originalAmount: unformatNumber(event.target.value) }))} placeholder="Monto" className="input-base" />
      <input type="text" value={formData.description} onChange={event => setFormData(form => ({ ...form, description: event.target.value }))} placeholder="Descripción (opcional)" className="input-base" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            {formData.type === 'lent' ? 'Fecha del préstamo' : 'Fecha en que recibí'}
          </label>
          <input type="date" value={formData.lentDate} onChange={event => setFormData(form => ({ ...form, lentDate: event.target.value }))} className="input-base" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Vencimiento <span className="text-muted-foreground font-normal">(opcional)</span>
          </label>
          <input type="date" value={formData.dueDate} onChange={event => setFormData(form => ({ ...form, dueDate: event.target.value }))} className="input-base" />
        </div>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400">
          <CalendarClock size={14} />
          Próximo pago <span className="text-muted-foreground font-normal">(opcional)</span>
        </label>
        <PaymentScheduleFields value={paymentSchedule} onChange={setPaymentSchedule} />
      </div>

      <select value={formData.accountId} onChange={event => setFormData(form => ({ ...form, accountId: event.target.value }))} className="input-base">
        <option value="">Sin cuenta asociada (solo seguimiento)</option>
        {accounts.map(account => (
          <option key={account.id} value={account.id}>
            {account.name}{account.type === 'credit' ? ' (Tarjeta de crédito)' : ''}
          </option>
        ))}
      </select>
      <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
        {!formData.accountId
          ? 'Si eliges una cuenta, el préstamo y sus pagos moverán su saldo automáticamente.'
          : isCreditSelected
            ? (formData.type === 'lent'
                ? 'Se cargará a tu tarjeta (consume cupo). Los cobros abonarán a la tarjeta y liberan cupo.'
                : 'Se abonará a tu tarjeta (reduce el saldo usado). Los pagos volverán a cargarla.')
            : (formData.type === 'lent'
                ? 'Se registrará un gasto en esa cuenta (sale el dinero). Los cobros entrarán como ingreso.'
                : 'Se registrará un ingreso en esa cuenta (entra el dinero). Los pagos saldrán como gasto.')}
      </p>

      <div className="flex gap-3">
        <button onClick={onSubmit} disabled={isSubmitting} className="btn-submit flex-1 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
          {isSubmitting ? 'Guardando...' : 'Registrar'}
        </button>
        <button onClick={onCancel} disabled={isSubmitting} className="btn-cancel flex-1 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
          Cancelar
        </button>
      </div>
    </div>
  );
};
