/**
 * NotificationCenter - Dropdown panel for displaying and managing notifications
 *
 * Fix #4/#5: Uses NotificationContext instead of creating its own Firestore subscription
 * Fix #11: Uses history.pushState for SPA navigation instead of full page reload
 * Fix #12: Removed unused getSeverityColor
 */

import { createPortal } from 'react-dom';
import { Bell, X, CheckCheck, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNotificationContext } from '../../contexts/NotificationContext';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Notification } from '../../types/finance';

interface NotificationCenterProps {
    isOpen: boolean;
    onClose: () => void;
}

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
    const {
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
    } = useNotificationContext();

    const handleNotificationClick = async (notification: Notification) => {
        if (!notification.isRead && notification.id) {
            await markAsRead(notification.id);
        }
        // Fix #11: actionUrls are internal paths — no need to navigate in a SPA
        // The app uses tab-based navigation, not routes, so actionUrl is informational only
        onClose();
    };

    const getSeverityIcon = (severity: Notification['severity']) => {
        switch (severity) {
            case 'error': return '❌';
            case 'warning': return '⚠️';
            case 'success': return '✅';
            case 'info':
            default: return 'ℹ️';
        }
    };

    if (!isOpen) return null;

    return createPortal(
        // z-[110]: por encima del header (z-[100]). Antes en z-[90] el header se
        // pintaba ENCIMA y recortaba el borde superior del panel (el menú del
        // engranaje no se recortaba por ser descendiente del header).
        <div className="fixed inset-0 z-[110] flex items-start justify-end p-4 pt-16">
            {/* Backdrop transparente: sin tinte, solo captura el click-fuera para cerrar. */}
            <div
                className="absolute inset-0 -z-10"
                onClick={(e) => { e.stopPropagation(); onClose(); }}
            />
            <div
                data-notification-center
                className="relative w-[calc(100vw-2rem)] sm:w-[420px] max-h-[calc(100vh-6rem)] bg-card text-card-foreground rounded-2xl shadow-2xl border border-border flex flex-col animate-in fade-in zoom-in duration-200"
                onClick={(e) => e.stopPropagation()}
            >
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
                        className="p-2 hover:bg-white/80 dark:hover:bg-gray-700/80 rounded-xl transition-[background-color,transform] hover:scale-105 active:scale-95"
                        aria-label="Cerrar notificaciones"
                    >
                        <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                </div>

                {/* Notifications List */}
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                    {notifications.length === 0 ? (
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
                            {notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    onClick={() => handleNotificationClick(notification)}
                                    className={`group p-4 hover:bg-gradient-to-r hover:from-gray-50 hover:to-transparent dark:hover:from-gray-700/30 dark:hover:to-transparent cursor-pointer transition-colors ${!notification.isRead ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 mt-1">
                                            {!notification.isRead ? (
                                                <div className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-pulse" />
                                            ) : (
                                                <div className="w-2.5 h-2.5" />
                                            )}
                                        </div>
                                        <div className="text-2xl flex-shrink-0 transform group-hover:scale-110 transition-transform">
                                            {getSeverityIcon(notification.severity)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 line-clamp-2">
                                                {notification.title}
                                            </h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                                                {notification.message}
                                            </p>
                                            <span className="text-xs text-gray-500 dark:text-gray-500 font-medium">
                                                {formatDistanceToNow(new Date(notification.createdAt), {
                                                    addSuffix: true,
                                                    locale: es,
                                                })}
                                            </span>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (notification.id) deleteNotification(notification.id);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-[opacity,background-color,transform] flex-shrink-0 hover:scale-110 active:scale-95"
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
                            onClick={async (e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                try {
                                    await markAllAsRead();
                                    toast.success('Todas las notificaciones marcadas como leídas');
                                } catch {
                                    toast.error('Error al marcar notificaciones como leídas');
                                }
                            }}
                            disabled={unreadCount === 0}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-xl transition-[box-shadow,background-color,transform] shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <CheckCheck className="w-4 h-4" />
                            <span className="hidden sm:inline">Marcar leídas</span>
                            <span className="sm:hidden">Leídas</span>
                        </button>
                        <button
                            onClick={async (e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                try {
                                    await clearAll();
                                    toast.success('Todas las notificaciones eliminadas');
                                    onClose();
                                } catch {
                                    toast.error('Error al eliminar notificaciones');
                                }
                            }}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-xl transition-[box-shadow,background-color,transform] shadow-sm hover:shadow hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <Trash2 className="w-4 h-4" />
                            <span className="hidden sm:inline">Limpiar todas</span>
                            <span className="sm:hidden">Limpiar</span>
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

// Bell icon button — uses context instead of its own subscription (fix #5)
interface NotificationBellProps {
    isOpen: boolean;
    onToggle: () => void;
    onClose: () => void;
}

export function NotificationBell({ isOpen, onToggle }: NotificationBellProps) {
    const { unreadCount } = useNotificationContext();

    return (
        <button
            onClick={onToggle}
            className="header-icon"
            aria-label="Notificaciones"
            aria-expanded={isOpen}
            aria-haspopup="dialog"
        >
            <Bell size={20} aria-hidden="true" />
            {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold leading-none text-white bg-destructive rounded-full ring-2 ring-card">
                    {unreadCount > 9 ? '9+' : unreadCount}
                </span>
            )}
        </button>
    );
}
