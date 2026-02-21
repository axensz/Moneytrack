/**
 * NotificationPreferences - Settings panel for configuring notification behavior
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { useState } from 'react';
import { Bell, Clock, AlertTriangle, DollarSign, CreditCard, Users, Save } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuth } from '../../hooks/useAuth';
import toast from 'react-hot-toast';
import type { NotificationPreferences as NotificationPreferencesType } from '../../types/finance';

interface NotificationPreferencesProps {
    onSave?: () => void;
}

export function NotificationPreferences({ onSave }: NotificationPreferencesProps) {
    const { user } = useAuth();
    const { preferences, updatePreferences } = useNotifications(user?.uid || null);
    const [localPreferences, setLocalPreferences] = useState<NotificationPreferencesType>(preferences);
    const [saving, setSaving] = useState(false);

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

    const handleSave = async () => {
        setSaving(true);
        try {
            await updatePreferences(localPreferences);
            toast.success('Preferencias guardadas correctamente');
            // Cerrar el modal después de guardar
            if (onSave) {
                setTimeout(() => {
                    onSave();
                }, 500);
            }
        } catch (error: any) {
            toast.error(error.message || 'Error al guardar preferencias');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto p-6 space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <Bell className="w-6 h-6 text-blue-600" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Configuración de Notificaciones
                </h2>
            </div>

            {/* Notification Types */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Tipos de Notificaciones
                </h3>
                <div className="space-y-4">
                    <ToggleItem
                        icon={<DollarSign className="w-5 h-5" />}
                        label="Alertas de Presupuesto"
                        description="Recibe notificaciones cuando te acerques o excedas tus límites de presupuesto"
                        checked={localPreferences.enabled.budget}
                        onChange={() => handleToggle('budget')}
                    />
                    <ToggleItem
                        icon={<CreditCard className="w-5 h-5" />}
                        label="Recordatorios de Pagos"
                        description="Recibe recordatorios antes de que venzan tus pagos recurrentes"
                        checked={localPreferences.enabled.recurring}
                        onChange={() => handleToggle('recurring')}
                    />
                    <ToggleItem
                        icon={<AlertTriangle className="w-5 h-5" />}
                        label="Gastos Inusuales"
                        description="Recibe alertas cuando realices compras significativamente mayores al promedio"
                        checked={localPreferences.enabled.unusualSpending}
                        onChange={() => handleToggle('unusualSpending')}
                    />
                    <ToggleItem
                        icon={<DollarSign className="w-5 h-5" />}
                        label="Saldo Bajo"
                        description="Recibe alertas cuando el saldo de tus cuentas caiga por debajo del umbral"
                        checked={localPreferences.enabled.lowBalance}
                        onChange={() => handleToggle('lowBalance')}
                    />
                    <ToggleItem
                        icon={<Users className="w-5 h-5" />}
                        label="Recordatorios de Deudas"
                        description="Recibe recordatorios sobre deudas pendientes"
                        checked={localPreferences.enabled.debt}
                        onChange={() => handleToggle('debt')}
                    />
                </div>
            </div>

            {/* Thresholds */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Umbrales de Alerta
                </h3>
                <div className="space-y-4">
                    <ThresholdInput
                        label="Advertencia de Presupuesto"
                        value={localPreferences.thresholds.budgetWarning}
                        onChange={(v) => handleThresholdChange('budgetWarning', v)}
                        suffix="%"
                        min={0}
                        max={100}
                        description="Alerta cuando alcances este porcentaje del presupuesto"
                    />
                    <ThresholdInput
                        label="Presupuesto Crítico"
                        value={localPreferences.thresholds.budgetCritical}
                        onChange={(v) => handleThresholdChange('budgetCritical', v)}
                        suffix="%"
                        min={0}
                        max={100}
                        description="Alerta de alta prioridad a este porcentaje"
                    />
                    <ThresholdInput
                        label="Presupuesto Excedido"
                        value={localPreferences.thresholds.budgetExceeded}
                        onChange={(v) => handleThresholdChange('budgetExceeded', v)}
                        suffix="%"
                        min={0}
                        max={200}
                        description="Alerta cuando excedas el presupuesto"
                    />
                    <ThresholdInput
                        label="Gasto Inusual"
                        value={localPreferences.thresholds.unusualSpending}
                        onChange={(v) => handleThresholdChange('unusualSpending', v)}
                        suffix="%"
                        min={100}
                        max={1000}
                        description="Alerta cuando un gasto supere este porcentaje del promedio"
                    />
                    <ThresholdInput
                        label="Saldo Bajo"
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
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Horas Silenciosas
                        </h3>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={localPreferences.quietHours.enabled}
                            onChange={handleQuietHoursToggle}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </label>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    No mostrar notificaciones emergentes durante estas horas (las notificaciones se guardarán en el centro)
                </p>
                {localPreferences.quietHours.enabled && (
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Desde
                            </label>
                            <select
                                value={localPreferences.quietHours.startHour}
                                onChange={(e) => handleQuietHoursChange('startHour', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                            >
                                {Array.from({ length: 24 }, (_, i) => (
                                    <option key={i} value={i}>
                                        {i.toString().padStart(2, '0')}:00
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Hasta
                            </label>
                            <select
                                value={localPreferences.quietHours.endHour}
                                onChange={(e) => handleQuietHoursChange('endHour', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
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
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save className="w-5 h-5" />
                    {saving ? 'Guardando...' : 'Guardar Cambios'}
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
}

function ToggleItem({ icon, label, description, checked, onChange }: ToggleItemProps) {
    return (
        <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            <div className="text-gray-600 dark:text-gray-400 mt-1">{icon}</div>
            <div className="flex-1">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white">{label}</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{description}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
        </div>
    );
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400 w-16">
                    {suffix}
                </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{description}</p>
        </div>
    );
}
