## ADDED Requirements

### Requirement: Exact account operation lock states
The system MUST persist `accountOperationLock` as an exact state map and MUST NOT retain fields from its previous state.

#### Scenario: Acquire after a released tombstone
- **WHEN** a client acquires a new account operation lease after a previous operation left a release tombstone
- **THEN** the persisted map contains only `id`, `kind`, and `acquiredAt`
- **THEN** the deployed Firestore rules accept the write

#### Scenario: Release an active lease
- **WHEN** the owner releases the currently active operation with the same id and kind
- **THEN** the persisted map contains only `id`, `kind`, and `releasedAt`
- **THEN** `accountOperationLockIsActive` evaluates to false

#### Scenario: Renew an owned lease
- **WHEN** a long-running operation renews its current lease
- **THEN** the renewed map contains only `id`, `kind`, and the new server `acquiredAt`
- **THEN** no previous `releasedAt` or legacy `expiresAt` survives

### Requirement: Shared operations use the same lock protocol
The system MUST use the exact lock-state protocol for deleting accounts, merging credit cards, changing the default account, deleting debts, and reassigning a debt account.

#### Scenario: Any consumer completes successfully
- **WHEN** one of the shared operations commits its final atomic write
- **THEN** the same commit releases its lease with an exact release tombstone
- **THEN** another valid operation can subsequently acquire the lease

#### Scenario: A concurrent operation owns the lease
- **WHEN** a second client attempts a protected operation while another non-expired lease is active
- **THEN** the second operation writes no financial or reference data
- **THEN** the user receives an actionable busy-operation message

### Requirement: Failed protected operations remain observable and atomic
The system MUST surface protected-operation failures to the user and MUST preserve the last committed state when the final commit is rejected.

#### Scenario: Firestore rejects the final commit
- **WHEN** Firestore returns `permission-denied` or another write failure
- **THEN** no subset of the debt, account, transaction, or credit mutations is committed
- **THEN** the interaction remains open or recoverable
- **THEN** an error toast explains that the operation was not completed

#### Scenario: Safe batch capacity is exceeded
- **WHEN** a protected operation would exceed the configured rule-safe write limit
- **THEN** the system aborts before its first data mutation
- **THEN** the user receives the existing safe-limit guidance

### Requirement: Rules-level lock regression coverage
The lock contract MUST be exercised against the repository's actual `firestore.rules`, not only mocked SDK calls.

#### Scenario: Emulator contract suite runs
- **WHEN** the focused rules test acquires, renews, releases, and reacquires a lease as the owner
- **THEN** every valid transition succeeds
- **THEN** a deliberately merged map containing both `acquiredAt` and `releasedAt` is rejected

#### Scenario: A non-owner attempts a lock transition
- **WHEN** another authenticated user writes the owner's lock document
- **THEN** the emulator rejects the operation
