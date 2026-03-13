/**
 * Utilities para manejo de fechas en la zona horaria de Colombia (America/Bogota, UTC-5).
 * Usar estas funciones en lugar de new Date().toISOString() para evitar
 * que el día cambie incorrectamente cuando el servidor está en UTC.
 */

const COLOMBIA_TZ = 'America/Bogota';

/**
 * Retorna la fecha actual en formato YYYY-MM-DD según el horario de Colombia.
 * Ejemplo: si en UTC son las 03:00 del día 13, en Colombia son las 22:00 del día 12.
 */
export function getColombiaDateString(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: COLOMBIA_TZ }); // "YYYY-MM-DD"
}

/**
 * Retorna el inicio del día (00:00:00) en Colombia, como un objeto Date en UTC.
 * Útil para queries a Supabase con .gte('created_at', startOfDay.toISOString()).
 */
export function getColombiaStartOfDay(dateStr?: string): Date {
  const str = dateStr ?? getColombiaDateString();
  // Al parsear "YYYY-MM-DDT00:00:00" con timeZone Colombia, obtenemos el UTC correcto
  return new Date(`${str}T00:00:00-05:00`);
}

/**
 * Retorna el fin del día (23:59:59.999) en Colombia, como un objeto Date en UTC.
 * Útil para queries a Supabase con .lte('created_at', endOfDay.toISOString()).
 */
export function getColombiaEndOfDay(dateStr?: string): Date {
  const str = dateStr ?? getColombiaDateString();
  return new Date(`${str}T23:59:59.999-05:00`);
}

/**
 * Formatea una fecha en la zona horaria de Colombia.
 * Ejemplo: toColombiaDateDisplay(new Date()) => "miércoles, 12 de marzo"
 */
export function toColombiaDateDisplay(
  date: Date = new Date(),
  options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }
): string {
  return date.toLocaleDateString('es-ES', { ...options, timeZone: COLOMBIA_TZ });
}

/**
 * Formatea una hora en la zona horaria de Colombia.
 * Ejemplo: toColombiaTimeDisplay(new Date()) => "21:05"
 */
export function toColombiaTimeDisplay(
  date: Date = new Date(),
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
): string {
  return date.toLocaleTimeString('es-ES', { ...options, timeZone: COLOMBIA_TZ });
}
