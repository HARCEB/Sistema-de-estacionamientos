/**
 * Analiza una fecha de forma segura soportando múltiples formatos
 * (Date object, DD/MM/YYYY, MM-DD-YY, YYYY-MM-DD, etc.)
 */
function parseDateSecure(d) {
  if (!d) return null;
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return null;
    return d;
  }
  
  const str = String(d).trim();
  if (!str) return null;
  
  // 1. Intentar formato YYYY-MM-DD o YYYY/MM/DD (HTML5 date picker)
  let match = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10), 12, 0, 0);
  }
  
  // 2. Intentar formato DD/MM/YYYY o DD-MM-YYYY
  match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) {
    return new Date(parseInt(match[3], 10), parseInt(match[2], 10) - 1, parseInt(match[1], 10), 12, 0, 0);
  }
  
  // 3. Intentar formato MM-DD-YY o MM/DD/YY (p. ej., "02-25-26" o "2-25-26")
  match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);
  if (match) {
    let part1 = parseInt(match[1], 10);
    let part2 = parseInt(match[2], 10);
    let year = parseInt(match[3], 10) + 2000;
    
    // Si part1 > 12, asumimos que es Día-Mes-Año
    if (part1 > 12) {
      return new Date(year, part2 - 1, part1, 12, 0, 0);
    } else {
      // Por defecto asumimos Mes-Día-Año (MM-DD-YY) para alinearse con Respuestas Reserva
      return new Date(year, part1 - 1, part2, 12, 0, 0);
    }
  }
  
  // 4. Fallback al constructor Date estándar
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    parsed.setHours(12, 0, 0, 0);
    return parsed;
  }
  
  return null;
}

// Función auxiliar que imprime fecha (objeto Date) a string
function formattedDate(d) {
    if (!d) return "";
    const dateObj = parseDateSecure(d);
    if (!dateObj) return String(d);
    
    try {
        // Usar America/Santiago para evitar desfases de fecha
        return Utilities.formatDate(dateObj, "America/Santiago", "d/M/yyyy");
    } catch(e) {
        Logger.log("Error al formatear fecha: " + e);
        return d.toString();
    }
}

/**
 * It returns the week number of the given date, where the week starts on Monday
 * @param date - The date you want to get the week number for.
 * @returns The number of the week.
 */
// Obtener número de la semana (La semana empieza los Lunes)
function getWeek(date) {
    return Number(
        Utilities.formatDate(new Date(date), "America/Santiago", "u")
    ) === 7
        ? Number(
              Utilities.formatDate(new Date(date), "America/Santiago", "w")
          ) - 1
        : Number(Utilities.formatDate(new Date(date), "America/Santiago", "w"));
}

/**
 * It takes a date as an argument and returns the number of days between that date and today
 * @param dateCalculate - The date you want to calculate the difference from.
 * @returns The difference in days between the date passed in and today.
 */
function calculateDaysDifference(dateCalculate) {
    const today = new Date();
    const differenceInTime = dateCalculate.getTime() - today.getTime();
    const differenceInDays = Math.ceil(differenceInTime / (1000 * 3600 * 24));
    return differenceInDays;
}

/**
 * It takes a string in the format dd/mm/yyyy and returns a Date object
 * @param fecha - The date string to convert.
 * @returns A date object
 */
function stringToDate(fecha) {
    const d = parseDateSecure(fecha);
    return d || new Date(fecha);
}

/**
 * Normaliza un nombre para que cada palabra empiece con mayúscula
 * @param nombre - El nombre a normalizar
 * @returns El nombre con formato Title Case (Primera Letra Mayúscula)
 */
function normalizarNombre(nombre) {
    if (!nombre || typeof nombre !== 'string') return nombre;
    
    return String(nombre)
        .toLowerCase()
        .split(' ')
        .map(palabra => {
            if (palabra.length === 0) return palabra;
            return palabra.charAt(0).toUpperCase() + palabra.slice(1);
        })
        .join(' ');
}
