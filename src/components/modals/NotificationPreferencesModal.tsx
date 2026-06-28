/**
 * NotificationPreferencesModal - Modal wrapper for notification preferences
 */

import React from 'react';
import { Bell } from 'lucide-react';
import { NotificationPreferences } from '../notifications/NotificationPreferences';
import { BaseModal } from './BaseModal';

interface NotificationPreferencesModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const NotificationPreferencesModal: React.FC<NotificationPreferencesModalProps> = ({
    isOpen,
    onClose,
}) => {
    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title="Configuración de Notificaciones"
            titleIcon={<Bell className="w-5 h-5 text-primary" />}
            maxWidth="max-w-3xl"
        >
            <NotificationPreferences onSave={onClose} />
        </BaseModal>
    );
};
