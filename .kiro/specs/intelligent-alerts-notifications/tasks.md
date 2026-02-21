# Implementation Plan: Intelligent Alerts and Notifications System

## Overview

This implementation plan breaks down the Intelligent Alerts and Notifications System into incremental, testable steps. The approach follows a bottom-up strategy: first establishing core data models and infrastructure, then building monitoring services, and finally implementing the UI layer. Each task builds on previous work, with property-based tests integrated throughout to catch errors early.

## Tasks

- [x] 1. Set up notification data models and types
  - Create TypeScript interfaces for Notification, NotificationMetadata, NotificationPreferences
  - Add notification types to src/types/finance.ts
  - Define NotificationFilter and helper types
  - _Requirements: All requirements (foundational)_

- [x] 2. Implement Notification Store (persistence layer)
  - [x] 2.1 Create useNotificationStore hook for Firestore/localStorage abstraction
    - Implement Firestore subscription for authenticated users
    - Implement localStorage operations for guest mode
    - Handle automatic 30-day pruning on initialization
    - Enforce 100 notification limit with FIFO deletion
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 12.3, 12.4_
  
  - [x] 2.2 Write property test for notification storage routing
    - **Property 23: Notifications are stored in the correct location based on auth state**
    - **Validates: Requirements 9.1, 9.2**
  
  - [x] 2.3 Write property test for notification pruning
    - **Property 25: Old notifications are automatically pruned**
    - **Validates: Requirements 9.4**
  
  - [x] 2.4 Write property test for storage limit enforcement
    - **Property 35: Notification storage is limited to 100 per user**
    - **Validates: Requirements 12.3, 12.4**

- [x] 3. Implement Notification Preferences management
  - [x] 3.1 Create useNotificationPreferences hook
    - Load preferences from Firestore/localStorage
    - Provide update function with validation
    - Set default preferences on first load
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [x] 3.2 Write property test for preference updates
    - **Property 21: Updated thresholds are applied to future alerts**
    - **Validates: Requirements 8.4**
  
  - [x] 3.3 Write unit test for default preferences initialization
    - Verify default values are set correctly
    - _Requirements: 8.1, 8.3_

- [x] 4. Implement Notification Manager (core engine)
  - [x] 4.1 Create NotificationManager class
    - Implement createNotification with debouncing logic
    - Implement markAsRead, markAllAsRead, deleteNotification, clearAll
    - Implement getNotifications with filtering
    - Implement getUnreadCount
    - Add quiet hours checking logic
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.5, 11.3_
  
  - [ ] 4.2 Write property test for debouncing
    - **Property 32: Debouncing prevents duplicate notifications**
    - **Validates: Requirements 11.3**
  
  - [ ] 4.3 Write property test for notification filtering
    - **Property 19: Notification filtering works correctly**
    - **Validates: Requirements 7.4**
  
  - [ ] 4.4 Write property test for quiet hours
    - **Property 22: Quiet hours suppress toasts but store notifications**
    - **Validates: Requirements 8.5, 10.5**

- [x] 5. Checkpoint - Ensure core infrastructure tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Budget Monitor
  - [x] 6.1 Create BudgetMonitor class
    - Implement evaluateBudgetAlerts method
    - Implement calculateBudgetUtilization with caching
    - Check thresholds (80%, 90%, 100% or custom)
    - Generate notifications with appropriate severity
    - Include budgetId and categoryName in metadata
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 14.1, 14.5_
  
  - [ ] 6.2 Write property test for budget threshold alerts
    - **Property 1: Budget threshold alerts are generated at configured percentages**
    - **Validates: Requirements 1.1, 1.2, 1.3**
  
  - [ ] 6.3 Write property test for budget utilization calculation
    - **Property 2: Budget utilization calculation includes only relevant transactions**
    - **Validates: Requirements 1.4**
  
  - [ ] 6.4 Write property test for custom threshold override
    - **Property 3: Custom budget thresholds override defaults**
    - **Validates: Requirements 1.5, 3.4**
  
  - [ ] 6.5 Write property test for budget metadata
    - **Property 36: Notifications include appropriate metadata** (budget alerts portion)
    - **Validates: Requirements 14.1**

- [x] 7. Implement Payment Monitor
  - [x] 7.1 Create PaymentMonitor class
    - Implement checkUpcomingPayments method
    - Calculate days until due for each active payment
    - Check if payment is already paid for current period
    - Generate reminders at 3 days, 1 day, and due date
    - Include recurringPaymentId in metadata
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 14.2, 14.5_
  
  - [ ] 7.2 Write property test for payment reminder timing
    - **Property 4: Payment reminders are generated at appropriate intervals**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.5**
  
  - [ ] 7.3 Write property test for active payment filtering
    - **Property 5: Only active payments generate reminders**
    - **Validates: Requirements 2.4**
  
  - [ ] 7.4 Write unit test for due date edge cases
    - Test February 31 → February 28/29
    - Test leap years
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 8. Implement Spending Analyzer
  - [x] 8.1 Create SpendingAnalyzer class
    - Implement evaluateUnusualSpending method
    - Implement calculateCategoryAverage with caching (5-minute TTL)
    - Check minimum 3 transactions requirement
    - Compare transaction to average × threshold
    - Include transactionId in metadata
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 12.2, 14.3, 14.5_
  
  - [ ] 8.2 Write property test for unusual spending detection
    - **Property 6: Unusual spending alerts are generated when threshold exceeded**
    - **Validates: Requirements 3.1, 3.4**
  
  - [ ] 8.3 Write property test for category average calculation
    - **Property 7: Category average calculation filters correctly**
    - **Validates: Requirements 3.2**
  
  - [ ] 8.4 Write property test for category average caching
    - **Property 34: Category averages are cached**
    - **Validates: Requirements 12.2**
  
  - [ ] 8.5 Write unit test for minimum transaction requirement
    - Test categories with 0, 1, 2, 3+ transactions
    - _Requirements: 3.3_

- [x] 9. Implement Balance Monitor
  - [x] 9.1 Create BalanceMonitor class
    - Implement evaluateBalanceAlerts method
    - Use existing BalanceCalculator for consistency
    - Implement 24-hour cooldown per account
    - Apply default thresholds based on account type
    - Include accountId in metadata
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 14.4, 14.5_
  
  - [ ] 9.2 Write property test for low balance alerts
    - **Property 8: Low balance alerts are generated when threshold crossed**
    - **Validates: Requirements 4.1, 4.4**
  
  - [ ] 9.3 Write property test for balance calculation consistency
    - **Property 9: Balance calculation consistency**
    - **Validates: Requirements 4.2**
  
  - [ ] 9.4 Write property test for default thresholds by account type
    - **Property 10: Default balance thresholds vary by account type**
    - **Validates: Requirements 4.3**

- [x] 10. Implement Debt Monitor
  - [x] 10.1 Create DebtMonitor class
    - Implement checkOverdueDebts method
    - Calculate days outstanding for each unsettled debt
    - Generate reminders at appropriate intervals (30, 60, 90 days)
    - Differentiate between borrowed and lent debts
    - Include debtId in metadata
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 14.5_
  
  - [ ] 10.2 Write property test for debt reminder timing
    - **Property 11: Debt reminders are generated at appropriate intervals**
    - **Validates: Requirements 5.1, 5.2, 5.3**
  
  - [ ] 10.3 Write property test for settled debt filtering
    - **Property 12: Settled debts do not generate reminders**
    - **Validates: Requirements 5.4**

- [x] 11. Checkpoint - Ensure all monitoring services tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement useNotificationMonitoring hook (orchestrator)
  - [x] 12.1 Create useNotificationMonitoring hook
    - Initialize all monitor instances
    - Set up transaction change listeners
    - Trigger budget, spending, and balance evaluations on transaction changes
    - Run daily checks (payments, debts) on mount
    - Handle Firestore listener integration
    - _Requirements: 11.1, 11.2, 11.4_
  
  - [ ] 12.2 Write property test for transaction change triggers
    - **Property 30: Transaction changes trigger immediate evaluation**
    - **Validates: Requirements 11.1**
  
  - [ ] 12.3 Write property test for daily checks on initialization
    - **Property 31: Daily checks run on app initialization**
    - **Validates: Requirements 11.2**
  
  - [ ] 12.4 Write property test for Firestore listener integration
    - **Property 33: Firestore listener changes trigger re-evaluation**
    - **Validates: Requirements 11.4**

- [x] 13. Implement useNotifications hook (main consumer hook)
  - [x] 13.1 Create useNotifications hook
    - Integrate useNotificationStore
    - Integrate useNotificationPreferences
    - Integrate NotificationManager
    - Provide unified API for components
    - Implement getFilteredNotifications
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [ ] 13.2 Write property test for notification read state updates
    - **Property 17: Notification read state updates correctly**
    - **Validates: Requirements 7.1, 7.2, 7.5**
  
  - [ ] 13.3 Write property test for clear all operation
    - **Property 18: Clear all deletes all notifications**
    - **Validates: Requirements 7.3**
  
  - [ ] 13.4 Write property test for disabled notification types
    - **Property 20: Disabled notification types are not generated**
    - **Validates: Requirements 8.2**

- [x] 14. Implement Toast Alert integration
  - [x] 14.1 Create ToastManager utility
    - Implement showToast using react-hot-toast
    - Implement toast queuing (max 3 visible)
    - Apply severity-based color coding
    - Configure 5-second auto-dismiss
    - Respect quiet hours setting
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  
  - [ ] 14.2 Write property test for high-priority toast display
    - **Property 26: High-priority notifications trigger toast alerts**
    - **Validates: Requirements 10.1**
  
  - [ ] 14.3 Write property test for severity-based color coding
    - **Property 27: Toast alerts use severity-based color coding**
    - **Validates: Requirements 10.2**
  
  - [ ] 14.4 Write property test for toast auto-dismiss
    - **Property 28: Toast alerts auto-dismiss after 5 seconds**
    - **Validates: Requirements 10.3**
  
  - [ ] 14.5 Write property test for toast queuing
    - **Property 29: Multiple toasts are queued to avoid overwhelming**
    - **Validates: Requirements 10.4**

- [x] 15. Implement Notification Center UI component
  - [x] 15.1 Create NotificationCenter component
    - Build dropdown panel with bell icon trigger
    - Display notifications in reverse chronological order
    - Show unread badge count
    - Implement filter tabs (all, budget, recurring, unusual_spending, low_balance, debt)
    - Render notification cards with title, message, timestamp, severity
    - Add action buttons for notifications with actionUrl
    - Implement mark as read on click
    - Add "Mark all as read" and "Clear all" buttons
    - Show empty state when no notifications
    - Add smooth animations (slide-in, fade)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [ ] 15.2 Write property test for notification sorting
    - **Property 13: Notifications are displayed in reverse chronological order**
    - **Validates: Requirements 6.1**
  
  - [ ] 15.3 Write property test for notification display completeness
    - **Property 14: Notification display includes all required fields**
    - **Validates: Requirements 6.2**
  
  - [ ] 15.4 Write property test for action button conditional rendering
    - **Property 15: Action buttons appear only when actionUrl is present**
    - **Validates: Requirements 6.3**
  
  - [~] 15.5 Write property test for unread badge count
    - **Property 16: Unread badge count reflects unread notifications**
    - **Validates: Requirements 6.4**
  
  - [ ] 15.6 Write unit test for empty state display
    - Verify empty state message appears when no notifications
    - _Requirements: 6.5_

- [x] 16. Implement Notification Preferences UI component
  - [x] 16.1 Create NotificationPreferences component
    - Build settings panel with toggle controls for each notification type
    - Add threshold configuration inputs (budget warning, critical, exceeded, unusual spending, low balance)
    - Add quiet hours configuration (enable toggle, start/end time pickers)
    - Implement preference update handling with validation
    - Show success/error feedback on save
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [ ] 16.2 Write unit test for preferences UI completeness
    - Verify all toggle controls are present
    - Verify all threshold inputs are present
    - _Requirements: 8.1, 8.3_

- [x] 17. Add Firestore security rules for notifications
  - [x] 17.1 Update firestore.rules
    - Add notifications subcollection rules under users/{userId}
    - Enforce read/write ownership (isOwner check)
    - Validate required fields on create (type, title, message, severity, isRead, createdAt)
    - Validate severity enum (info, warning, error, success)
    - Add notificationPreferences document rules
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 18. Integrate notification system into main app
  - [x] 18.1 Add NotificationProvider to app layout
    - Wrap app with notification context
    - Initialize useNotificationMonitoring with all data sources
    - Pass userId from auth context
    - _Requirements: All requirements (integration)_
  
  - [x] 18.2 Add NotificationCenter to app header
    - Place bell icon in header next to user menu
    - Wire up notification center dropdown
    - Ensure proper z-index and positioning
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [x] 18.3 Add NotificationPreferences to settings view
    - Add "Notifications" tab to settings
    - Wire up preferences component
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 19. Implement error handling and logging
  - [x] 19.1 Add error boundaries and try-catch blocks
    - Wrap monitor evaluations in try-catch
    - Handle storage errors with retry logic
    - Handle calculation errors with validation
    - Add logging for all errors
    - Show user-friendly error messages where appropriate
    - _Requirements: All requirements (error handling)_
  
  - [ ] 19.2 Write unit tests for error scenarios
    - Test invalid transaction data handling
    - Test storage quota exceeded handling
    - Test network failure handling
    - Test calculation errors (NaN, undefined)
    - _Requirements: All requirements (error handling)_

- [x] 20. Final checkpoint - End-to-end testing
  - [x] 20.1 Test complete notification flows
    - Create transactions and verify budget alerts
    - Set up recurring payments and verify reminders
    - Create unusual spending and verify alerts
    - Test low balance warnings
    - Test debt reminders
    - Verify notifications appear in center
    - Verify toasts display correctly
    - Test preferences updates
    - Test mark as read, clear all
    - Test filtering
  
  - [x] 20.2 Test guest mode vs authenticated mode
    - Verify localStorage storage in guest mode
    - Verify Firestore storage in authenticated mode
    - Test data persistence across sessions
  
  - [x] 20.3 Performance testing
    - Test with 100 notifications
    - Verify caching works (category averages, budget utilization)
    - Verify debouncing prevents spam
    - Verify cooldowns work (balance alerts)
  
  - [x] 20.4 Ensure all tests pass
    - Run all property tests (37 properties)
    - Run all unit tests
    - Verify 90%+ code coverage
    - Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based and unit tests that can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties across all inputs
- Unit tests validate specific examples, edge cases, and error conditions
- The implementation follows a bottom-up approach: data models → persistence → monitoring → UI
- All monitors are integrated through the useNotificationMonitoring orchestrator hook
- The system supports both authenticated (Firestore) and guest (localStorage) modes throughout
