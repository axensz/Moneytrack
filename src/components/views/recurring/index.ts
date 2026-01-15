// Barrel export for RecurringPayments module
export { RecurringPaymentsView } from './RecurringPaymentsView';

// Components (exported individually for reuse)
export { RecurringStatsCards } from './components/RecurringStatsCards';
export { UpcomingPaymentsAlert } from './components/UpcomingPaymentsAlert';
export { RecurringPaymentCard } from './components/RecurringPaymentCard';
export { PaymentFormModal } from './components/PaymentFormModal';
export { DeletePaymentModal } from './components/DeletePaymentModal';
export { InactivePaymentsList } from './components/InactivePaymentsList';

// Hooks (for extension or testing)
export { useRecurringPaymentsView } from './hooks/useRecurringPaymentsView';
