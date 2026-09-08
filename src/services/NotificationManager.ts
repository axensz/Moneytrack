/**
 * NotificationManager - Core engine for notification operations
 * Handles creation, management, filtering, and debouncing of notifications
 */

import toast from 'react-hot-toast';
import { logger } from '../utils/logger';
import { localDateKey } from '../utils/dateUtils';
import { appNotificationToBrowserPayload, showBrowserNotification } from '../lib/browserNotifications';
import type { Notification, NotificationFilter, NotificationPreferences } from '../types/finance';
import {
    isVersionedEventCandidate,
    isVersionedNotification,
} from '../utils/notificationEventLifecycle';

interface NotificationManagerDeps {
    /** Devuelve true si creó la notificación; false si ya existía (dedup diario). */
    addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => Promise<boolean>;
    updateNotification: (id: string, updates: Partial<Notification>) => Promise<void>;
    deleteNotification: (id: string, expectedRevision?: number) => Promise<void>;
    clearAll: () => Promise<void>;
    markAllAsRead: () => Promise<void>;
    notifications: Notification[];
    preferences: NotificationPreferences;
    /**
     * Compuerta de presentación OS en primer plano. Cuando se inyecta, ESTE
     * predicado gobierna si un evento en primer plano puede levantar una
     * notificación del sistema (autenticado: dispositivo activo + permiso; el
     * caso de compatibilidad runtime-ausente/no-confirmado delega en el gate
     * legacy browserNotifications.enabled+permiso — el hook computa el booleano).
     * Solo afecta la presentación OS en primer plano: nunca la persistencia en
     * el inbox, los toasts, ni los marcadores de entrega del backend.
     */
    canShowBrowserNotification?: () => boolean;
    /** Reloj inyectable para el diferido de quiet hours (tests deterministas). */
    now?: () => number;
    /** Programa el timer de presentación diferida; devuelve un handle opaco. */
    setDeferTimer?: (callback: () => void, delayMs: number) => number;
    /** Cancela un timer de presentación diferida por su handle. */
    clearDeferTimer?: (handle: number) => void;
}

/**
 * Registro a nivel de módulo de la compuerta de presentación OS del dispositivo
 * actual. El NotificationProvider lo registra desde el hook de dispositivo; el
 * manager lo consulta de forma perezosa. Vive aquí (y no en useNotifications)
 * para evitar dependencias circulares y para sobrevivir a las reconstrucciones
 * de `deps` que hace useNotifications al cambiar preferencias/notificaciones.
 */
let currentDeviceBrowserGate: (() => boolean) | null = null;

export function setCurrentDeviceBrowserGate(gate: (() => boolean) | null): void {
    currentDeviceBrowserGate = gate;
}

/**
 * Un evento de presentación OS diferida por quiet hours. Se conserva en memoria
 * mientras la página vive; NUNCA promete entrega con la página cerrada.
 */
interface DeferredPresentation {
    key: string;
    handle: number;
    notification: Omit<Notification, 'id' | 'createdAt'>;
}

export class NotificationManager {
    public deps: NotificationManagerDeps;
    private debounceMap: Map<string, number> = new Map();
    private toastQueue: Notification[] = [];
    private isProcessingQueue = false;
    private readonly DEBOUNCE_MS = 60000;  // ✅ FIX #6: 60 segundos (1 minuto)
    private readonly MAX_VISIBLE_TOASTS = 3;
    /** Presentaciones OS diferidas por quiet hours, acotadas por clave. */
    private deferredPresentations: Map<string, DeferredPresentation> = new Map();
    private readonly MAX_DEFERRED_PRESENTATIONS = 32;

    constructor(deps: NotificationManagerDeps) {
        this.deps = deps;
    }

    /**
     * ✅ FIX #2 & #3: Create notification with deduplication at Firestore level
     * La deduplicación ahora se maneja en addNotification con docId determinístico
     */
    async createNotification(notification: Omit<Notification, 'id' | 'createdAt'>): Promise<void> {
        const candidate = { ...notification };
        const isVersioned = isVersionedEventCandidate(candidate as Notification);
        if (isVersioned) {
            delete candidate.revision;
        }
        // Check if notification type is enabled
        if (!this.isNotificationTypeEnabled(candidate.type)) {
            logger.info(`Notification type ${candidate.type} is disabled, skipping`);
            return;
        }

        // Check for duplicate (debouncing en memoria - previene llamadas rápidas)
        if (!isVersioned && this.isDuplicate(candidate)) {
            logger.info('Duplicate notification detected (debounce), skipping', { notification: candidate });
            return;
        }

        try {
            // Store notification (addNotification maneja deduplicación con docId)
            const created = await this.deps.addNotification(candidate);

            // Si ya existía (dedup diario por docId), NO mostrar toast: al recargar
            // los daily checks reintentan la misma notificación; sin esto el toast
            // re-aparecía aunque no se creara nada nuevo (minor de la revisión).
            if (!created) {
                logger.info('Notification already exists today, skipping toast', { notification: candidate });
                return;
            }

            // Update debounce map
            if (!isVersioned) {
                const dedupeKey = this.getDebounceKey(candidate);
                this.debounceMap.set(dedupeKey, Date.now());
            }

            // Show toast if appropriate
            if (this.shouldShowToast(candidate)) {
                this.queueToast(candidate);
            }

            // Presentación OS en primer plano. La persistencia (inbox) ya ocurrió
            // arriba y NO se toca aquí. Si el gate permite pero estamos en quiet
            // hours, se difiere UNA presentación al fin de la ventana en vez de
            // descartarla.
            if (this.browserNotificationGateAllows()) {
                if (this.isInQuietHours()) {
                    this.scheduleDeferredPresentation(candidate);
                } else {
                    void showBrowserNotification(appNotificationToBrowserPayload(candidate));
                }
            }

            logger.info('Notification created', { notification: candidate });
        } catch (error) {
            logger.error('Failed to create notification', { notification: candidate, error });
            throw error;
        }
    }

    /**
     * Mark a notification as read
     */
    async markAsRead(notificationId: string): Promise<void> {
        try {
            const notification = this.deps.notifications.find((item) => item.id === notificationId);
            await this.deps.updateNotification(
                notificationId,
                isVersionedNotification(notification)
                    ? { isRead: true, readRevision: notification.revision }
                    : { isRead: true }
            );
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
            const notification = this.deps.notifications.find((item) => item.id === notificationId);
            if (!notification) return;
            if (isVersionedNotification(notification)) {
                await this.deps.deleteNotification(notificationId, notification.revision);
                return;
            }
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

        const now = new Date(this.deps.now ? this.deps.now() : Date.now());
        const currentHour = now.getHours();
        const { startHour, endHour } = quietHours;

        // start === end es un rango VACÍO, no "24 horas": sin este guard la rama
        // de abajo (>= start || < end) sería una tautología y silenciaría los
        // toasts 24/7 ante una config plausible del usuario.
        if (startHour === endHour) {
            return false;
        }

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
     * Compuerta de presentación OS, ignorando quiet hours. Cuando se inyecta
     * `canShowBrowserNotification`, ESE predicado decide; en caso contrario se
     * usa el gate legacy `browserNotifications.enabled`.
     */
    private browserNotificationGateAllows(): boolean {
        // Precedencia: dep inyectada (tests) → registro del dispositivo actual
        // (producción, vía el provider) → gate legacy browserNotifications.enabled.
        if (this.deps.canShowBrowserNotification) {
            return this.deps.canShowBrowserNotification();
        }
        if (currentDeviceBrowserGate) {
            return currentDeviceBrowserGate();
        }
        return this.deps.preferences.browserNotifications.enabled;
    }

    shouldShowBrowserNotification(): boolean {
        return this.browserNotificationGateAllows() && !this.isInQuietHours();
    }

    /**
     * Momento (ms epoch) del próximo fin de la ventana de quiet hours a partir
     * de `now`. Devuelve null si quiet hours está deshabilitado o es un rango
     * degenerado (start === end).
     */
    private nextQuietEnd(nowMs: number): number | null {
        const { quietHours } = this.deps.preferences;
        if (!quietHours.enabled || quietHours.startHour === quietHours.endHour) {
            return null;
        }
        const end = new Date(nowMs);
        end.setHours(quietHours.endHour, 0, 0, 0);
        if (end.getTime() <= nowMs) {
            // El fin ya pasó hoy → siguiente ocurrencia mañana.
            end.setDate(end.getDate() + 1);
        }
        return end.getTime();
    }

    /**
     * Programa UNA presentación OS diferida al fin de la ventana de quiet hours,
     * con clave account/event/revision. Acotado (cap de timers); reemplaza un
     * diferido previo de la misma clave (revisión más nueva gana).
     */
    private scheduleDeferredPresentation(notification: Omit<Notification, 'id' | 'createdAt'>): void {
        const nowMs = this.deps.now ? this.deps.now() : Date.now();
        const quietEnd = this.nextQuietEnd(nowMs);
        if (quietEnd === null) return;

        const setTimer = this.deps.setDeferTimer
            ?? ((cb: () => void, ms: number) => setTimeout(cb, ms) as unknown as number);

        const key = this.deferredKey(notification);

        // Revisión más nueva o reprogramación: cancela el diferido previo.
        const existing = this.deferredPresentations.get(key);
        if (existing) {
            this.clearDeferHandle(existing.handle);
            this.deferredPresentations.delete(key);
        }

        // Cota: si se alcanzó el máximo, descarta el más antiguo.
        if (this.deferredPresentations.size >= this.MAX_DEFERRED_PRESENTATIONS) {
            const oldestKey = this.deferredPresentations.keys().next().value;
            if (oldestKey !== undefined) {
                const oldest = this.deferredPresentations.get(oldestKey);
                if (oldest) this.clearDeferHandle(oldest.handle);
                this.deferredPresentations.delete(oldestKey);
            }
        }

        const delay = Math.max(0, quietEnd - nowMs);
        const handle = setTimer(() => this.fireDeferredPresentation(key), delay);
        this.deferredPresentations.set(key, { key, handle, notification });
    }

    /**
     * Se ejecuta al fin de la ventana. Re-chequea la preferencia/gate y que ya
     * no estemos en quiet hours antes de UNA presentación OS. Si seguimos en una
     * ventana (p. ej. cambió la config), reprograma; si el gate ya no permite,
     * cancela sin presentar.
     */
    private fireDeferredPresentation(key: string): void {
        const entry = this.deferredPresentations.get(key);
        if (!entry) return;
        this.deferredPresentations.delete(key);

        if (!this.browserNotificationGateAllows()) {
            return; // el gate cambió (logout/permiso/desactivado) → no presenta
        }
        if (this.isInQuietHours()) {
            // Aún en quiet hours (ventana reprogramada) → difiere de nuevo.
            this.scheduleDeferredPresentation(entry.notification);
            return;
        }
        void showBrowserNotification(appNotificationToBrowserPayload(entry.notification));
    }

    private clearDeferHandle(handle: number): void {
        if (this.deps.clearDeferTimer) {
            this.deps.clearDeferTimer(handle);
        } else {
            clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
        }
    }

    private deferredKey(notification: Omit<Notification, 'id' | 'createdAt'>): string {
        const eventKey = notification.eventKey ?? `${notification.type}:${notification.title}`;
        const revision = notification.revision ?? 0;
        return `${eventKey}#${revision}`;
    }

    /**
     * Cancela TODAS las presentaciones OS diferidas. Debe invocarse en
     * logout/cambio de cuenta/unmount/cambio de autoridad para que un evento de
     * una sesión anterior no se presente después.
     */
    cancelDeferredPresentations(): void {
        for (const entry of this.deferredPresentations.values()) {
            this.clearDeferHandle(entry.handle);
        }
        this.deferredPresentations.clear();
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
     * ✅ FIX #3: Generate a unique key for debouncing (incluye fecha para deduplicación diaria)
     */
    private getDebounceKey(notification: Omit<Notification, 'id' | 'createdAt'>): string {
        const parts = [notification.type, notification.title];

        // Fecha LOCAL para deduplicación diaria (no UTC: en UTC-5 el corte caía a
        // las 19:00 locales y desalineaba el "día" — minor de la revisión).
        parts.push(localDateKey());

        // Add relevant metadata to key for more specific deduplication
        if (notification.metadata) {
            const { budgetId, recurringPaymentId, transactionId, accountId, debtId, reminderKey } = notification.metadata;
            if (budgetId) parts.push(budgetId);
            if (recurringPaymentId) parts.push(recurringPaymentId);
            if (transactionId) parts.push(transactionId);
            if (accountId) parts.push(accountId);
            if (debtId) parts.push(debtId);
            if (reminderKey) parts.push(reminderKey);
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
            // Fix #10: react-hot-toast uses [role="status"] not [data-sonner-toast]
            const visibleCount = document.querySelectorAll('[role="status"]').length;

            if (visibleCount >= this.MAX_VISIBLE_TOASTS) {
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
     * ✅ FIX #6: Clean up old debounce entries (mejorado para limpiar entradas de más de 24h)
     */
    cleanupDebounceMap(): void {
        const now = Date.now();
        const yesterday = now - (24 * 60 * 60 * 1000);  // 24 horas atrás

        // Eliminar entradas de más de 24 horas
        for (const [key, timestamp] of this.debounceMap.entries()) {
            if (timestamp < yesterday) {
                this.debounceMap.delete(key);
            }
        }

        logger.info(`Cleaned up debounce map, ${this.debounceMap.size} entries remaining`);
    }
}
