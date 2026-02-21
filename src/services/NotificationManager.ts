/**
 * NotificationManager - Core engine for notification operations
 * Handles creation, management, filtering, and debouncing of notifications
 */

import toast from 'react-hot-toast';
import { logger } from '../utils/logger';
import type { Notification, NotificationFilter, NotificationPreferences } from '../types/finance';

interface NotificationManagerDeps {
    addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => Promise<void>;
    updateNotification: (id: string, updates: Partial<Notification>) => Promise<void>;
    deleteNotification: (id: string) => Promise<void>;
    clearAll: () => Promise<void>;
    markAllAsRead: () => Promise<void>;
    notifications: Notification[];
    preferences: NotificationPreferences;
}

export class NotificationManager {
    public deps: NotificationManagerDeps;
    private debounceMap: Map<string, number> = new Map();
    private toastQueue: Notification[] = [];
    private isProcessingQueue = false;
    private readonly DEBOUNCE_MS = 1000;
    private readonly MAX_VISIBLE_TOASTS = 3;

    constructor(deps: NotificationManagerDeps) {
        this.deps = deps;
    }

    /**
     * Create a new notification with debouncing
     */
    async createNotification(notification: Omit<Notification, 'id' | 'createdAt'>): Promise<void> {
        // Check if notification type is enabled
        if (!this.isNotificationTypeEnabled(notification.type)) {
            logger.info(`Notification type ${notification.type} is disabled, skipping`);
            return;
        }

        // Check for duplicate (debouncing)
        if (this.isDuplicate(notification)) {
            logger.info('Duplicate notification detected, skipping', { notification });
            return;
        }

        try {
            // Store notification
            await this.deps.addNotification(notification);

            // Update debounce map
            const key = this.getDebounceKey(notification);
            this.debounceMap.set(key, Date.now());

            // Show toast if appropriate
            if (this.shouldShowToast(notification)) {
                this.queueToast(notification);
            }

            logger.info('Notification created', { notification });
        } catch (error) {
            logger.error('Failed to create notification', { notification, error });
            throw error;
        }
    }

    /**
     * Mark a notification as read
     */
    async markAsRead(notificationId: string): Promise<void> {
        try {
            await this.deps.updateNotification(notificationId, { isRead: true });
        } catch (error) {
            logger.error('Failed to mark notification as read', { notificationId, error });
            throw error;
        }
    }

    /**
     * Mark all notifications as read
     */
    async markAllAsRead(): Promise<void> {
        try {
            await this.deps.markAllAsRead();
        } catch (error) {
            logger.error('Failed to mark all notifications as read', error);
            throw error;
        }
    }

    /**
     * Delete a notification
     */
    async deleteNotification(notificationId: string): Promise<void> {
        try {
            await this.deps.deleteNotification(notificationId);
        } catch (error) {
            logger.error('Failed to delete notification', { notificationId, error });
            throw error;
        }
    }

    /**
     * Clear all notifications
     */
    async clearAll(): Promise<void> {
        try {
            await this.deps.clearAll();
        } catch (error) {
            logger.error('Failed to clear all notifications', error);
            throw error;
        }
    }

    /**
     * Get filtered notifications
     */
    getNotifications(filter?: NotificationFilter): Notification[] {
        let filtered = this.deps.notifications;

        if (filter?.type) {
            filtered = filtered.filter((n) => n.type === filter.type);
        }

        if (filter?.isRead !== undefined) {
            filtered = filtered.filter((n) => n.isRead === filter.isRead);
        }

        if (filter?.severity) {
            filtered = filtered.filter((n) => n.severity === filter.severity);
        }

        return filtered;
    }

    /**
     * Get count of unread notifications
     */
    getUnreadCount(): number {
        return this.deps.notifications.filter((n) => !n.isRead).length;
    }

    /**
     * Check if currently in quiet hours
     */
    isInQuietHours(): boolean {
        const { quietHours } = this.deps.preferences;

        if (!quietHours.enabled) {
            return false;
        }

        const now = new Date();
        const currentHour = now.getHours();
        const { startHour, endHour } = quietHours;

        // Handle cases where quiet hours span midnight
        if (startHour < endHour) {
            return currentHour >= startHour && currentHour < endHour;
        } else {
            return currentHour >= startHour || currentHour < endHour;
        }
    }

    /**
     * Determine if a toast should be shown for this notification
     */
    shouldShowToast(notification: Omit<Notification, 'id' | 'createdAt'>): boolean {
        // Don't show toasts during quiet hours
        if (this.isInQuietHours()) {
            return false;
        }

        // Only show toasts for high-priority notifications (warning, error)
        return notification.severity === 'warning' || notification.severity === 'error';
    }

    /**
     * Check if notification type is enabled in preferences
     */
    private isNotificationTypeEnabled(type: Notification['type']): boolean {
        const { enabled } = this.deps.preferences;

        switch (type) {
            case 'budget':
                return enabled.budget;
            case 'recurring':
                return enabled.recurring;
            case 'unusual_spending':
                return enabled.unusualSpending;
            case 'low_balance':
                return enabled.lowBalance;
            case 'debt':
                return enabled.debt;
            case 'info':
                return true; // Info notifications are always enabled
            default:
                return true;
        }
    }

    /**
     * Check if notification is a duplicate (within debounce window)
     */
    private isDuplicate(notification: Omit<Notification, 'id' | 'createdAt'>): boolean {
        const key = this.getDebounceKey(notification);
        const lastTime = this.debounceMap.get(key);

        if (!lastTime) {
            return false;
        }

        const elapsed = Date.now() - lastTime;
        return elapsed < this.DEBOUNCE_MS;
    }

    /**
     * Generate a unique key for debouncing
     */
    private getDebounceKey(notification: Omit<Notification, 'id' | 'createdAt'>): string {
        const parts = [notification.type, notification.title];

        // Add relevant metadata to key for more specific deduplication
        if (notification.metadata) {
            const { budgetId, recurringPaymentId, transactionId, accountId, debtId } = notification.metadata;
            if (budgetId) parts.push(budgetId);
            if (recurringPaymentId) parts.push(recurringPaymentId);
            if (transactionId) parts.push(transactionId);
            if (accountId) parts.push(accountId);
            if (debtId) parts.push(debtId);
        }

        return parts.join(':');
    }

    /**
     * Queue a toast for display
     */
    private queueToast(notification: Omit<Notification, 'id' | 'createdAt'>): void {
        // Create a temporary notification object for the queue
        const tempNotification: Notification = {
            ...notification,
            id: 'temp-' + Date.now(),
            createdAt: new Date(),
        };

        this.toastQueue.push(tempNotification);
        this.processToastQueue();
    }

    /**
     * Process the toast queue (max 3 visible at once)
     */
    private async processToastQueue(): Promise<void> {
        if (this.isProcessingQueue) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.toastQueue.length > 0) {
            // Check how many toasts are currently visible
            const visibleCount = document.querySelectorAll('[data-sonner-toast]').length;

            if (visibleCount >= this.MAX_VISIBLE_TOASTS) {
                // Wait a bit before checking again
                await new Promise((resolve) => setTimeout(resolve, 1000));
                continue;
            }

            const notification = this.toastQueue.shift();
            if (notification) {
                this.showToast(notification);
            }
        }

        this.isProcessingQueue = false;
    }

    /**
     * Display a toast notification
     */
    private showToast(notification: Notification): void {
        const options = {
            duration: 5000,
            position: 'top-right' as const,
        };

        switch (notification.severity) {
            case 'error':
                toast.error(notification.message, options);
                break;
            case 'warning':
                toast(notification.message, {
                    ...options,
                    icon: '⚠️',
                    style: {
                        background: '#FEF3C7',
                        color: '#92400E',
                        border: '1px solid #FCD34D',
                    },
                });
                break;
            case 'success':
                toast.success(notification.message, options);
                break;
            case 'info':
            default:
                toast(notification.message, options);
                break;
        }
    }

    /**
     * Clean up old debounce entries (call periodically)
     */
    cleanupDebounceMap(): void {
        const now = Date.now();
        const cutoff = now - this.DEBOUNCE_MS * 2; // Keep entries for 2x debounce window

        for (const [key, timestamp] of this.debounceMap.entries()) {
            if (timestamp < cutoff) {
                this.debounceMap.delete(key);
            }
        }
    }
}
