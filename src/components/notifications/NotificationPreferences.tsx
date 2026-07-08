/**
 * NotificationPreferences - Settings panel for configuring notification behavior
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { useEffect, useState } from 'react';
import { Bell, Clock, AlertTriangle, DollarSign, CreditCard, Users, Save } from 'lucide-react';
import { useNotificationContext } from '../../contexts/NotificationContext';
import toast from 'react-hot-toast';
import {
    getBrowserNotificationPermission,
    requestBrowserNotificationPermission,
    type BrowserNotificationPermission,
} from '../../lib/browserNotifications';
import { UI_TEXT } from '../../config/ui';
import type { NotificationPreferences as NotificationPreferencesType } from '../../types/finance';

interface NotificationPreferencesProps {
    onSave?: () => void;
}

export function NotificationPreferences({ onSave }: NotificationPreferencesProps) {
    const { preferences, updatePreferences } = useNotificationContext();
    const [localPreferences, setLocalPreferences] = useState<NotificationPreferencesType>(preferences);
    const [permission, setPermission] = useState<BrowserNotificationPermission>('unsupported');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setLocalPreferences(preferences);
    }, [preferences]);

    useEffect(() => {
        setPermission(getBrowserNotificationPermission());
    }, []);

    const handleToggle = (type: keyof NotificationPreferencesType['enabled']) => {
        setLocalPreferences((prev) => ({
            ...prev,
            enabled: {
                ...prev.enabled,
                [type]: !prev.enabled[type],
            },
        }));
    };

    const handleThresholdChange = (
        threshold: keyof NotificationPreferencesType['thresholds'],
        value: string
    ) => {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return;

        setLocalPreferences((prev) => ({
            ...prev,
            thresholds: {
                ...prev.thresholds,
                [threshold]: numValue,
            },
        }));
    };

    const handleQuietHoursToggle = () => {
        setLocalPreferences((prev) => ({
            ...prev,
            quietHours: {
                ...prev.quietHours,
                enabled: !prev.quietHours.enabled,
            },
        }));
    };

    const handleQuietHoursChange = (field: 'startHour' | 'endHour', value: string) => {
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 0 || numValue > 23) return;

        setLocalPreferences((prev) => ({
            ...prev,
            quietHours: {
                ...prev.quietHours,
                [field]: numValue,
            },
        }));
    };

    const handleBrowserPermissionRequest = async () => {
        const nextPermission = await requestBrowserNotificationPermission();
        setPermission(nextPermission);

        if (nextPermission === 'granted') {
            setLocalPreferences((prev) => ({
                ...prev,
                browserNotifications: {
                    ...prev.browserNotifications,
                    enabled: true,
                },
            }));
            toast.success('Permiso de notificaciones concedido');
            return;
        }

        if (nextPermission === 'denied') {
            toast.error('Las notificaciones están bloqueadas en este navegador');
            return;
        }

        if (nextPermission === 'unsupported') {
            toast.error('Este navegador no soporta notificaciones del sistema');
        }
    };

    const handleBrowserNotificationsToggle = async () => {
        if (localPreferences.browserNotifications.enabled) {
            setLocalPreferences((prev) => ({
                ...prev,
                browserNotifications: {
                    ...prev.browserNotifications,
                    enabled: false,
                },
            }));
            return;
        }

        let nextPermission = permission;
        if (nextPermission === 'default') {
            nextPermission = await requestBrowserNotificationPermission();
            setPermission(nextPermission);
        }

        if (nextPermission !== 'granted') {
            toast.error(
                nextPermission === 'denied'
                    ? 'Las notificaciones están bloqueadas en este navegador'
                    : 'Primero concede el permiso de notificaciones'
            );
            return;
        }

        setLocalPreferences((prev) => ({
            ...prev,
            browserNotifications: {
                ...prev.browserNotifications,
                enabled: true,
            },
        }));
    };

    const handleDailyReminderToggle = () => {
        setLocalPreferences((prev) => ({
            ...prev,
            dailyExpenseReminder: {
                ...prev.dailyExpenseReminder,
                enabled: !prev.dailyExpenseReminder.enabled,
            },
        }));
    };

    const handleReminderTimeChange = (value: string) => {
        const [hourValue, minuteValue] = value.split(':');
        const hour = parseInt(hourValue, 10);
        const minute = parseInt(minuteValue, 10);

        if (isNaN(hour) || isNaN(minute)) return;
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return;

        setLocalPreferences((prev) => ({
            ...prev,
            dailyExpenseReminder: {
                ...prev.dailyExpenseReminder,
                hour,
                minute,
            },
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            let preferencesToSave = localPreferences;
            if (localPreferences.browserNotifications.enabled && permission !== 'granted') {
                const nextPermission = await requestBrowserNotificationPermission();
                setPermission(nextPermission);

                if (nextPermission !== 'granted') {
                    preferencesToSave = {
                        ...localPreferences,
                        browserNotifications: {
                            ...localPreferences.browserNotifications,
                            enabled: false,
                        },
                    };
                    setLocalPreferences(preferencesToSave);
                    toast.error('No se activaron las notificaciones del sistema');
                }
            }

            await updatePreferences(preferencesToSave);
            toast.success('Preferencias guardadas correctamente');
            // Cerrar el modal después de guardar
            if (onSave) {
                setTimeout(() => {
                    onSave();
                }, 500);
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'Error al guardar preferencias');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Browser Notifications */}
            <div className="card">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Bell className="w-5 h-5 text-muted-foreground" />
                        <h3 className="text-lg font-semibold text-foreground">
                            Notificaciones en este dispositivo
                        </h3>
                    </div>
                    <span className={`self-start px-2.5 py-1 rounded-full text-xs font-semibold ${getPermissionBadgeClass(permission)}`}>
                        {getPermissionLabel(permission)}
                    </span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                    Permite que MoneyTrack muestre avisos reales del navegador en tu PC o celular.
                </p>
                <div className="space-y-3">
                    <button
                        type="button"
                        onClick={handleBrowserPermissionRequest}
                        disabled={permission === 'granted' || permission === 'unsupported'}
                        className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none"
                    >
                        <Bell className="w-5 h-5" />
                        {permission === 'granted' ? 'Permiso concedido' : 'Permitir notificaciones'}
                    </button>
                    <ToggleItem
                        icon={<Bell className="w-5 h-5" />}
                        label="Notificaciones normales"
                        description="Muestra alertas de presupuestos, pagos, saldos y deudas como notificaciones del sistema"
                        checked={localPreferences.browserNotifications.enabled && permission === 'granted'}
                        onChange={handleBrowserNotificationsToggle}
                        disabled={permission === 'unsupported' || permission === 'denied'}
                    />
                    {permission === 'denied' && (
                        <p className="text-xs text-destructive">
                            El permiso está bloqueado. Debes activarlo desde la configuración del navegador o del dispositivo.
                        </p>
                    )}
                </div>
            </div>

            {/* Daily Expense Reminder */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-muted-foreground" />
                        <h3 className="text-lg font-semibold text-foreground">
                            Recordatorio diario de gastos
                        </h3>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={localPreferences.dailyExpenseReminder.enabled}
                            onChange={handleDailyReminderToggle}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:bg-primary-solid"></div>
                    </label>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                    Elige la hora en la que quieres que MoneyTrack te recuerde agregar tus gastos.
                </p>
                {localPreferences.dailyExpenseReminder.enabled && (
                    <div className="space-y-2">
                        <div className="max-w-xs">
                            <label htmlFor="daily-expense-reminder-time" className="label-base">
                                Hora del aviso
                            </label>
                            <input
                                id="daily-expense-reminder-time"
                                type="time"
                                value={`${localPreferences.dailyExpenseReminder.hour.toString().padStart(2, '0')}:${localPreferences.dailyExpenseReminder.minute.toString().padStart(2, '0')}`}
                                onChange={(e) => handleReminderTimeChange(e.target.value)}
                                className="input-base"
                            />
                        </div>
                        {(!localPreferences.browserNotifications.enabled || permission !== 'granted') && (
                            <p className="text-xs text-warning">
                                Para recibir este aviso en el PC o celular, activa las notificaciones en este dispositivo.
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Notification Types */}
            <div className="card">
                <h3 className="text-lg font-semibold text-foreground mb-4">
                    Tipos de notificaciones
                </h3>
                <div className="space-y-4">
                    <ToggleItem
                        icon={<DollarSign className="w-5 h-5" />}
                        label="Alertas de presupuesto"
                        description="Recibe notificaciones cuando te acerques o excedas tus límites de presupuesto"
                        checked={localPreferences.enabled.budget}
                        onChange={() => handleToggle('budget')}
                    />
                    <ToggleItem
                        icon={<CreditCard className="w-5 h-5" />}
                        label="Recordatorios de pagos"
                        description="Recibe recordatorios antes de que venzan tus pagos recurrentes"
                        checked={localPreferences.enabled.recurring}
                        onChange={() => handleToggle('recurring')}
                    />
                    <ToggleItem
                        icon={<AlertTriangle className="w-5 h-5" />}
                        label="Gastos inusuales"
                        description="Recibe alertas cuando realices compras significativamente mayores al promedio"
                        checked={localPreferences.enabled.unusualSpending}
                        onChange={() => handleToggle('unusualSpending')}
                    />
                    <ToggleItem
                        icon={<DollarSign className="w-5 h-5" />}
                        label="Saldo bajo"
                        description="Recibe alertas cuando el saldo de tus cuentas caiga por debajo del umbral"
                        checked={localPreferences.enabled.lowBalance}
                        onChange={() => handleToggle('lowBalance')}
                    />
                    <ToggleItem
                        icon={<Users className="w-5 h-5" />}
                        label="Recordatorios de deudas"
                        description="Recibe recordatorios sobre deudas pendientes"
                        checked={localPreferences.enabled.debt}
                        onChange={() => handleToggle('debt')}
                    />
                </div>
            </div>

            {/* Thresholds */}
            <div className="card">
                <h3 className="text-lg font-semibold text-foreground mb-4">
                    Umbrales de alerta
                </h3>
                <div className="space-y-4">
                    <ThresholdInput
                        label="Advertencia de presupuesto"
                        value={localPreferences.thresholds.budgetWarning}
                        onChange={(v) => handleThresholdChange('budgetWarning', v)}
                        suffix="%"
                        min={0}
                        max={100}
                        description="Alerta cuando alcances este porcentaje del presupuesto"
                    />
                    <ThresholdInput
                        label="Presupuesto crítico"
                        value={localPreferences.thresholds.budgetCritical}
                        onChange={(v) => handleThresholdChange('budgetCritical', v)}
                        suffix="%"
                        min={0}
                        max={100}
                        description="Alerta de alta prioridad a este porcentaje"
                    />
                    <ThresholdInput
                        label="Presupuesto excedido"
                        value={localPreferences.thresholds.budgetExceeded}
                        onChange={(v) => handleThresholdChange('budgetExceeded', v)}
                        suffix="%"
                        min={0}
                        max={200}
                        description="Alerta cuando excedas el presupuesto"
                    />
                    <ThresholdInput
                        label="Gasto inusual"
                        value={localPreferences.thresholds.unusualSpending}
                        onChange={(v) => handleThresholdChange('unusualSpending', v)}
                        suffix="%"
                        min={100}
                        max={1000}
                        description="Alerta cuando un gasto supere este porcentaje del promedio"
                    />
                    <ThresholdInput
                        label="Saldo bajo"
                        value={localPreferences.thresholds.lowBalance}
                        onChange={(v) => handleThresholdChange('lowBalance', v)}
                        suffix="COP"
                        min={0}
                        max={10000000}
                        step={10000}
                        description="Alerta cuando el saldo caiga por debajo de este monto"
                    />
                </div>
            </div>

            {/* Quiet Hours */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-muted-foreground" />
                        <h3 className="text-lg font-semibold text-foreground">
                            Horas silenciosas
                        </h3>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={localPreferences.quietHours.enabled}
                            onChange={handleQuietHoursToggle}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:bg-primary-solid"></div>
                    </label>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                    No mostrar notificaciones emergentes durante estas horas (las notificaciones se guardarán en el centro)
                </p>
                {localPreferences.quietHours.enabled && (
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="label-base">
                                Desde
                            </label>
                            <select
                                value={localPreferences.quietHours.startHour}
                                onChange={(e) => handleQuietHoursChange('startHour', e.target.value)}
                                className="input-base"
                            >
                                {Array.from({ length: 24 }, (_, i) => (
                                    <option key={i} value={i}>
                                        {i.toString().padStart(2, '0')}:00
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="label-base">
                                Hasta
                            </label>
                            <select
                                value={localPreferences.quietHours.endHour}
                                onChange={(e) => handleQuietHoursChange('endHour', e.target.value)}
                                className="input-base"
                            >
                                {Array.from({ length: 24 }, (_, i) => (
                                    <option key={i} value={i}>
                                        {i.toString().padStart(2, '0')}:00
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save className="w-5 h-5" />
                    {saving ? UI_TEXT.states.saving : 'Guardar cambios'}
                </button>
            </div>
        </div>
    );
}

// Helper Components
interface ToggleItemProps {
    icon: React.ReactNode;
    label: string;
    description: string;
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
}

function ToggleItem({ icon, label, description, checked, onChange, disabled = false }: ToggleItemProps) {
    return (
        <div className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${disabled ? 'opacity-60' : 'hover:bg-muted'}`}>
            <div className="text-muted-foreground mt-1">{icon}</div>
            <div className="flex-1">
                <h4 className="text-sm font-medium text-foreground">{label}</h4>
                <p className="text-xs text-muted-foreground mt-1">{description}</p>
            </div>
            <label className={`relative inline-flex items-center ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="sr-only peer" />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:bg-primary-solid"></div>
            </label>
        </div>
    );
}

function getPermissionLabel(permission: BrowserNotificationPermission): string {
    switch (permission) {
        case 'granted':
            return 'Permitido';
        case 'denied':
            return 'Bloqueado';
        case 'default':
            return 'Sin permiso';
        case 'unsupported':
        default:
            return 'No disponible';
    }
}

function getPermissionBadgeClass(permission: BrowserNotificationPermission): string {
    switch (permission) {
        case 'granted':
            return 'bg-success-muted text-success';
        case 'denied':
            return 'bg-destructive-muted text-destructive';
        case 'default':
            return 'bg-warning-muted text-warning';
        case 'unsupported':
        default:
            return 'bg-muted text-muted-foreground';
    }
}

interface ThresholdInputProps {
    label: string;
    value: number;
    onChange: (value: string) => void;
    suffix: string;
    min: number;
    max: number;
    step?: number;
    description: string;
}

function ThresholdInput({
    label,
    value,
    onChange,
    suffix,
    min,
    max,
    step = 1,
    description,
}: ThresholdInputProps) {
    return (
        <div>
            <label className="label-base">
                {label}
            </label>
            <div className="flex items-center gap-2">
                <input
                    type="number"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    min={min}
                    max={max}
                    step={step}
                    className="input-base flex-1"
                />
                <span className="text-sm font-medium text-muted-foreground w-16">
                    {suffix}
                </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
    );
}
