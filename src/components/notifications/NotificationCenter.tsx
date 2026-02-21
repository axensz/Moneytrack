/**
 * NotificationCenter - Dropdown panel for displaying and managing notifications
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, CheckCheck, Trash2 } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuth } from '../../hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Notification } from '../../types/finance';

interface NotificationCenterProps {
    isOpen: boolean;
    onClose: () => void;
}

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
    const { user } = useAuth();
    const {
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
    } = useNotifications(user?.uid || null);

    // Get all notifications (no filter)
    const filteredNotifications = useMemo(() => {
        return notifications;
    }, [notifications]);

    // Handle notification click
    const handleNotificationClick = async (notification: Notification) => {
        if (!notification.isRead && notification.id) {
            await markAsRead(notification.id);
        }

        // Navigate to action URL if present
        if (notification.actionUrl) {
            window.location.href = notification.actionUrl;
            onClose();
        }
    };

    // Get severity color (unused but kept for future use)
    const getSeverityColor = (severity: Notification['severity']) => {
        switch (severity) {
            case 'error':
                return 'text-red-600 bg-red-50 border-red-200';
            case 'warning':
                return 'text-yellow-600 bg-yellow-50 border-yellow-200';
            case 'success':
                return 'text-green-600 bg-green-50 border-green-200';
            case 'info':
            default:
                return 'text-blue-600 bg-blue-50 border-blue-200';
        }
    };

    // Get severity icon
    const getSeverityIcon = (severity: Notification['severity']) => {
        switch (severity) {
            case 'error':
                return '❌';
            case 'warning':
                return '⚠️';
            case 'success':
                return '✅';
            case 'info':
            default:
                return 'ℹ️';
        }
    };

    if (!isOpen) return null;

    // Use portal to render outside of header DOM hierarchy
    return createPortal(
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="fixed top-20 right-4 w-[calc(100vw-2rem)] sm:w-[420px] max-h-[calc(100vh-6rem)] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 z-50 flex flex-col animate-in slide-in-from-top-4 fade-in duration-300">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/80 dark:border-gray-700/80 bg-gradient-to-r from-purple-50/50 to-blue-50/50 dark:from-purple-900/10 dark:to-blue-900/10 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
                            <Bell className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                                Notificaciones
                            </h2>
                            {unreadCount > 0 && (
                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                    {unreadCount} sin leer
                                </p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/80 dark:hover:bg-gray-700/80 rounded-xl transition-all hover:scale-105 active:scale-95"
                        aria-label="Cerrar notificaciones"
                    >
                        <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                </div>

                {/* Filter Tabs - REMOVED */}

                {/* Notifications List */}
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                    {filteredNotifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400 px-6">
                            <div className="p-4 bg-gray-100 dark:bg-gray-700/50 rounded-2xl mb-4">
                                <Bell className="w-12 h-12 opacity-40" />
                            </div>
                            <p className="text-sm font-medium">No hay notificaciones</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                Te avisaremos cuando haya algo nuevo
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                            {filteredNotifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    onClick={() => handleNotificationClick(notification)}
                                    className={`group p-4 hover:bg-gradient-to-r hover:from-gray-50 hover:to-transparent dark:hover:from-gray-700/30 dark:hover:to-transparent cursor-pointer transition-all ${!notification.isRead ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''
                                        }`}
                                >
                                    <div className="flex items-start gap-3">
                                        {/* Unread indicator */}
                                        <div className="flex-shrink-0 mt-1">
                                            {!notification.isRead ? (
                                                <div className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-pulse" />
                                            ) : (
                                                <div className="w-2.5 h-2.5" />
                                            )}
                                        </div>

                                        {/* Severity icon */}
                                        <div className="text-2xl flex-shrink-0 transform group-hover:scale-110 transition-transform">
                                            {getSeverityIcon(notification.severity)}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 line-clamp-2">
                                                {notification.title}
                                            </h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                                                {notification.message}
                                            </p>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs text-gray-500 dark:text-gray-500 font-medium">
                                                    {formatDistanceToNow(new Date(notification.createdAt), {
                                                        addSuffix: true,
                                                        locale: es,
                                                    })}
                                                </span>
                                                {notification.actionUrl && (
                                                    <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                                                        Ver
                                                        <span className="transform group-hover:translate-x-0.5 transition-transform">→</span>
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Delete button */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (notification.id) {
                                                    deleteNotification(notification.id);
                                                }
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all flex-shrink-0 hover:scale-110 active:scale-95"
                                            aria-label="Eliminar notificación"
                                        >
                                            <X className="w-4 h-4 text-gray-400 hover:text-red-600 dark:hover:text-red-400" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                {notifications.length > 0 && (
                    <div className="flex gap-2 p-4 border-t border-gray-200/80 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-800/50 rounded-b-2xl">
                        <button
                            onClick={markAllAsRead}
                            disabled={unreadCount === 0}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-xl transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <CheckCheck className="w-4 h-4" />
                            <span className="hidden sm:inline">Marcar leídas</span>
                            <span className="sm:hidden">Leídas</span>
                        </button>
                        <button
                            onClick={clearAll}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-xl transition-all shadow-sm hover:shadow hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <Trash2 className="w-4 h-4" />
                            <span className="hidden sm:inline">Limpiar todas</span>
                            <span className="sm:hidden">Limpiar</span>
                        </button>
                    </div>
                )}
            </div>
        </>,
        document.body
    );
}

// Bell icon button component for header
interface NotificationBellProps {
    isOpen: boolean;
    onToggle: () => void;
    onClose: () => void;
}

export function NotificationBell({ isOpen, onToggle }: NotificationBellProps) {
    const { user } = useAuth();
    const { unreadCount } = useNotifications(user?.uid || null);

    return (
        <button
            onClick={onToggle}
            className="p-2 sm:p-2.5 text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 active:bg-gray-100 dark:active:bg-gray-800 rounded-lg transition-colors"
            aria-label="Notificaciones"
            aria-expanded={isOpen}
        >
            <Bell size={20} className="text-gray-600 dark:text-gray-400" aria-hidden="true" />
            {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                </span>
            )}
        </button>
    );
}
