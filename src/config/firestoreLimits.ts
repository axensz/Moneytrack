/**
 * Límites operativos por debajo del máximo bruto de 500 writes de Firestore.
 *
 * Las reglas también permiten como máximo 1.000 expresiones evaluadas y 20
 * accesos documentales por solicitud multi-documento. Los writes de
 * transacciones ejecutan el esquema más costoso, por eso usan la cota menor.
 */
export const RULE_SAFE_COMPLEX_WRITE_LIMIT = 15;
export const RULE_SAFE_SIMPLE_WRITE_LIMIT = 40;
export const RULE_SAFE_DELETE_LIMIT = 40;
export const RULE_SAFE_REFERENCE_LIMIT = 16;
