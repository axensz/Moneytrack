# Guest ledger recovery

MoneyTrack treats the versioned guest envelope as the only authoritative local snapshot for accounts, transactions, debts, and recurring payments.

## When a write exceeds browser quota

- The mutation rejects and the application must not show success.
- React and same-tab subscribers keep the last verified envelope.
- `moneytrack_guest_ledger_v1` remains the current authority.
- `moneytrack_guest_ledger_previous_v1` retains exactly the immediately previous verified version. A failed next write may refresh it with the still-current version, but never with an unverified candidate.
- The user should export or migrate the verified data before clearing browser storage. Retrying the same operation is safe after freeing space.

## Export and rollback

`exportGuestLedgerRecovery()` returns a JSON package with the raw current and previous envelopes plus the export timestamp. Keep that package unchanged as evidence before any manual recovery.

Recovery is explicit: validate both envelopes, prefer the valid envelope with the highest revision, and write it back under `moneytrack_guest_ledger_v1`. Do not merge arrays by hand and do not delete either local key until the restored envelope has been read back and validated. Automatic repair of real financial data is prohibited.

Legacy keys (`accounts`, `transactions`, `debts`, and `recurringPayments`) are removed only after the first envelope is written and read back successfully. If cleanup is interrupted, the verified envelope remains authoritative and the next initialization finishes removing those legacy keys without importing them twice.
