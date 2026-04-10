/**
 * Parser de extractos bancarios en formato CSV
 * Soporta formatos comunes de bancos colombianos:
 * Bancolombia, Davivienda, BBVA, Nequi, Scotiabank Colpatria, Banco de Bogotá
 */

import { DEFAULT_CATEGORIES } from '../config/constants';

export interface ParsedRow {
  date: Date;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  suggestedCategory: string;
  rawLine: string;
}

export interface ColumnMapping {
  date: number;
  description: number;
  debit: number | null;   // columna separada para débitos
  credit: number | null;  // columna separada para créditos
  amount: number | null;  // columna unificada de monto
  typeIndicator: number | null; // columna D/C o Tipo
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: string[];
  totalRows: number;
  skippedRows: number;
}

// ── Detección de delimitador ─────────────────────────────────────────────────

function detectDelimiter(sample: string): string {
  const counts = {
    ';': (sample.match(/;/g) || []).length,
    ',': (sample.match(/,/g) || []).length,
    '\t': (sample.match(/\t/g) || []).length,
    '|': (sample.match(/\|/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// ── Parser de CSV respetando comillas ────────────────────────────────────────

function splitCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ── Detección de columnas por header ────────────────────────────────────────

const DATE_KEYWORDS = ['fecha', 'date', 'fecha mov', 'fec', 'fecha y hora', 'f.mov'];
const DESC_KEYWORDS = ['descripcion', 'descripción', 'concepto', 'detalle', 'referencia',
  'glosa', 'narración', 'narracion', 'movimiento', 'detail', 'concept'];
const DEBIT_KEYWORDS = ['debito', 'débito', 'cargo', 'retiro', 'egreso', 'debitos',
  'débitos', 'cargos', 'debit', 'salida', 'salidas'];
const CREDIT_KEYWORDS = ['credito', 'crédito', 'abono', 'ingreso', 'creditos',
  'créditos', 'abonos', 'credit', 'entrada', 'entradas'];
const AMOUNT_KEYWORDS = ['valor', 'monto', 'importe', 'amount', 'vlr', 'vr'];
const TYPE_KEYWORDS = ['d/c', 'tipo', 'type', 'db/cr', 'signo', 'clase'];

function matchesKeyword(header: string, keywords: string[]): boolean {
  const h = header.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return keywords.some(k => h.includes(k.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
}

export function detectColumns(headers: string[]): ColumnMapping {
  let date = -1, description = -1, debit = -1, credit = -1, amount = -1, typeIndicator = -1;

  headers.forEach((h, i) => {
    if (date === -1 && matchesKeyword(h, DATE_KEYWORDS)) date = i;
    else if (description === -1 && matchesKeyword(h, DESC_KEYWORDS)) description = i;
    else if (debit === -1 && matchesKeyword(h, DEBIT_KEYWORDS)) debit = i;
    else if (credit === -1 && matchesKeyword(h, CREDIT_KEYWORDS)) credit = i;
    else if (amount === -1 && matchesKeyword(h, AMOUNT_KEYWORDS)) amount = i;
    else if (typeIndicator === -1 && matchesKeyword(h, TYPE_KEYWORDS)) typeIndicator = i;
  });

  return {
    date: Math.max(date, 0),
    description: Math.max(description, date + 1 < headers.length ? date + 1 : 1),
    debit: debit >= 0 ? debit : null,
    credit: credit >= 0 ? credit : null,
    amount: amount >= 0 ? amount : null,
    typeIndicator: typeIndicator >= 0 ? typeIndicator : null,
  };
}

// ── Parser de montos (formato colombiano y estándar) ─────────────────────────

export function parseAmount(raw: string): number {
  if (!raw || raw.trim() === '' || raw.trim() === '-') return 0;
  // Quitar símbolo de moneda, espacios, paréntesis de negativos
  let clean = raw.replace(/[$COP\s]/g, '').replace(/[()]/g, '');
  const isNegative = clean.startsWith('-');
  clean = clean.replace(/-/g, '');

  // Formato colombiano: 1.234.567,89 → 1234567.89
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(clean)) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else {
    // Formato con coma como separador de miles: 1,234,567.89
    clean = clean.replace(/,/g, '');
  }

  const value = parseFloat(clean);
  if (isNaN(value)) return 0;
  return isNegative ? -value : value;
}

// ── Parser de fechas ─────────────────────────────────────────────────────────

const DATE_FORMATS: Array<(s: string) => Date | null> = [
  // DD/MM/YYYY o DD-MM-YYYY
  (s) => {
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (!m) return null;
    const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
    return isNaN(d.getTime()) ? null : d;
  },
  // YYYY-MM-DD (ISO)
  (s) => {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    return isNaN(d.getTime()) ? null : d;
  },
  // DD/MM/YY
  (s) => {
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
    if (!m) return null;
    const year = parseInt(m[3]) + (parseInt(m[3]) > 50 ? 1900 : 2000);
    const d = new Date(year, parseInt(m[2]) - 1, parseInt(m[1]));
    return isNaN(d.getTime()) ? null : d;
  },
  // YYYYMMDD
  (s) => {
    const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!m) return null;
    const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    return isNaN(d.getTime()) ? null : d;
  },
];

export function parseDate(raw: string): Date | null {
  const clean = raw.trim().split(' ')[0]; // tomar solo la parte de fecha (sin hora)
  for (const fmt of DATE_FORMATS) {
    const d = fmt(clean);
    if (d) return d;
  }
  return null;
}

// ── Auto-categorización por palabras clave en la descripción ─────────────────

// Prefijos de medios de pago que ocultan el comercio real.
// Ej: "PAGO PSE TIGO" → extraer "TIGO" para matchear Servicios
const PAYMENT_PREFIXES = [
  'compra en ', 'compra intl ', 'compra pos ',
  'pago pse ', 'pago llave ', 'pago qr ', 'pago suc virt ',
  'transf a ', 'transf qr ', 'transferencia a ',
  'recarga de ', 'pago de nomi ', 'pago nomi ',
  'cobro ', 'cargo ',
];

function extractMerchant(description: string): string {
  const lower = description.toLowerCase();
  for (const prefix of PAYMENT_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return description.slice(prefix.length).trim();
    }
  }
  return description;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const CATEGORY_RULES: Array<{ keywords: string[]; category: string; type?: 'income' | 'expense' }> = [
  // ── INGRESOS ──────────────────────────────────────────────────────────────
  {
    keywords: [
      'nomina', 'nómina', 'sueldo', 'salario', 'pago empresa', 'pago empleador',
      'pago nomina', 'abono nomina', 'pago de nomi', 'pago nomi',
    ],
    category: 'Salario', type: 'income',
  },
  {
    keywords: [
      'freelance', 'honorarios', 'consulting', 'prestacion servicio',
      'cuenta cobro', 'factura cobro', 'pago honorarios',
    ],
    category: 'Freelance', type: 'income',
  },
  {
    keywords: [
      'dividendo', 'rendimiento', 'inversion', 'inversión', 'cdt', 'fiducuenta',
      'fondo inversion', 'tyba', 'a2censo', 'bold', 'nu bank', 'nequi ahorros',
      'abono interes', 'intereses ahorros', 'rendimiento cdt',
    ],
    category: 'Inversiones', type: 'income',
  },
  {
    keywords: [
      'cesantia', 'cesantía', 'prima ', 'prima de', 'liquidacion', 'liquidación', 'vacaciones',
    ],
    category: 'Cesantías', type: 'income',
  },
  {
    keywords: ['desembolso', 'prestamo', 'préstamo', 'compra de cartera', 'credito aprobado'],
    category: 'Otros', type: 'income',
  },

  // ── TRANSPORTE ────────────────────────────────────────────────────────────
  {
    keywords: [
      // Apps
      'uber', 'cabify', 'indriver', 'didi', 'beat', 'picap', 'rappi moto',
      // Combustible
      'gasolina', 'terpel', 'primax', 'texaco', 'biomax', 'combustible', 'estacion servicio',
      // Parqueo
      'parqueadero', 'parking', 'apcoa', 'parque',
      // Transporte público
      'transmilenio', 'sitp', 'tarjeta civica', 'civica', 'metro de medellin', 'metro medellin',
      'mio', 'megabus', 'metrolinea', 'metroplús', 'metroplus', 'transcaribe', 'transmetro',
      'recarga civica', 'recarga tu llave',
      // Peajes
      'peaje', 'tunel', 'concesion vial',
      // Vehículo
      'soat', 'revision tecno', 'tecnomecanica', 'taller', 'mecanico', 'repuesto',
      'lubricante', 'lavadero', 'autolavado', 'lavautos',
      // Vuelos / bus
      'avianca', 'latam', 'wingo', 'jetsmart', 'flota', 'expreso', 'copetran',
      'bolivariano', 'terminal', 'aeropuerto', 'tiquete', 'tiquete aereo',
    ],
    category: 'Transporte',
  },

  // ── ALIMENTACIÓN ─────────────────────────────────────────────────────────
  {
    keywords: [
      // Supermercados
      'exito', 'éxito', 'carulla', 'jumbo', 'alkosto', 'makro', 'pricesmart', 'costco',
      'd1', 'ara ', 'justo y bueno', 'justo bueno', 'surtimax', 'olimpica', 'olímpica',
      'supermercado', 'surtifruver', 'fruver', 'plaza mercado', 'galeria', 'minimercado',
      // Comida rápida
      'mcdonalds', 'burger king', 'subway', 'kfc', 'frisby', 'el corral', 'crepes waffles',
      'crepes', 'wok', 'papa johns', 'dominos', 'pizza hut', 'presto', 'oma',
      'kokoriko', 'pollo olímpico', 'pollo olimpico', 'ajiaco', 'la brasa',
      // Cafeterías / café
      'juan valdez', 'starbucks', 'tostao', 'cafe', 'cafeteria', 'cafetería', 'cocorollo',
      'el laboratori', 'laboratorio cafe', 'pergamino', 'velvet', 'amor perfecto',
      // Domicilios
      'rappi', 'ifood', 'uber eats', 'didi food', 'pedidos ya', 'domicilio',
      // Restaurantes genéricos
      'restaurante', 'rest ', 'asadero', 'parrilla', 'sushi', 'pizza', 'empanada',
      // Panadería / tiendas
      'panaderia', 'panadería', 'cigarreria', 'cigarrería', 'tienda ', 'miscelanea',
      // Bebidas
      'cerveza', 'licoreria', 'licorera', 'vinos y licores',
    ],
    category: 'Alimentación',
  },

  // ── ENTRETENIMIENTO ──────────────────────────────────────────────────────
  {
    keywords: [
      // Streaming video
      'netflix', 'disney', 'hbo', 'max ', 'prime video', 'apple tv', 'paramount', 'star+',
      'crunchyroll', 'mubi', 'youtube premium',
      // Streaming música
      'spotify', 'deezer', 'apple music', 'tidal',
      // Gaming
      'steam', 'playstation', 'xbox', 'nintendo', 'epic games', 'twitch', 'riot games',
      'blizzard', 'ea games', 'ubisoft',
      // Google / Apple digital
      'google play', 'google one', 'google on', 'dlo*google', 'apple one', 'icloud',
      // Cines
      'cine', 'cinecolombia', 'cinemark', 'procinal', 'royal films', 'multiplex',
      // Salidas
      'bar ', 'discoteca', 'concierto', 'teatro', 'museo', 'parque diversiones',
      'salitre magico', 'mundo aventura', 'maloka', 'acuapark', 'parque acuatico',
      // Deportes
      'gym', 'gimnasio', 'smartfit', 'bodytech', 'spinning', 'crossfit', 'zumba',
    ],
    category: 'Entretenimiento',
  },

  // ── SERVICIOS (facturas, telefonía, utilities) ────────────────────────────
  {
    keywords: [
      // Energía
      'energia', 'energía', 'epm', 'codensa', 'enel', 'celsia', 'electricaribe', 'afinia',
      'chec', 'cens', 'essa', 'electrohuila',
      // Gas
      'gas natural', 'vanti', 'gases del caribe', 'surtigas', 'alcanos', 'llanogas',
      // Agua
      'acueducto', 'eaab', 'aguas de bogota', 'triple a', 'emcali', 'empas',
      // Telefonía / internet
      'claro', 'tigo', 'movistar', 'wom ', 'virgin mobile', 'etb', 'une ', 'edatel',
      'internet', 'telefonia', 'telefonía', 'fibra optica', 'plan datos',
      // TV
      'directv', 'dish ', 'une tv', 'claro tv', 'tigo une',
      // Wompi — intermediario de pago usado por Tigo, servicios públicos, etc.
      'wompi',
      // Comisiones bancarias
      'comision', 'comisión', 'cuota manejo', 'cargo bancario', 'gravamen',
      'gmt ', '4x1000',
      // Seguros
      'seguros', 'seguro ', 'axa', 'liberty', 'mapfre', 'allianz', 'sura seguro',
      'proteccion ', 'vida group',
      // Pagos genéricos de servicios
      'pago servicio', 'recaudo', 'factura servicio',
    ],
    category: 'Servicios',
  },

  // ── VIVIENDA ─────────────────────────────────────────────────────────────
  {
    keywords: [
      'arriendo', 'arrendamiento', 'renta ', 'canon ', 'administracion', 'administración',
      'cuota copropiedad', 'inmobiliaria', 'predial', 'impuesto predial', 'valorizacion',
      'hipoteca', 'credito vivienda', 'leasing habitacional', 'conjunto residencial',
      'cuota admon', 'aseo urbano', 'aseo y recoleccion',
    ],
    category: 'Vivienda',
  },

  // ── SALUD ────────────────────────────────────────────────────────────────
  {
    keywords: [
      // EPS
      'eps', 'nueva eps', 'sura eps', 'sanitas', 'compensar eps', 'famisanar',
      'salud total', 'coomeva', 'medimas', 'aliansalud', 'coosalud',
      // Clínicas / hospitales
      'clinica', 'clínica', 'hospital', 'medico', 'médico', 'consultorio', 'ips ',
      // Farmacias
      'farmacia', 'drogueria', 'droguería', 'locatel', 'farmatodo', 'cruz verde',
      'la rebaja', 'colsubsidio farmacia',
      // Diagnóstico (ir antes que Alimentación para "laboratorio")
      'laboratorio medico', 'laboratorio clinico', 'rayos x', 'ecografia',
      'resonancia', 'diagnostico', 'examen medico',
      // Especialistas
      'odontologia', 'odontología', 'optometria', 'optica', 'lentes ', 'ortodoncia',
      'psicologia', 'psiquiatria', 'fisioterapia',
      // Medicina prepagada
      'medicina prepagada', 'colmedica', 'colmédica', 'medicina integral',
    ],
    category: 'Salud',
  },

  // ── EDUCACIÓN ────────────────────────────────────────────────────────────
  {
    keywords: [
      // Colegios y universidades
      'colegio', 'universidad', 'uniandes', 'javeriana', 'nacional', 'icetex',
      'eafit', 'upb ', 'udea', 'udem', 'uninorte', 'unisabana', 'ean ', 'ceipa',
      'minuto de dios', 'uniminuto', 'politecnico', 'politécnico', 'sena ',
      // Matrículas
      'matricula', 'matrícula', 'pensión educativa', 'pension colegio', 'cuota educacion',
      // Cursos online
      'udemy', 'coursera', 'platzi', 'domestika', 'linkedin learning', 'skillshare',
      'duolingo', 'babbel',
      // Postgrados
      'diplomado', 'especializacion', 'especialización', 'maestria', 'maestría',
      // Librerías y útiles
      'libreria', 'librería', 'papeleria', 'papelería', 'panamericana', 'lerner',
      'utiles escolares', 'utiles',
      // Niquiadici (librería local del extracto)
      'niquiadici',
    ],
    category: 'Educación',
  },

  // ── FINANZAS (pagos de deuda, créditos) ──────────────────────────────────
  {
    keywords: [
      // Pagos de tarjeta / crédito
      'pago tc', 'pago tarjeta', 'pago credito', 'cuota credito', 'cuota prestamo',
      'pago suc virt tc', 'tc master', 'tc visa', 'amex', 'credibanco',
      // Entidades financieras
      'falabella credito', 'banco falabella', 'davivienda', 'bancolombia',
      'banco bogota', 'bbva', 'occidente', 'scotiabank', 'av villas', 'caja social',
      'nu compan', 'nu financ', 'nufin',
      'addi', 'sistecredito', 'cuota facil', 'alkosto credito',
      // Fondos / pensiones
      'porvenir', 'proteccion pensiones', 'colfondos', 'horizonte', 'skandia',
      'colpensiones',
    ],
    category: 'Otros',
  },

  // ── COMPRAS PERSONALES ───────────────────────────────────────────────────
  {
    keywords: [
      // Ropa / moda
      'zara', 'h&m', 'pull bear', 'bershka', 'stradivarius', 'mango', 'forever 21',
      'adidas', 'nike', 'puma', 'reebok', 'converse', 'vans',
      'arturo calle', 'studio f', 'ela ', 'tennis ', 'mario hernandez',
      // Hogar
      'homecenter', 'easy ', 'tugó', 'tugo', 'ikea', 'mueblemundo', 'jamar ',
      'colchones el dorado', 'muebles',
      // Tecnología
      'samsung', 'apple store', 'mac center', 'ishop', 'ktronix', 'alkomprar',
      'pc mac', 'tienda apple', 'fnac',
      // E-commerce
      'amazon', 'mercado libre', 'linio', 'shein', 'temu', 'aliexpress',
      // Variedad
      'dollarcity', 'dollar city', 'miniso', 'daiso', 'flying tiger',
      'bazar', 'todo a', 'artesanias',
    ],
    category: 'Compras Personales',
  },

  // ── REGALOS ──────────────────────────────────────────────────────────────
  {
    keywords: [
      'regalo', 'cumpleaños', 'navidad', 'amor y amistad', 'dia madre', 'dia padre',
      'flores', 'floristeria', 'florería', 'tarjeta regalo',
    ],
    category: 'Regalos',
  },

  // ── FALLBACK: PATRONES BANCARIOS GENÉRICOS ───────────────────────────────
  { keywords: ['retiro atm', 'retiro cajero', 'avance cajero', 'retiro efectivo', 'retiro corresponsal'], category: 'Otros' },
  { keywords: ['transferencia', 'envio nequi', 'envío nequi', 'daviplata', 'transfiya', 'nequi'], category: 'Otros' },
];

export function suggestCategory(description: string, type: 'income' | 'expense'): string {
  // Intentar primero con el comercio real (quitando prefijo de medio de pago)
  // Ej: "PAGO PSE TIGO" → probar con "TIGO" antes que con la descripción completa
  const merchant = extractMerchant(description);
  const candidates = merchant !== description ? [merchant, description] : [description];

  for (const candidate of candidates) {
    const lower = norm(candidate);
    for (const rule of CATEGORY_RULES) {
      if (rule.type && rule.type !== type) continue;
      if (rule.keywords.some(k => lower.includes(norm(k)))) {
        return rule.category;
      }
    }
  }

  return type === 'income'
    ? DEFAULT_CATEGORIES.income[DEFAULT_CATEGORIES.income.length - 1]   // 'Otros'
    : DEFAULT_CATEGORIES.expense[DEFAULT_CATEGORIES.expense.length - 1]; // 'Otros'
}

// ── Función principal: parseCSV ───────────────────────────────────────────────

export function parseCSV(text: string): ParseResult {
  const errors: string[] = [];
  const rows: ParsedRow[] = [];

  // Normalizar saltos de línea y quitar BOM
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter(l => l.trim() !== '');

  if (lines.length < 2) {
    return { rows: [], errors: ['El archivo no contiene suficientes filas'], totalRows: 0, skippedRows: 0 };
  }

  const delimiter = detectDelimiter(lines.slice(0, 5).join('\n'));

  // Buscar la fila de headers (la primera que tenga texto reconocible)
  let headerIndex = 0;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const cols = splitCSVLine(lines[i], delimiter);
    if (cols.some(c => matchesKeyword(c, [...DATE_KEYWORDS, ...DESC_KEYWORDS]))) {
      headerIndex = i;
      headers = cols;
      break;
    }
  }

  if (headers.length === 0) {
    headers = splitCSVLine(lines[0], delimiter);
    headerIndex = 0;
  }

  const mapping = detectColumns(headers);
  let skipped = 0;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = splitCSVLine(line, delimiter);

    // Fecha
    const rawDate = cols[mapping.date] || '';
    const date = parseDate(rawDate);
    if (!date) {
      skipped++;
      continue;
    }

    // Descripción
    const description = (cols[mapping.description] || '').trim();
    if (!description) {
      skipped++;
      continue;
    }

    // Determinar tipo y monto
    let amount = 0;
    let type: 'income' | 'expense' = 'expense';

    if (mapping.debit !== null && mapping.credit !== null) {
      // Bancolombia style: columnas débito y crédito separadas
      const debitAmt = parseAmount(cols[mapping.debit] || '');
      const creditAmt = parseAmount(cols[mapping.credit] || '');
      if (creditAmt > 0) {
        amount = creditAmt;
        type = 'income';
      } else if (debitAmt > 0) {
        amount = debitAmt;
        type = 'expense';
      } else {
        skipped++;
        continue;
      }
    } else if (mapping.amount !== null) {
      // Columna unificada de monto
      const raw = cols[mapping.amount] || '';
      const parsed = parseAmount(raw);
      amount = Math.abs(parsed);

      if (mapping.typeIndicator !== null) {
        // D/C indicator column
        const indicator = (cols[mapping.typeIndicator] || '').trim().toUpperCase();
        type = indicator.startsWith('C') || indicator === 'ABONO' || indicator === 'INGRESO'
          ? 'income'
          : 'expense';
      } else {
        // Signo del monto o heurística por descripción
        type = parsed < 0 ? 'income' : 'expense';
      }
    }

    if (amount <= 0) {
      skipped++;
      continue;
    }

    rows.push({
      date,
      description,
      amount,
      type,
      suggestedCategory: suggestCategory(description, type),
      rawLine: line,
    });
  }

  return {
    rows,
    errors,
    totalRows: lines.length - headerIndex - 1,
    skippedRows: skipped,
  };
}
