// Función auxiliar que imprime fecha (objeto Date) a string
function formattedDate(d) {
    if (!d) return "";
    
    // Si ya viene como texto (ej: "28/5/2026"), no la tocamos para evitar doble resta
    if (typeof d === 'string' && d.includes('/')) return d;
    
    try {
        // Usar America/Santiago (o Session.getScriptTimeZone()) para evitar el desfase de fecha hacia el día anterior
        return Utilities.formatDate(new Date(d), "America/Santiago", "d/M/yyyy");
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
 * Normaliza cualquier formato de fecha (String o Date) a un string estándar YYYY-MM-DD
 * Soporta formatos: DD/MM/YYYY, YYYY-MM-DD, MM/DD/YYYY y objetos Date de forma segura
 * 
 * @param {*} f - Fecha a normalizar
 * @returns {string} Fecha formateada como "YYYY-MM-DD" o vacío si es inválida
 */
function normalizarFechaAString(f) {
  if (!f) return "";
  
  if (f instanceof Date) {
    try {
      return Utilities.formatDate(f, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } catch (e) {
      let y = f.getFullYear();
      let m = String(f.getMonth() + 1).padStart(2, '0');
      let d = String(f.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  
  let s = String(f).trim();
  if (s === "") return "";
  
  // Caso 1: YYYY-MM-DD o YYYY/MM/DD (con o sin hora)
  let matchYMD = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (matchYMD) {
    let y = matchYMD[1];
    let m = matchYMD[2].padStart(2, '0');
    let d = matchYMD[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  
  // Caso 2: DD/MM/YYYY o DD-MM-YYYY
  let matchDMY = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (matchDMY) {
    let d = matchDMY[1].padStart(2, '0');
    let m = matchDMY[2].padStart(2, '0');
    let y = matchDMY[3];
    return `${y}-${m}-${d}`;
  }
  
  // Fallback: intentar parsear como Date estándar de JS
  try {
    let parsedDate = new Date(s);
    if (!isNaN(parsedDate.getTime())) {
      return Utilities.formatDate(parsedDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
  } catch (e) {}
  
  return s;
}

/**
 * Convierte un string de fecha o un objeto Date en un objeto Date estandarizado
 * @param fecha - La fecha a convertir.
 * @returns Un objeto Date al mediodía (12:00 PM) para evitar desfases de zona horaria
 */
function stringToDate(fecha) {
    if (fecha instanceof Date) return fecha;
    
    let norm = normalizarFechaAString(fecha);
    if (norm === "") return new Date(NaN);
    
    const parts = norm.split("-"); // [YYYY, MM, DD]
    
    // IMPORTANTE: Ponemos la hora a las 12:00 PM (mediodía) en lugar de las 00:00
    // Así, cualquier desfase de zona horaria nunca lo empujará al día anterior.
    const fechaObject = new Date(+parts[0], parts[1] - 1, +parts[2], 12, 0, 0);
    
    return fechaObject;
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
