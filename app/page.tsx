'use client';

import FinanceTracker from '../src/finance-tracker';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

export default function Home() {
  return (
    <ErrorBoundary>
      <FinanceTracker />
    </ErrorBoundary>
  );
}