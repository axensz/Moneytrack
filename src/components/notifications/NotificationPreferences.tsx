/**
 * NotificationPreferences - Settings panel for configuring notification behavior
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { useState } from 'react';
import { Clock, AlertTriangle, DollarSign, CreditCard, Users, Save } from 'lucide-react';
import { useNotificationContext } from '../../contexts/NotificationContext';
import toast from 'react-hot-toast';
import type { NotificationPreferences as NotificationPreferencesType } from '../../types/finance';

interface NotificationPreferencesProps {
    onSave?: () => void;
}

export function NotificationPreferences({ onSave }: NotificationPreferencesProps) {
    const { preferences, updatePreferences } = useNotificationContext();
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
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'Error al guardar preferencias');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Notification Types */}
            <div className="card">
                <h3 className="text-lg font-semibold text-foreground mb-4">
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
            <div className="card">
                <h3 className="text-lg font-semibold text-foreground mb-4">
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
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-muted-foreground" />
                        <h3 className="text-lg font-semibold text-foreground">
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
        <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted transition-colors">
            <div className="text-muted-foreground mt-1">{icon}</div>
            <div className="flex-1">
                <h4 className="text-sm font-medium text-foreground">{label}</h4>
                <p className="text-xs text-muted-foreground mt-1">{description}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:bg-primary-solid"></div>
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
