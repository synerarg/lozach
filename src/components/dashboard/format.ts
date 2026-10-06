/**
 * Formatos compartidos del dashboard. Todo se calcula en la zona horaria de
 * Argentina para que servidor y navegador rendericen lo mismo (sin errores de
 * hidratación) y los cortes de día/mes coincidan con la operación real.
 */
export const DASHBOARD_TIME_ZONE = "America/Argentina/Buenos_Aires"

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const compactCurrencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  notation: "compact",
  maximumFractionDigits: 1,
})

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: DASHBOARD_TIME_ZONE,
})

const shortDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  timeZone: DASHBOARD_TIME_ZONE,
})

const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: DASHBOARD_TIME_ZONE,
})

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: DASHBOARD_TIME_ZONE,
})

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount)
}

export function formatCompactCurrency(amount: number): string {
  return compactCurrencyFormatter.format(amount)
}

export function formatDate(value: string | Date): string {
  return dateFormatter.format(new Date(value))
}

export function formatShortDate(value: string | Date): string {
  return shortDateFormatter.format(new Date(value))
}

export function formatTime(value: string | Date): string {
  return timeFormatter.format(new Date(value))
}

export function formatDateTime(value: string | Date): string {
  return `${formatDate(value)} · ${formatTime(value)}`
}

/** "YYYY-MM-DD" en hora argentina. */
export function dayKey(value: string | Date): string {
  return dayKeyFormatter.format(new Date(value))
}

/** "YYYY-MM" en hora argentina. */
export function monthKey(value: string | Date): string {
  return dayKey(value).slice(0, 7)
}

/** Mes anterior a un "YYYY-MM". */
export function previousMonthKey(key: string): string {
  const [year, month] = key.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

export function pluralize(
  count: number,
  singular: string,
  plural: string
): string {
  return count === 1 ? singular : plural
}
