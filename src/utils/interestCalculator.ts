/**
 * 🟢 CALCULADORA DE INTERESES PARA TARJETAS DE CRÉDITO
 *
 * IMPLEMENTA:
 * - Conversión de Tasa Efectiva Anual (E.A.) a Mensual
 * - Cálculo de Amortización Francesa (cuota fija)
 * - Validación de Reglas de Negocio
 *
 * FÓRMULAS MATEMÁTICAS:
 * 1. Tasa Mensual Efectiva: i_mensual = (1 + i_EA/100)^(1/12) - 1
 * 2. Cuota Mensual: C = P × [i × (1 + i)^n] / [(1 + i)^n - 1]
 *    Donde:
 *    - P = Principal (monto original)
 *    - i = Tasa mensual efectiva
 *    - n = Número de cuotas
 *
 * REGLAS DE NEGOCIO:
 * - Cuota única (installments = 1) → hasInterest = false automáticamente
 * - Persistencia: Calcular y guardar valores estáticos
 * - Precisión: Usar precisión decimal para evitar errores de redondeo
 */

/**
 * Resultado del cálculo de intereses
 */
export interface InterestCalculationResult {
  // Valores calculados
  monthlyInstallmentAmount: number; // Cuota mensual
  totalAmount: number; // Monto total a pagar (principal + intereses)
  totalInterestAmount: number; // Total de intereses

  // Metadatos
  monthlyInterestRate: number; // Tasa mensual efectiva (decimal)
  effectiveAnnualRate: number; // Snapshot de la tasa E.A. usada
}

/**
 * Convierte Tasa Efectiva Anual (E.A.) a Tasa Mensual Efectiva
 *
 * FÓRMULA: i_mensual = (1 + i_EA/100)^(1/12) - 1
 *
 * @param annualRate - Tasa E.A. en porcentaje (ej: 23.99)
 * @returns Tasa mensual efectiva en decimal (ej: 0.0179 = 1.79% mensual)
 *
 * @example
 * convertAnnualToMonthlyRate(23.99) // 0.017949... (~1.79% mensual)
 */
export function convertAnnualToMonthlyRate(annualRate: number): number {
  // Validar entrada
  if (annualRate < 0 || annualRate > 200) {
    throw new Error('Tasa anual inválida. Debe estar entre 0% y 200%');
  }

  // i_mensual = (1 + i_EA/100)^(1/12) - 1
  const monthlyRate = Math.pow(1 + annualRate / 100, 1 / 12) - 1;

  return monthlyRate;
}

/**
 * Calcula la cuota mensual usando Amortización Francesa (cuota fija)
 *
 * FÓRMULA: C = P × [i × (1 + i)^n] / [(1 + i)^n - 1]
 *
 * CASO ESPECIAL: Si n = 1 o i = 0, la cuota es simplemente el principal
 *
 * @param principal - Monto original de la compra
 * @param monthlyRate - Tasa mensual efectiva en decimal
 * @param installments - Número de cuotas
 * @returns Cuota mensual fija
 *
 * @example
 * calculateMonthlyInstallment(1000000, 0.0179, 12)
 * // ~92,462 (cuota mensual para $1M a 12 cuotas con 1.79% mensual)
 */
export function calculateMonthlyInstallment(
  principal: number,
  monthlyRate: number,
  installments: number
): number {
  // Validar entradas
  if (principal <= 0) {
    throw new Error('El monto principal debe ser mayor a 0');
  }
  if (installments < 1) {
    throw new Error('El número de cuotas debe ser al menos 1');
  }
  if (monthlyRate < 0) {
    throw new Error('La tasa mensual no puede ser negativa');
  }

  // CASO ESPECIAL 1: Cuota única (sin intereses)
  if (installments === 1) {
    return principal;
  }

  // CASO ESPECIAL 2: Tasa 0% (sin intereses, pero múltiples cuotas)
  if (monthlyRate === 0) {
    return principal / installments;
  }

  // CASO GENERAL: Amortización Francesa
  // C = P × [i × (1 + i)^n] / [(1 + i)^n - 1]

  const onePlusRate = 1 + monthlyRate; // (1 + i)
  const onePlusRatePowN = Math.pow(onePlusRate, installments); // (1 + i)^n

  const numerator = monthlyRate * onePlusRatePowN; // i × (1 + i)^n
  const denominator = onePlusRatePowN - 1; // (1 + i)^n - 1

  const monthlyInstallment = principal * (numerator / denominator);

  return monthlyInstallment;
}

/**
 * 🟢 FUNCIÓN PRINCIPAL: Calcula todos los valores relacionados con intereses
 *
 * REGLA DE NEGOCIO 1: Si installments = 1, fuerza hasInterest = false
 *
 * @param principal - Monto de la compra
 * @param annualRate - Tasa E.A. en porcentaje (ej: 23.99)
 * @param installments - Número de cuotas
 * @param hasInterest - Si genera intereses (se ignora si installments = 1)
 * @returns Objeto con todos los cálculos
 *
 * @example
 * calculateInterest(1000000, 23.99, 12, true)
 * // {
 * //   monthlyInstallmentAmount: 92462,
 * //   totalAmount: 1109544,
 * //   totalInterestAmount: 109544,
 * //   monthlyInterestRate: 0.0179,
 * //   effectiveAnnualRate: 23.99
 * // }
 */
export function calculateInterest(
  principal: number,
  annualRate: number,
  installments: number,
  hasInterest: boolean
): InterestCalculationResult {
  // REGLA 1: Cuota única siempre es sin intereses
  const actualHasInterest = installments === 1 ? false : hasInterest;

  // Si no tiene intereses, retornar valores simples
  if (!actualHasInterest) {
    return {
      // Redondear a centavos, igual que la rama con interés (#F-cuotas-redondeo).
      // Antes devolvía el float crudo (p. ej. 100/3 = 33.3333…), inconsistente con
      // la rama con interés y con el formato monetario. totalAmount sigue siendo el
      // principal exacto (la cuota es referencial; el residuo de centavos al sumar
      // cuotas iguales es inherente y lo absorbe la última, como en los bancos).
      monthlyInstallmentAmount: Math.round((principal / installments) * 100) / 100,
      totalAmount: principal,
      totalInterestAmount: 0,
      monthlyInterestRate: 0,
      effectiveAnnualRate: annualRate // Guardar snapshot aunque no se use
    };
  }

  // CALCULAR CON INTERESES
  const monthlyRate = convertAnnualToMonthlyRate(annualRate);
  const monthlyInstallment = calculateMonthlyInstallment(
    principal,
    monthlyRate,
    installments
  );

  const totalAmount = monthlyInstallment * installments;
  const totalInterest = totalAmount - principal;

  return {
    monthlyInstallmentAmount: Math.round(monthlyInstallment * 100) / 100, // Redondear a 2 decimales
    totalAmount: Math.round(totalAmount * 100) / 100,
    totalInterestAmount: Math.round(totalInterest * 100) / 100,
    monthlyInterestRate: monthlyRate,
    effectiveAnnualRate: annualRate
  };
}

/**
 * Valida si una configuración de intereses es válida
 *
 * @param principal - Monto de la compra
 * @param annualRate - Tasa E.A.
 * @param installments - Número de cuotas
 * @returns Objeto con validación y posibles errores
 */
export function validateInterestConfig(
  principal: number,
  annualRate: number,
  installments: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (principal <= 0) {
    errors.push('El monto debe ser mayor a 0');
  }

  if (annualRate < 0 || annualRate > 200) {
    errors.push('La tasa de interés debe estar entre 0% y 200%');
  }

  if (installments < 1 || installments > 60) {
    errors.push('El número de cuotas debe estar entre 1 y 60');
  }

  // Validar cuotas comunes
  const validInstallments = [1, 2, 3, 6, 9, 12, 18, 24, 36, 48, 60];
  if (!validInstallments.includes(installments)) {
    errors.push(
      `Número de cuotas no estándar. Valores comunes: ${validInstallments.join(', ')}`
    );
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Opciones de cuotas disponibles comúnmente en Colombia
 */
export const INSTALLMENT_OPTIONS = [
  { value: 1, label: '1 cuota' },
  { value: 2, label: '2 cuotas' },
  { value: 3, label: '3 cuotas' },
  { value: 6, label: '6 cuotas' },
  { value: 9, label: '9 cuotas' },
  { value: 12, label: '12 cuotas' },
  { value: 18, label: '18 cuotas' },
  { value: 24, label: '24 cuotas' },
  { value: 36, label: '36 cuotas' }
] as const;
