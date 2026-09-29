/**
 * NotificationPreferences — truthful, scoped, accessible notification settings.
 *
 * The foreground device-status surface is derived from the current device's
 * reconciled state (`currentDevice.state`), NOT from the legacy
 * `browserNotifications.enabled` flag. A legacy flag saved from another device
 * can never flip this device's authenticated presentation gate — the badge and
 * primary action come from `currentDevice.state` alone.
 *
 * Draft/validation/a11y: the form keeps a local draft that survives failed
 * saves; validation errors preserve the entire draft, focus the first invalid
 * input, and announce via an aria-live alert; a rejected persistence keeps the
 * draft and exposes a retry that submits the SAME draft once.
 */

import { useEffect, useRef, useState } from 'react';
import { Bell, Clock, AlertTriangle, DollarSign, CreditCard, Users, Save } from 'lucide-react';
import { useNotificationContext } from '../../contexts/NotificationContext';
import { showToast } from '../../utils/toastHelpers';
import { UI_TEXT } from '../../config/ui';
import type { NotificationPreferences as NotificationPreferencesType } from '../../types/finance';
import type {
    ActionReason,
    CurrentDeviceState,
    DeviceActionResult,
    DevicePendingAction,
} from '../../hooks/useCurrentDeviceNotifications';

interface NotificationPreferencesProps {
    onSave?: () => void;
    onRequestSignIn?: () => void;
}

type InvalidField =
    | 'budgetWarning'
    | 'budgetCritical'
    | 'budgetExceeded'
    | 'unusualSpending'
    | 'lowBalance'
    | null;

/** Maps a thrown validation message to the first offending threshold field. */
function invalidFieldFromMessage(message: string): InvalidField {
    if (/warning/i.test(message)) return 'budgetWarning';
    if (/critical/i.test(message)) return 'budgetCritical';
    if (/exceeded/i.test(message)) return 'budgetExceeded';
    if (/unusual/i.test(message)) return 'unusualSpending';
    if (/balance/i.test(message)) return 'lowBalance';
    return null;
}

export function NotificationPreferences({ onSave, onRequestSignIn }: NotificationPreferencesProps) {
    const { preferences, updatePreferences, currentDevice } = useNotificationContext();
    const [localPreferences, setLocalPreferences] = useState<NotificationPreferencesType>(preferences);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [invalidField, setInvalidField] = useState<InvalidField>(null);

    const warningRef = useRef<HTMLInputElement>(null);
    const criticalRef = useRef<HTMLInputElement>(null);
    const exceededRef = useRef<HTMLInputElement>(null);
    const unusualRef = useRef<HTMLInputElement>(null);
    const lowBalanceRef = useRef<HTMLInputElement>(null);

    // On (re)open, the draft resets to the persisted preferences. A modal
    // close/reopen therefore preserves only intended persisted values.
    useEffect(() => {
        setLocalPreferences(preferences);
        setSaveError(null);
        setInvalidField(null);
    }, [preferences]);

    const focusInvalid = (field: InvalidField) => {
        const map: Record<Exclude<InvalidField, null>, React.RefObject<HTMLInputElement | null>> = {
            budgetWarning: warningRef,
            budgetCritical: criticalRef,
            budgetExceeded: exceededRef,
            unusualSpending: unusualRef,
            lowBalance: lowBalanceRef,
        };
        if (field) map[field].current?.focus();
    };

    const handleToggle = (type: keyof NotificationPreferencesType['enabled']) => {
        setLocalPreferences((prev) => ({
            ...prev,
            enabled: { ...prev.enabled, [type]: !prev.enabled[type] },
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
            thresholds: { ...prev.thresholds, [threshold]: numValue },
        }));
    };

    const handleQuietHoursToggle = () => {
        setLocalPreferences((prev) => ({
            ...prev,
            quietHours: { ...prev.quietHours, enabled: !prev.quietHours.enabled },
        }));
    };

    const handleQuietHoursChange = (field: 'startHour' | 'endHour', value: string) => {
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 0 || numValue > 23) return;
        setLocalPreferences((prev) => ({
            ...prev,
            quietHours: { ...prev.quietHours, [field]: numValue },
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
            dailyExpenseReminder: { ...prev.dailyExpenseReminder, hour, minute },
        }));
    };

    /** Persists the CURRENT draft once. Preserves the draft on any failure. */
    const persistDraft = async (draft: NotificationPreferencesType): Promise<boolean> => {
        setSaving(true);
        setSaveError(null);
        setInvalidField(null);
        try {
            await updatePreferences(draft);
            return true;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'No se pudieron guardar las preferencias.';
            const field = invalidFieldFromMessage(message);
            if (field) {
                setInvalidField(field);
                setSaveError('Revisa los umbrales de alerta: el orden no es válido y no se guardó ningún cambio.');
                focusInvalid(field);
            } else {
                setSaveError('No se pudieron guardar las preferencias. Tus cambios siguen aquí.');
            }
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        const ok = await persistDraft(localPreferences);
        if (ok) {
            showToast.success('Preferencias guardadas correctamente');
            if (onSave) {
                setTimeout(() => onSave(), 500);
            }
        }
    };

    const handleRetrySave = async () => {
        const ok = await persistDraft(localPreferences);
        if (ok) {
            showToast.success('Preferencias guardadas correctamente');
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <DeviceStatusCard
                state={currentDevice.state}
                pendingAction={currentDevice.pendingAction}
                result={currentDevice.result}
                storedTimeZone={localPreferences.timeZone}
                onActivate={() => void currentDevice.activate()}
                onDisable={() => void currentDevice.disable()}
                onSendTest={() => void currentDevice.sendTest()}
                onUpdateTimeZone={() => void currentDevice.updateTimeZone()}
                onReconcile={() => void currentDevice.reconcile()}
                onRequestSignIn={onRequestSignIn}
            />

            {/* Daily Expense Reminder */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-muted-foreground" />
                        <h3 className="text-lg font-semibold text-foreground">
                            Recordatorio diario de gastos
                        </h3>
                    </div>
                    <SwitchInput
                        id="daily-expense-reminder-enabled"
                        label="Recordatorio diario de gastos"
                        checked={localPreferences.dailyExpenseReminder.enabled}
                        onChange={handleDailyReminderToggle}
                    />
                </div>
                <p id="daily-expense-reminder-desc" className="text-sm text-muted-foreground mb-4">
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
                                aria-describedby="daily-expense-reminder-desc"
                            />
                        </div>
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
                        id="type-budget"
                        icon={<DollarSign className="w-5 h-5" />}
                        label="Alertas de presupuesto"
                        description="Recibe notificaciones cuando te acerques o excedas tus límites de presupuesto"
                        checked={localPreferences.enabled.budget}
                        onChange={() => handleToggle('budget')}
                    />
                    <ToggleItem
                        id="type-recurring"
                        icon={<CreditCard className="w-5 h-5" />}
                        label="Recordatorios de pagos"
                        description="Recibe recordatorios antes de que venzan tus pagos recurrentes"
                        checked={localPreferences.enabled.recurring}
                        onChange={() => handleToggle('recurring')}
                    />
                    <ToggleItem
                        id="type-unusual"
                        icon={<AlertTriangle className="w-5 h-5" />}
                        label="Gastos inusuales"
                        description="Recibe alertas cuando realices compras significativamente mayores al promedio"
                        checked={localPreferences.enabled.unusualSpending}
                        onChange={() => handleToggle('unusualSpending')}
                    />
                    <ToggleItem
                        id="type-low-balance"
                        icon={<DollarSign className="w-5 h-5" />}
                        label="Saldo bajo"
                        description="Recibe alertas cuando el saldo de tus cuentas caiga por debajo del umbral"
                        checked={localPreferences.enabled.lowBalance}
                        onChange={() => handleToggle('lowBalance')}
                    />
                    <ToggleItem
                        id="type-debt"
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
                        id="threshold-budget-warning"
                        inputRef={warningRef}
                        label="Advertencia de presupuesto"
                        value={localPreferences.thresholds.budgetWarning}
                        onChange={(v) => handleThresholdChange('budgetWarning', v)}
                        suffix="%"
                        min={0}
                        max={100}
                        description="Alerta cuando alcances este porcentaje del presupuesto"
                        invalid={invalidField === 'budgetWarning'}
                    />
                    <ThresholdInput
                        id="threshold-budget-critical"
                        inputRef={criticalRef}
                        label="Presupuesto crítico"
                        value={localPreferences.thresholds.budgetCritical}
                        onChange={(v) => handleThresholdChange('budgetCritical', v)}
                        suffix="%"
                        min={0}
                        max={100}
                        description="Alerta de alta prioridad a este porcentaje"
                        invalid={invalidField === 'budgetCritical'}
                    />
                    <ThresholdInput
                        id="threshold-budget-exceeded"
                        inputRef={exceededRef}
                        label="Presupuesto excedido"
                        value={localPreferences.thresholds.budgetExceeded}
                        onChange={(v) => handleThresholdChange('budgetExceeded', v)}
                        suffix="%"
                        min={0}
                        max={200}
                        description="Alerta cuando excedas el presupuesto"
                        invalid={invalidField === 'budgetExceeded'}
                    />
                    <ThresholdInput
                        id="threshold-unusual"
                        inputRef={unusualRef}
                        label="Gasto inusual"
                        value={localPreferences.thresholds.unusualSpending}
                        onChange={(v) => handleThresholdChange('unusualSpending', v)}
                        suffix="%"
                        min={100}
                        max={1000}
                        description="Alerta cuando un gasto supere este porcentaje del promedio"
                        invalid={invalidField === 'unusualSpending'}
                    />
                    <ThresholdInput
                        id="threshold-low-balance"
                        inputRef={lowBalanceRef}
                        label="Saldo bajo"
                        value={localPreferences.thresholds.lowBalance}
                        onChange={(v) => handleThresholdChange('lowBalance', v)}
                        suffix="COP"
                        min={0}
                        max={10000000}
                        step={10000}
                        description="Alerta cuando el saldo caiga por debajo de este monto"
                        invalid={invalidField === 'lowBalance'}
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
                    <SwitchInput
                        id="quiet-hours-enabled"
                        label="Horas silenciosas"
                        checked={localPreferences.quietHours.enabled}
                        onChange={handleQuietHoursToggle}
                    />
                </div>
                <p id="quiet-hours-desc" className="text-sm text-muted-foreground mb-4">
                    No mostrar notificaciones emergentes durante estas horas (las notificaciones se guardarán en el centro)
                </p>
                {localPreferences.quietHours.enabled && (
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label htmlFor="quiet-hours-start" className="label-base">
                                Desde
                            </label>
                            <select
                                id="quiet-hours-start"
                                value={localPreferences.quietHours.startHour}
                                onChange={(e) => handleQuietHoursChange('startHour', e.target.value)}
                                className="input-base"
                                aria-describedby="quiet-hours-desc"
                            >
                                {Array.from({ length: 24 }, (_, i) => (
                                    <option key={i} value={i}>
                                        {i.toString().padStart(2, '0')}:00
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label htmlFor="quiet-hours-end" className="label-base">
                                Hasta
                            </label>
                            <select
                                id="quiet-hours-end"
                                value={localPreferences.quietHours.endHour}
                                onChange={(e) => handleQuietHoursChange('endHour', e.target.value)}
                                className="input-base"
                                aria-describedby="quiet-hours-desc"
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

            {/* Save error announcement + retry */}
            {saveError && (
                <div
                    role="alert"
                    className="card bg-destructive-muted text-destructive"
                >
                    <p className="text-sm">{saveError}</p>
                    <div className="mt-3 flex justify-end">
                        <button
                            type="button"
                            onClick={handleRetrySave}
                            disabled={saving}
                            className="btn-cancel control-target-44 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Reintentar guardado
                        </button>
                    </div>
                </div>
            )}

            {/* Save Button */}
            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary control-target-44 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save className="w-5 h-5" />
                    {saving ? UI_TEXT.states.saving : 'Guardar cambios'}
                </button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Device status surface — derived ONLY from currentDevice.state.
// ---------------------------------------------------------------------------

interface DeviceStatusCardProps {
    state: CurrentDeviceState;
    pendingAction: DevicePendingAction;
    result: DeviceActionResult | null;
    storedTimeZone?: string;
    onActivate: () => void;
    onDisable: () => void;
    onSendTest: () => void;
    onUpdateTimeZone: () => void;
    onReconcile: () => void;
    onRequestSignIn?: () => void;
}

interface BadgeSpec {
    label: string;
    className: string;
}

function badgeForState(state: CurrentDeviceState): BadgeSpec {
    switch (state.kind) {
        case 'active':
            return { label: 'Activo', className: 'bg-success-muted text-success' };
        case 'action-required':
            return { label: 'Requiere acción', className: 'bg-warning-muted text-warning' };
        case 'unavailable':
            return { label: state.reason === 'not-configured' ? 'Desactivadas' : 'No disponible', className: 'bg-muted text-muted-foreground' };
        case 'checking':
            return { label: 'Comprobando...', className: 'bg-info-muted text-info' };
        case 'check-failed':
            return { label: 'Sin confirmar', className: 'bg-warning-muted text-warning' };
        case 'guest':
        default:
            return { label: 'Invitado', className: 'bg-muted text-muted-foreground' };
    }
}

/** Reasons whose remedy is a single activate/reactivate action. */
const ACTIVATE_REASONS: ReadonlySet<ActionReason> = new Set<ActionReason>([
    'permission-required',
    'subscription-missing',
    'registration-missing',
    'endpoint-expired',
    'account-mismatch',
]);

function DeviceStatusCard({
    state,
    pendingAction,
    result,
    storedTimeZone,
    onActivate,
    onDisable,
    onSendTest,
    onUpdateTimeZone,
    onReconcile,
    onRequestSignIn,
}: DeviceStatusCardProps) {
    const badge = badgeForState(state);
    const busy = pendingAction !== null;
    const currentZone = resolveBrowserZone();

    return (
        <div className="card">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Bell className="w-5 h-5 text-muted-foreground" />
                    <h3 className="text-lg font-semibold text-foreground">
                        Notificaciones en este dispositivo
                    </h3>
                </div>
            </div>

            <div
                role="status"
                aria-live="polite"
                aria-busy={state.kind === 'checking' || busy}
                className="space-y-3"
            >
                <span className={`inline-block self-start px-2.5 py-1 rounded-full text-xs font-semibold ${badge.className}`}>
                    {badge.label}
                </span>
                {state.kind === 'guest' && (
                    <>
                        <p className="text-sm text-muted-foreground">
                            Solo con MoneyTrack abierto: sin iniciar sesión, los avisos aparecen
                            únicamente mientras la app está abierta en este dispositivo.
                        </p>
                        <button
                            type="button"
                            onClick={() => onRequestSignIn?.()}
                            className="btn-primary control-target-44"
                        >
                            Iniciar sesión para activar
                        </button>
                    </>
                )}

                {state.kind === 'checking' && (
                    <p className="text-sm text-muted-foreground">
                        Comprobando el estado de las notificaciones en este dispositivo...
                    </p>
                )}

                {state.kind === 'active' && (
                    <>
                        <p className="text-sm text-muted-foreground">
                            Este dispositivo recibe notificaciones push aunque MoneyTrack esté cerrado.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={onSendTest}
                                disabled={busy}
                                className="btn-primary control-target-44 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Enviar notificación de prueba
                            </button>
                            <button
                                type="button"
                                onClick={onDisable}
                                disabled={busy}
                                className="btn-cancel control-target-44 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Desactivar
                            </button>
                        </div>
                        <div className="text-sm text-muted-foreground">
                            <p>
                                Zona horaria guardada:{' '}
                                <span className="font-medium text-foreground">
                                    {storedTimeZone || 'sin definir'}
                                </span>
                            </p>
                            <p className="mt-1 text-xs">
                                Otro dispositivo no puede sobrescribirla en silencio; actualízala tú
                                mismo cuando cambie tu zona.
                            </p>
                            <button
                                type="button"
                                onClick={onUpdateTimeZone}
                                disabled={busy}
                                className="btn-cancel control-target-44 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {`Actualizar a ${currentZone || 'la zona actual'}`}
                            </button>
                        </div>
                    </>
                )}

                {state.kind === 'action-required' && (
                    <ActionRequiredBody
                        reason={state.reason}
                        busy={busy}
                        onActivate={onActivate}
                    />
                )}

                {state.kind === 'unavailable' && (
                    <p className="text-sm text-muted-foreground">
                        {state.reason === 'not-configured'
                            ? 'Las notificaciones push están desactivadas por ahora.'
                            : state.reason === 'unsupported'
                            ? 'Este navegador no admite notificaciones push. No es posible activarlas en este dispositivo.'
                            : 'Las notificaciones push requieren una conexión segura (HTTPS). No es posible activarlas aquí.'}
                    </p>
                )}

                {state.kind === 'check-failed' && (
                    <CheckFailedBody
                        hasPrevious={Boolean(state.previous)}
                        busy={busy}
                        onReconcile={onReconcile}
                    />
                )}

                {result && <DeviceResultMessage result={result} />}
            </div>
        </div>
    );
}

function ActionRequiredBody({
    reason,
    busy,
    onActivate,
}: {
    reason: ActionReason;
    busy: boolean;
    onActivate: () => void;
}) {
    if (reason === 'permission-blocked') {
        return (
            <p className="text-sm text-muted-foreground">
                El permiso de notificaciones está bloqueado. Debes habilitarlo desde la
                configuración del navegador o del sistema y volver a comprobar.
            </p>
        );
    }

    if (reason === 'ios-install-required') {
        return (
            <p className="text-sm text-muted-foreground">
                En iPhone/iPad primero agrega MoneyTrack a la pantalla de inicio
                (Compartir → Agregar a la pantalla de inicio) y ábrelo desde ahí para
                activar las notificaciones.
            </p>
        );
    }

    const isReactivate = reason === 'vapid-key-mismatch';
    const isActivate = ACTIVATE_REASONS.has(reason);

    return (
        <>
            <p className="text-sm text-muted-foreground">
                {isReactivate
                    ? 'La configuración de notificaciones cambió. Vuelve a activarlas en este dispositivo.'
                    : 'Este dispositivo necesita que actives las notificaciones para recibir avisos push.'}
            </p>
            {(isActivate || isReactivate) && (
                <button
                    type="button"
                    onClick={onActivate}
                    disabled={busy}
                    className="btn-primary control-target-44 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isReactivate ? 'Reactivar' : 'Activar'}
                </button>
            )}
        </>
    );
}

function CheckFailedBody({
    hasPrevious,
    busy,
    onReconcile,
}: {
    hasPrevious: boolean;
    busy: boolean;
    onReconcile: () => void;
}) {
    return (
        <>
            <p className="text-sm text-muted-foreground">
                {hasPrevious
                    ? 'No se pudo comprobar el estado de las notificaciones. Vuelve a intentarlo.'
                    : 'Aún no confirmamos las notificaciones push en este dispositivo. Los avisos locales pueden aparecer solo mientras MoneyTrack esté abierto.'}
            </p>
            <button
                type="button"
                onClick={onReconcile}
                disabled={busy}
                className="btn-cancel control-target-44 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Reintentar
            </button>
        </>
    );
}

function DeviceResultMessage({ result }: { result: DeviceActionResult }) {
    if (result.kind === 'success') {
        return (
            <p className="text-sm text-success">
                Aceptada por el servicio push. La entrega final depende del sistema operativo.
            </p>
        );
    }
    if (result.kind === 'rate-limited') {
        return (
            <p className="text-sm text-warning">
                {`Demasiados intentos. Vuelve a intentarlo a partir de ${result.retryAt}.`}
            </p>
        );
    }
    return <p className="text-sm text-destructive">{result.message}</p>;
}

function resolveBrowserZone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    } catch {
        return '';
    }
}

// ---------------------------------------------------------------------------
// Reusable form controls
// ---------------------------------------------------------------------------

interface SwitchInputProps {
    id: string;
    label: string;
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
    describedBy?: string;
}

function SwitchInput({ id, label, checked, onChange, disabled = false, describedBy }: SwitchInputProps) {
    return (
        <label
            htmlFor={id}
            className={`relative inline-flex items-center ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
            <span className="sr-only">{label}</span>
            <input
                id={id}
                type="checkbox"
                aria-label={label}
                aria-describedby={describedBy}
                checked={checked}
                onChange={onChange}
                disabled={disabled}
                className="sr-only peer"
            />
            <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:bg-primary-solid"></div>
        </label>
    );
}

interface ToggleItemProps {
    id: string;
    icon: React.ReactNode;
    label: string;
    description: string;
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
}

function ToggleItem({ id, icon, label, description, checked, onChange, disabled = false }: ToggleItemProps) {
    const descId = `${id}-desc`;
    return (
        <div className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${disabled ? 'opacity-60' : 'hover:bg-muted'}`}>
            <div className="text-muted-foreground mt-1">{icon}</div>
            <div className="flex-1">
                <h4 className="text-sm font-medium text-foreground">{label}</h4>
                <p id={descId} className="text-xs text-muted-foreground mt-1">{description}</p>
            </div>
            <SwitchInput
                id={id}
                label={label}
                checked={checked}
                onChange={onChange}
                disabled={disabled}
                describedBy={descId}
            />
        </div>
    );
}

interface ThresholdInputProps {
    id: string;
    inputRef: React.RefObject<HTMLInputElement | null>;
    label: string;
    value: number;
    onChange: (value: string) => void;
    suffix: string;
    min: number;
    max: number;
    step?: number;
    description: string;
    invalid?: boolean;
}

function ThresholdInput({
    id,
    inputRef,
    label,
    value,
    onChange,
    suffix,
    min,
    max,
    step = 1,
    description,
    invalid = false,
}: ThresholdInputProps) {
    const descId = `${id}-desc`;
    return (
        <div>
            <label htmlFor={id} className="label-base">
                {label}
            </label>
            <div className="flex items-center gap-2">
                <input
                    id={id}
                    ref={inputRef}
                    type="number"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    min={min}
                    max={max}
                    step={step}
                    aria-describedby={descId}
                    aria-invalid={invalid || undefined}
                    className="input-base flex-1"
                />
                <span className="text-sm font-medium text-muted-foreground w-16">
                    {suffix}
                </span>
            </div>
            <p id={descId} className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
    );
}
