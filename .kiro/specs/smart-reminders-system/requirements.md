# Requirements Document: Smart Reminders System

## Introduction

The Smart Reminders System is an intelligent reminder subsystem for MoneyTrack that helps users maintain consistent financial tracking habits through automated, context-aware notifications. The system detects when users haven't logged transactions, suggests transaction categories using AI-powered pattern recognition, provides budget review prompts, and integrates with the existing notification infrastructure to deliver timely, non-intrusive reminders.

## Glossary

- **Reminder_System**: The complete smart reminders subsystem
- **Activity_Monitor**: Component that tracks user activity patterns and detects inactivity
- **Categorization_Engine**: AI-powered component that suggests transaction categories
- **Budget_Review_Scheduler**: Component that generates periodic budget review reminders
- **Pattern_Analyzer**: Component that analyzes historical transaction patterns
- **Gemini_AI**: Google's Gemini AI service used for intelligent category matching
- **Usage_Pattern**: Historical data about when and how frequently a user logs transactions
- **Quiet_Day**: A configured day when reminders should be suppressed (weekends, holidays)
- **Smart_Timing**: Calculated optimal time to send reminders based on user behavior
- **Category_Suggestion**: AI-generated recommendation for transaction categorization
- **Confidence_Score**: Numerical measure of categorization suggestion accuracy (0-100)
- **Learning_Feedback**: User corrections to category suggestions used to improve future predictions

## Requirements

### Requirement 1: Daily Transaction Logging Reminders

**User Story:** As a user, I want to receive reminders when I haven't logged transactions recently, so that I maintain consistent financial tracking habits.

#### Acceptance Criteria

1. WHEN a user has not logged any transactions for 24 hours, THE Activity_Monitor SHALL generate an info notification reminding them to log transactions
2. WHEN a user has not logged any transactions for 48 hours, THE Activity_Monitor SHALL generate a warning notification with increased urgency
3. WHEN calculating inactivity periods, THE Activity_Monitor SHALL only count time outside of configured quiet days
4. WHERE quiet days are configured for weekends, THE Activity_Monitor SHALL not generate reminders on Saturdays and Sundays
5. WHERE quiet days are configured for specific holidays, THE Activity_Monitor SHALL not generate reminders on those dates
6. WHEN a user logs a transaction, THE Activity_Monitor SHALL reset the inactivity timer to zero
7. WHEN determining reminder timing, THE Activity_Monitor SHALL send reminders during the user's typical transaction logging hours based on historical patterns

### Requirement 2: Smart Timing Based on Usage Patterns

**User Story:** As a user, I want reminders to arrive at times when I'm most likely to use the app, so that they are helpful rather than disruptive.

#### Acceptance Criteria

1. WHEN analyzing usage patterns, THE Pattern_Analyzer SHALL calculate the user's most common transaction logging hours from the past 30 days
2. WHEN a user has logged at least 10 transactions, THE Pattern_Analyzer SHALL identify the top 3 most frequent time windows (morning, afternoon, evening)
3. WHEN scheduling a reminder, THE Activity_Monitor SHALL send it during the user's most frequent time window
4. WHEN a user has insufficient transaction history (fewer than 10 transactions), THE Activity_Monitor SHALL use default timing of 6:00 PM local time
5. WHERE quiet hours are configured in notification preferences, THE Activity_Monitor SHALL respect those settings and not send reminders during quiet hours

### Requirement 3: Quiet Days Configuration

**User Story:** As a user, I want to configure which days should not trigger reminders, so that I'm not bothered on weekends or holidays.

#### Acceptance Criteria

1. WHEN viewing reminder preferences, THE Reminder_System SHALL display toggle controls for weekend quiet days (Saturday, Sunday)
2. WHEN viewing reminder preferences, THE Reminder_System SHALL display a list of custom quiet days with add/remove functionality
3. WHEN a quiet day is configured, THE Activity_Monitor SHALL exclude that day from inactivity calculations
4. WHEN adding a custom quiet day, THE Reminder_System SHALL accept a date and optional label (e.g., "Christmas", "Birthday")
5. WHEN a custom quiet day passes, THE Reminder_System SHALL automatically remove it from the list if it's a one-time event

### Requirement 4: Smart Category Suggestions Using AI

**User Story:** As a user, I want the app to suggest transaction categories based on my history, so that I can categorize transactions faster and more consistently.

#### Acceptance Criteria

1. WHEN a user enters a transaction description, THE Categorization_Engine SHALL analyze the description and suggest a category
2. WHEN generating category suggestions, THE Categorization_Engine SHALL use Gemini AI to match the description against historical transaction patterns
3. WHEN providing a category suggestion, THE Categorization_Engine SHALL include a confidence score from 0 to 100
4. WHEN the confidence score is 80 or higher, THE Categorization_Engine SHALL auto-select the suggested category in the transaction form
5. WHEN the confidence score is between 50 and 79, THE Categorization_Engine SHALL display the suggestion as a clickable chip but not auto-select it
6. WHEN the confidence score is below 50, THE Categorization_Engine SHALL not display any suggestion
7. WHEN analyzing descriptions, THE Categorization_Engine SHALL consider merchant names, keywords, and transaction amounts from historical data

### Requirement 5: Pattern-Based Category Matching

**User Story:** As a developer, I want the categorization engine to use multiple matching strategies, so that suggestions are accurate even without AI.

#### Acceptance Criteria

1. WHEN Gemini AI is unavailable or not configured, THE Categorization_Engine SHALL fall back to pattern-based matching
2. WHEN performing pattern-based matching, THE Categorization_Engine SHALL check for exact merchant name matches in transaction history
3. WHEN an exact merchant match is found, THE Categorization_Engine SHALL suggest the most frequently used category for that merchant
4. WHEN no exact match is found, THE Categorization_Engine SHALL perform fuzzy matching on description keywords
5. WHEN multiple historical transactions match the description, THE Categorization_Engine SHALL suggest the category used most frequently in the past 90 days
6. WHEN considering amount patterns, THE Categorization_Engine SHALL boost confidence scores for suggestions where the amount is within 10% of historical amounts for that merchant

### Requirement 6: Learning from User Corrections

**User Story:** As a user, I want the system to learn from my category corrections, so that suggestions improve over time.

#### Acceptance Criteria

1. WHEN a user changes a suggested category, THE Categorization_Engine SHALL record the correction as learning feedback
2. WHEN recording learning feedback, THE Categorization_Engine SHALL store the original description, suggested category, and user-selected category
3. WHEN generating future suggestions for similar descriptions, THE Categorization_Engine SHALL prioritize categories that were manually selected over AI suggestions
4. WHEN a user consistently corrects a specific merchant's category, THE Categorization_Engine SHALL update that merchant's default category
5. WHEN calculating confidence scores, THE Categorization_Engine SHALL increase confidence by 20 points for suggestions that match user correction patterns

### Requirement 7: Weekly Budget Review Reminders

**User Story:** As a user, I want to receive weekly reminders to review my budget progress, so that I stay aware of my spending patterns.

#### Acceptance Criteria

1. WHEN a week has passed since the last budget review, THE Budget_Review_Scheduler SHALL generate an info notification prompting a budget review
2. WHEN generating a weekly review reminder, THE Budget_Review_Scheduler SHALL include summary statistics (total spent, budgets at risk, categories over budget)
3. WHEN a user has no active budgets, THE Budget_Review_Scheduler SHALL not generate weekly review reminders
4. WHERE a preferred review day is configured, THE Budget_Review_Scheduler SHALL send reminders on that day of the week
5. WHEN no preferred day is configured, THE Budget_Review_Scheduler SHALL default to Sunday evenings at 6:00 PM local time

### Requirement 8: Monthly Budget Review Reminders

**User Story:** As a user, I want to receive end-of-month reminders to review my overall budget performance, so that I can plan for the next month.

#### Acceptance Criteria

1. WHEN the last day of the month arrives, THE Budget_Review_Scheduler SHALL generate a warning notification prompting a monthly budget review
2. WHEN generating a monthly review reminder, THE Budget_Review_Scheduler SHALL include comprehensive statistics (total income, total expenses, budget utilization percentages, savings rate)
3. WHEN a user has consistently exceeded budgets, THE Budget_Review_Scheduler SHALL suggest increasing budget limits in the reminder message
4. WHEN a user has consistently stayed under budgets, THE Budget_Review_Scheduler SHALL suggest reducing budget limits to challenge savings goals
5. WHEN the new month begins, THE Budget_Review_Scheduler SHALL generate an info notification suggesting budget adjustments for the new month

### Requirement 9: Budget Adjustment Suggestions

**User Story:** As a user, I want the system to suggest budget adjustments based on my spending patterns, so that my budgets remain realistic and achievable.

#### Acceptance Criteria

1. WHEN analyzing spending patterns, THE Budget_Review_Scheduler SHALL calculate the average monthly spending per category over the past 3 months
2. WHEN a budget limit is consistently exceeded by more than 20%, THE Budget_Review_Scheduler SHALL suggest increasing the limit to match average spending
3. WHEN a budget limit is consistently underutilized by more than 30%, THE Budget_Review_Scheduler SHALL suggest decreasing the limit to free up budget for other categories
4. WHEN providing budget adjustment suggestions, THE Budget_Review_Scheduler SHALL include specific recommended amounts based on historical data
5. WHEN a user has fewer than 3 months of transaction history, THE Budget_Review_Scheduler SHALL not generate budget adjustment suggestions

### Requirement 10: Category Highlighting in Budget Reviews

**User Story:** As a user, I want budget review reminders to highlight categories that need attention, so that I can focus on problem areas.

#### Acceptance Criteria

1. WHEN generating a budget review reminder, THE Budget_Review_Scheduler SHALL identify categories that are at 90% or higher utilization
2. WHEN generating a budget review reminder, THE Budget_Review_Scheduler SHALL identify categories with unusual spending spikes (50% or more above average)
3. WHEN displaying categories needing attention, THE Budget_Review_Scheduler SHALL sort them by urgency (exceeded budgets first, then high utilization, then unusual spikes)
4. WHEN a category needs attention, THE Budget_Review_Scheduler SHALL include the category name, current spending, budget limit, and utilization percentage in the reminder message
5. WHEN no categories need attention, THE Budget_Review_Scheduler SHALL include a positive message congratulating the user on staying within budgets

### Requirement 11: Reminder Preferences Configuration

**User Story:** As a user, I want to configure which reminders I receive and when, so that I can customize the system to my preferences.

#### Acceptance Criteria

1. WHEN viewing reminder preferences, THE Reminder_System SHALL display toggle controls for each reminder type (daily transaction, weekly review, monthly review, category suggestions)
2. WHEN a reminder type is disabled, THE Reminder_System SHALL not generate reminders of that type
3. WHEN viewing reminder preferences, THE Reminder_System SHALL display timing configuration for daily transaction reminders (preferred time window)
4. WHEN viewing reminder preferences, THE Reminder_System SHALL display day-of-week selection for weekly budget reviews
5. WHERE reminder preferences are not configured, THE Reminder_System SHALL use default settings (all reminders enabled, default timing)

### Requirement 12: Integration with Existing Notification System

**User Story:** As a developer, I want the reminder system to integrate seamlessly with the existing notification infrastructure, so that reminders appear consistently with other alerts.

#### Acceptance Criteria

1. WHEN generating a reminder, THE Reminder_System SHALL use the existing Notification_Manager to create notifications
2. WHEN creating reminder notifications, THE Reminder_System SHALL follow the same data model as other notifications (type, title, message, severity, metadata)
3. WHEN a reminder is generated, THE Reminder_System SHALL respect existing notification preferences (quiet hours, toast display rules)
4. WHEN storing reminders, THE Reminder_System SHALL use the same persistence layer as other notifications (Firestore for authenticated users, localStorage for guests)
5. WHEN displaying reminders, THE Reminder_System SHALL appear in the existing Notification_Center alongside other alerts

### Requirement 13: Reminder Notification Types

**User Story:** As a developer, I want reminders to have distinct types, so that they can be filtered and managed separately from other notifications.

#### Acceptance Criteria

1. WHEN creating a daily transaction reminder, THE Reminder_System SHALL set the notification type to 'reminder_transaction'
2. WHEN creating a budget review reminder, THE Reminder_System SHALL set the notification type to 'reminder_budget_review'
3. WHEN creating a category suggestion notification, THE Reminder_System SHALL set the notification type to 'reminder_category'
4. WHEN filtering notifications in the Notification_Center, THE Reminder_System SHALL support filtering by reminder types
5. WHEN a reminder notification includes an action, THE Reminder_System SHALL set the actionUrl to navigate to the relevant view (transaction form, budget view, etc.)

### Requirement 14: Gemini AI Integration for Categorization

**User Story:** As a developer, I want to leverage Gemini AI for intelligent category suggestions, so that categorization accuracy is high.

#### Acceptance Criteria

1. WHEN Gemini AI is configured, THE Categorization_Engine SHALL use the existing Gemini service from src/lib/gemini.ts
2. WHEN calling Gemini AI, THE Categorization_Engine SHALL provide context including the transaction description, amount, and historical category usage
3. WHEN calling Gemini AI, THE Categorization_Engine SHALL request a structured response containing the suggested category and confidence score
4. WHEN Gemini AI returns a suggestion, THE Categorization_Engine SHALL validate that the suggested category exists in the user's category list
5. WHEN Gemini AI suggests a non-existent category, THE Categorization_Engine SHALL fall back to pattern-based matching
6. WHEN Gemini AI fails or times out, THE Categorization_Engine SHALL fall back to pattern-based matching without showing an error to the user

### Requirement 15: Performance and Efficiency

**User Story:** As a developer, I want the reminder system to operate efficiently, so that it doesn't degrade app performance.

#### Acceptance Criteria

1. WHEN analyzing usage patterns, THE Pattern_Analyzer SHALL cache results for 24 hours to avoid redundant calculations
2. WHEN generating category suggestions, THE Categorization_Engine SHALL complete processing within 500ms for pattern-based matching
3. WHEN calling Gemini AI for category suggestions, THE Categorization_Engine SHALL implement a 3-second timeout
4. WHEN calculating budget review statistics, THE Budget_Review_Scheduler SHALL cache results for 1 hour
5. WHEN checking for daily transaction reminders, THE Activity_Monitor SHALL run checks at most once per hour to avoid excessive processing

### Requirement 16: Data Privacy and Security

**User Story:** As a user, I want my transaction data to remain private when using AI categorization, so that my financial information is protected.

#### Acceptance Criteria

1. WHEN calling Gemini AI, THE Categorization_Engine SHALL only send the transaction description and amount, not full transaction details
2. WHEN calling Gemini AI, THE Categorization_Engine SHALL not send personally identifiable information (account names, user names, account balances)
3. WHEN storing learning feedback, THE Reminder_System SHALL store data in the user's Firestore document or localStorage, not in shared storage
4. WHEN a user is in guest mode, THE Categorization_Engine SHALL only use pattern-based matching from local data, not AI services
5. WHERE Gemini AI is not configured, THE Categorization_Engine SHALL function fully using pattern-based matching without degraded functionality

### Requirement 17: Reminder Persistence and Scheduling

**User Story:** As a developer, I want reminders to be scheduled reliably, so that users receive them at the correct times.

#### Acceptance Criteria

1. WHEN the app initializes, THE Reminder_System SHALL check if any scheduled reminders are due
2. WHEN a reminder is due, THE Reminder_System SHALL generate the notification immediately
3. WHEN calculating next reminder times, THE Reminder_System SHALL store the next scheduled time in user preferences
4. WHEN the app is closed and reopened, THE Reminder_System SHALL check for missed reminders and generate them if appropriate
5. WHEN a reminder is generated, THE Reminder_System SHALL update the next scheduled time to prevent duplicate reminders

### Requirement 18: User Feedback and Dismissal

**User Story:** As a user, I want to dismiss reminders or snooze them, so that I can control when I act on them.

#### Acceptance Criteria

1. WHEN a user marks a reminder as read, THE Reminder_System SHALL not regenerate the same reminder for the current period
2. WHEN a user dismisses a daily transaction reminder, THE Activity_Monitor SHALL not send another reminder for 12 hours
3. WHEN a user dismisses a budget review reminder, THE Budget_Review_Scheduler SHALL not send another reminder until the next scheduled review period
4. WHEN a user acts on a reminder (e.g., logs a transaction, reviews budget), THE Reminder_System SHALL automatically mark the reminder as completed
5. WHERE a snooze feature is implemented, THE Reminder_System SHALL allow users to snooze reminders for 1 hour, 3 hours, or 1 day

### Requirement 19: Reminder Analytics and Insights

**User Story:** As a user, I want to see how reminders have helped me improve my financial tracking, so that I can understand their value.

#### Acceptance Criteria

1. WHEN viewing reminder preferences, THE Reminder_System SHALL display statistics on reminder effectiveness (reminders sent, actions taken, tracking consistency)
2. WHEN calculating tracking consistency, THE Reminder_System SHALL compare transaction logging frequency before and after reminders were enabled
3. WHEN displaying category suggestion accuracy, THE Reminder_System SHALL show the percentage of suggestions that were accepted versus corrected
4. WHEN a user has used reminders for at least 30 days, THE Reminder_System SHALL display a trend graph showing tracking consistency over time
5. WHERE reminder analytics show low effectiveness, THE Reminder_System SHALL suggest adjusting reminder timing or frequency

### Requirement 20: Accessibility and Localization

**User Story:** As a user, I want reminders to be accessible and in my preferred language, so that they are easy to understand and act upon.

#### Acceptance Criteria

1. WHEN generating reminder messages, THE Reminder_System SHALL use clear, concise language appropriate for the user's locale
2. WHEN displaying reminder notifications, THE Reminder_System SHALL follow accessibility best practices (sufficient color contrast, screen reader support)
3. WHEN a user has configured a preferred language, THE Reminder_System SHALL generate reminder messages in that language
4. WHEN displaying times in reminders, THE Reminder_System SHALL use the user's local timezone
5. WHEN displaying currency amounts in reminders, THE Reminder_System SHALL use the user's configured currency format (COP by default)
