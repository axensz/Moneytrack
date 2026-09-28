/**
 * NotificationPreferencesModal - Modal wrapper for notification preferences
 */

import React from 'react';
import { Bell } from 'lucide-react';
import { NotificationPreferences } from '../notifications/NotificationPreferences';
import { BaseModal } from './BaseModal';
import { UI_TEXT } from '../../config/ui';

interface NotificationPreferencesModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRequestSignIn?: () => void;
}

export const NotificationPreferencesModal: React.FC<NotificationPreferencesModalProps> = ({
    isOpen,
    onClose,
    onRequestSignIn,
}) => {
    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title={UI_TEXT.titles.notificationSettings}
            titleIcon={<Bell className="w-5 h-5 text-primary" />}
            maxWidth="max-w-3xl"
        >
            <NotificationPreferences onSave={onClose} onRequestSignIn={onRequestSignIn} />
        </BaseModal>
    );
};
