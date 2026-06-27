/**
 * NotificationPreferencesModal - Modal wrapper for notification preferences
 */

import React from 'react';
import { X } from 'lucide-react';
import { NotificationPreferences } from '../notifications/NotificationPreferences';
import { useModalA11y } from '../../hooks/useModalA11y';

interface NotificationPreferencesModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const NotificationPreferencesModal: React.FC<NotificationPreferencesModalProps> = ({
    isOpen,
    onClose,
}) => {
    // A11y: Escape, focus trap y restauración de foco.
    const { modalRef, onKeyDown } = useModalA11y({ isOpen, onClose });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div
                ref={modalRef}
                onKeyDown={onKeyDown}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label="Configuración de Notificaciones"
                className="relative w-full max-w-3xl max-h-[90vh] rounded-xl shadow-2xl overflow-hidden outline-none"
                style={{ background: 'var(--card)', color: 'var(--card-foreground)' }}
            >
                {/* Header */}
                <div
                    className="sticky top-0 z-10 flex items-center justify-between p-6 border-b"
                    style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
                >
                    <h2 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                        Configuración de Notificaciones
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg transition-colors hover:bg-[var(--muted)]"
                        aria-label="Cerrar"
                        style={{ color: 'var(--muted-foreground)' }}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
                    <NotificationPreferences onSave={onClose} />
                </div>
            </div>
        </div>
    );
};
