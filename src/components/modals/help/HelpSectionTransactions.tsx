import React from 'react';
import { Wallet, CreditCard, Settings, Edit2, Filter, ArrowRightLeft, Clock, CheckCircle, TrendingUp, TrendingDown, Calendar, Download } from 'lucide-react';

export const HelpSectionTransactions: React.FC = () => (
  <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
      <div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Transacciones</h3>
        <p className="text-muted-foreground">El corazón de tu seguimiento financiero.</p>
      </div>

      {/* Tipos de transacción — colores semánticos del sistema (igual que TransactionItem):
          ingreso=success, gasto=destructive, transferencia=info. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
         <div className="p-4 rounded-xl border" style={{ background: 'var(--success-muted)', borderColor: 'var(--success)' }}>
            <div className="flex items-center gap-2 mb-2">
               <TrendingUp size={18} style={{ color: 'var(--success)' }} />
               <span className="font-semibold" style={{ color: 'var(--success-text)' }}>Ingreso</span>
            </div>
            <p className="text-sm" style={{ color: 'var(--success-text)' }}>Dinero que entra (salario, ventas, etc.)</p>
         </div>
         <div className="p-4 rounded-xl border" style={{ background: 'var(--destructive-muted)', borderColor: 'var(--destructive)' }}>
            <div className="flex items-center gap-2 mb-2">
               <TrendingDown size={18} style={{ color: 'var(--destructive)' }} />
               <span className="font-semibold" style={{ color: 'var(--destructive-text)' }}>Gasto</span>
            </div>
            <p className="text-sm" style={{ color: 'var(--destructive-text)' }}>Dinero que sale (compras, servicios, etc.)</p>
         </div>
         <div className="p-4 rounded-xl border" style={{ background: 'var(--info-muted)', borderColor: 'var(--info)' }}>
            <div className="flex items-center gap-2 mb-2">
               <ArrowRightLeft size={18} style={{ color: 'var(--info)' }} />
               <span className="font-semibold" style={{ color: 'var(--info-text)' }}>Transferencia</span>
            </div>
            <p className="text-sm" style={{ color: 'var(--info-text)' }}>Mover dinero entre tus cuentas</p>
         </div>
      </div>

      {/* Crear transacción — panel neutro; numeración de pasos sin violet decorativo */}
      <div className="border border-border rounded-xl overflow-hidden">
         <div className="bg-muted p-4 border-b border-border">
            <h4 className="font-semibold text-foreground">Crear una Transacción</h4>
         </div>
         <div className="p-4 space-y-3">
            <ol className="space-y-2 text-sm text-muted-foreground">
               <li className="flex gap-2"><span className="font-bold text-foreground">1.</span> Clic en el botón + o "Nueva Transacción"</li>
               <li className="flex gap-2"><span className="font-bold text-foreground">2.</span> Selecciona el tipo (Ingreso, Gasto, Transferencia)</li>
               <li className="flex gap-2"><span className="font-bold text-foreground">3.</span> Ingresa el monto (acepta: 1000, 1.000, 1,000)</li>
               <li className="flex gap-2"><span className="font-bold text-foreground">4.</span> Selecciona categoría, cuenta y fecha</li>
               <li className="flex gap-2"><span className="font-bold text-foreground">5.</span> La descripción es opcional (si la omites, se muestra la categoría)</li>
               <li className="flex gap-2"><span className="font-bold text-foreground">6.</span> Marca como "Pagado" si ya se realizó</li>
            </ol>
         </div>
      </div>

      {/* Compras con TC — advertencia real (intereses): tokens de warning */}
      <div className="border rounded-xl p-0 overflow-hidden" style={{ background: 'var(--warning-muted)', borderColor: 'var(--warning)' }}>
         <div className="p-4 border-b" style={{ borderColor: 'var(--warning)' }}>
            <h4 className="font-semibold flex items-center gap-2" style={{ color: 'var(--warning-text)' }}>
               <CreditCard size={18} style={{ color: 'var(--warning)' }} />
               Compras con Tarjeta de Crédito
            </h4>
         </div>
         <div className="p-4 space-y-3">
            <p className="text-sm" style={{ color: 'var(--warning-text)' }}>
               Cuando gastas desde una TC con tasa configurada:
            </p>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--warning-text)' }}>
               <li className="flex items-start gap-2">
                  <span style={{ color: 'var(--warning)' }}>•</span>
                  <span>Activa "Compra con intereses"</span>
               </li>
               <li className="flex items-start gap-2">
                  <span style={{ color: 'var(--warning)' }}>•</span>
                  <span>Selecciona cuotas: 1, 3, 6, 12, 24 o 36 meses</span>
               </li>
               <li className="flex items-start gap-2">
                  <span style={{ color: 'var(--warning)' }}>•</span>
                  <span>El sistema calcula intereses con la fórmula de interés compuesto</span>
               </li>
            </ul>
         </div>
      </div>

      {/* Edición Rápida — superficie plana neutra (sin degradado); badges de paso neutros */}
      <div className="bg-muted rounded-xl p-5 border border-border">
         <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Edit2 size={18} className="text-muted-foreground" />
            Edición Rápida
         </h4>
         <ul className="space-y-3">
            <li className="flex gap-3 text-sm text-muted-foreground">
               <span className="flex-shrink-0 w-6 h-6 rounded-full bg-card border border-border text-foreground flex items-center justify-center text-xs font-bold">1</span>
               Clic en el icono del lápiz en cualquier transacción
            </li>
            <li className="flex gap-3 text-sm text-muted-foreground">
               <span className="flex-shrink-0 w-6 h-6 rounded-full bg-card border border-border text-foreground flex items-center justify-center text-xs font-bold">2</span>
               Edita monto, descripción, categoría y fecha directamente en la lista
            </li>
            <li className="flex gap-3 text-sm text-muted-foreground">
               <span className="flex-shrink-0 w-6 h-6 rounded-full bg-card border border-border text-foreground flex items-center justify-center text-xs font-bold">3</span>
               Los cambios se guardan al confirmar con el botón de guardar
            </li>
         </ul>
      </div>

      {/* Filtros — panel genérico (no es estado de info): neutro card/muted/border */}
      <div className="border border-border rounded-xl p-0 overflow-hidden">
         <div className="bg-muted p-4 border-b border-border">
            <h4 className="font-semibold text-foreground flex items-center gap-2">
               <Filter size={18} className="text-muted-foreground" />
               Filtros Disponibles
            </h4>
         </div>
         <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
               <div className="p-2 bg-muted rounded-lg text-muted-foreground text-center">
                  <Calendar size={14} className="inline mr-1" /> Fecha
               </div>
               <div className="p-2 bg-muted rounded-lg text-muted-foreground text-center">
                  <Wallet size={14} className="inline mr-1" /> Cuenta
               </div>
               <div className="p-2 bg-muted rounded-lg text-muted-foreground text-center">
                  <Settings size={14} className="inline mr-1" /> Categoría
               </div>
               <div className="p-2 bg-muted rounded-lg text-muted-foreground text-center">
                  <CheckCircle size={14} className="inline mr-1" /> Estado
               </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
               Presets de fecha: Hoy, Esta semana, Este mes, Mes anterior, Este año, Año anterior, o rango personalizado.
            </p>
         </div>
      </div>

      {/* Estado de pago — estados reales: pagado=success, pendiente=warning */}
      <div className="grid grid-cols-2 gap-4">
         <div className="p-4 rounded-xl border" style={{ background: 'var(--success-muted)', borderColor: 'var(--success)' }}>
            <h4 className="font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--success-text)' }}>
               <CheckCircle size={16} /> Pagado
            </h4>
            <p className="text-sm" style={{ color: 'var(--success-text)' }}>
               El dinero ya salió o entró de la cuenta. Afecta el saldo actual.
            </p>
         </div>
         <div className="p-4 rounded-xl border" style={{ background: 'var(--warning-muted)', borderColor: 'var(--warning)' }}>
            <h4 className="font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--warning-text)' }}>
               <Clock size={16} /> Pendiente
            </h4>
            <p className="text-sm" style={{ color: 'var(--warning-text)' }}>
               Programado pero aún no ejecutado. Aparece en "Gastos pendientes".
            </p>
         </div>
      </div>

      {/* Exportar CSV — panel instructivo genérico (no es estado): neutro */}
      <div className="border border-border rounded-xl overflow-hidden">
         <div className="bg-muted p-4 border-b border-border">
            <h4 className="font-semibold text-foreground flex items-center gap-2">
               <Download size={18} className="text-muted-foreground" />
               Exportar a CSV / Excel
            </h4>
         </div>
         <div className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
               Descarga tus transacciones como archivo CSV para abrir en Excel o Google Sheets:
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
               <li className="flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>Busca el botón de descarga junto al conteo de transacciones</span>
               </li>
               <li className="flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>Se exportan las transacciones filtradas (aplica los filtros activos)</span>
               </li>
               <li className="flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>Incluye: fecha, tipo, categoría, descripción, monto, cuenta y estado</span>
               </li>
               <li className="flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>Compatible con Excel (codificación UTF-8 con acentos)</span>
               </li>
            </ul>
         </div>
      </div>
  </div>
);
