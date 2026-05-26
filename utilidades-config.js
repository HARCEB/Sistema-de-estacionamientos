/**
 * Muestra la URL de la Web App de cancelación
 */
function obtenerUrlWebApp() {
  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty('url');
  
  Logger.log("==============================================");
  Logger.log("URL de la Web App de Cancelación:");
  Logger.log(url);
  Logger.log("==============================================");
  
  if (!url) {
    Logger.log("⚠ La URL no está configurada en las Script Properties");
    Logger.log("Necesitas desplegar la Web App primero:");
    Logger.log("1. En Apps Script Editor: Deploy → New deployment");
    Logger.log("2. Selecciona tipo: Web app");
    Logger.log("3. Execute as: User accessing the web app");
    Logger.log("4. Who has access: Anyone within [tu dominio]");
    Logger.log("5. Copia la URL y guárdala con: configurarUrlWebApp('URL_AQUI')");
  }
  
  return url;
}

/**
 * Configura la URL de la Web App en las propiedades
 */
function configurarUrlWebApp(urlWebApp) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('url', urlWebApp);
  
  Logger.log("✓ URL configurada exitosamente:");
  Logger.log(urlWebApp);
  
  return "URL guardada";
}

/**
 * Muestra todas las propiedades configuradas
 */
function verTodasLasPropiedades() {
  const properties = PropertiesService.getScriptProperties();
  const allProps = properties.getProperties();

  Logger.log("=== Propiedades del Script ===");
  for (const key in allProps) {
    Logger.log(key + " = " + allProps[key]);
  }

  return allProps;
}

/**
 * Detecta entradas en el formulario que no fueron procesadas (sin ID único)
 * Una entrada sin procesar tiene un timestamp en lugar de un ID buker-
 */
function detectarEntradasSinProcesar() {
  const sheet = obtenerHojaPrincipal().getSheetByName('Respuestas Reserva');
  const data = sheet.getDataRange().getValues();
  const entradasSinProcesar = [];

  Logger.log("=== Buscando entradas sin procesar ===");

  // Empezar desde la fila 2 (después del encabezado)
  for (let i = 1; i < data.length; i++) {
    const id = data[i][0];
    const idStr = String(id);

    // Si el ID no empieza con "buker-", es una entrada sin procesar
    if (!idStr.startsWith("buker-")) {
      const fila = i + 1; // +1 porque las filas empiezan en 1
      entradasSinProcesar.push({
        fila: fila,
        timestamp: id,
        email: data[i][1],
        nombre: data[i][2],
        fecha: data[i][3],
        hora: data[i][4]
      });

      Logger.log(`Fila ${fila}: ${data[i][2]} (${data[i][1]}) - ${id}`);
    }
  }

  Logger.log(`Total de entradas sin procesar: ${entradasSinProcesar.length}`);

  return entradasSinProcesar;
}

/**
 * Procesa manualmente una entrada sin procesar por número de fila
 * @param {number} fila - Número de fila a procesar (empezando desde 1)
 */
function procesarEntradaPorFila(fila) {
  const sheet = obtenerHojaPrincipal().getSheetByName('Respuestas Reserva');

  // Verificar que la fila tenga un ID sin procesar
  const idActual = sheet.getRange(fila, 1).getValue();
  if (String(idActual).startsWith("buker-")) {
    Logger.log(`La fila ${fila} ya tiene un ID válido: ${idActual}`);
    return "Ya procesada";
  }

  Logger.log(`Procesando fila ${fila}...`);
  Logger.log(`ID actual (timestamp): ${idActual}`);

  // Generar ID único
  const randomUnique = `buker-${Math.random().toString(36).slice(2)}-${Date.now()}`;

  // Normalizar nombre (columna 3)
  const nombre = sheet.getRange(fila, 3).getValue();
  if (nombre) {
    sheet.getRange(fila, 3).setValue(normalizarNombre(nombre));
  }

  // Convertir patente a mayúsculas (columna 6)
  const patente = sheet.getRange(fila, 6).getValue();
  if (patente) {
    sheet.getRange(fila, 6).setValue(String(patente).toUpperCase());
  }

  // Asignar ID único
  sheet.getRange(fila, 1).setValue(randomUnique);

  Logger.log(`✓ ID asignado: ${randomUnique}`);
  Logger.log(`Procesando asignación de estacionamiento...`);

  // Procesar asignación de estacionamiento
  asignarEstacionamiento(randomUnique);

  Logger.log(`✓ Entrada procesada exitosamente`);

  return randomUnique;
}

/**
 * Procesa TODAS las entradas sin procesar
 */
function procesarTodasLasEntradasPendientes() {
  const entradas = detectarEntradasSinProcesar();

  if (entradas.length === 0) {
    Logger.log("✓ No hay entradas pendientes de procesar");
    return "No hay entradas pendientes";
  }

  Logger.log(`=== Procesando ${entradas.length} entradas pendientes ===`);

  const resultados = [];
  for (const entrada of entradas) {
    Logger.log(`\nProcesando fila ${entrada.fila}: ${entrada.nombre}`);
    try {
      const id = procesarEntradaPorFila(entrada.fila);
      resultados.push({
        fila: entrada.fila,
        nombre: entrada.nombre,
        id: id,
        status: "✓ Éxito"
      });
    } catch (error) {
      Logger.log(`✗ Error en fila ${entrada.fila}: ${error}`);
      resultados.push({
        fila: entrada.fila,
        nombre: entrada.nombre,
        error: error.toString(),
        status: "✗ Fallo"
      });
    }
  }

  Logger.log("\n=== RESUMEN ===");
  for (const resultado of resultados) {
    Logger.log(`${resultado.status} Fila ${resultado.fila}: ${resultado.nombre} - ${resultado.id || resultado.error}`);
  }

  return resultados;
}

/**
 * Analiza y cuenta las filas basura en la hoja de respuestas (VERSIÓN RÁPIDA)
 * Lee todos los datos de una vez
 */
function analizarFilasBasura() {
  const sheet = obtenerHojaPrincipal().getSheetByName('Respuestas Reserva');
  const lastRow = sheet.getLastRow();

  Logger.log(`=== Análisis de filas basura (RÁPIDO) ===`);
  Logger.log(`Última fila con datos: ${lastRow}`);

  // Leer TODOS los datos de una vez (mucho más rápido)
  const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();

  const filasVacias = [];
  const filasConDatos = [];
  const filasSinID = [];

  Logger.log(`Analizando ${data.length} filas...`);

  // Procesar en memoria (muy rápido)
  for (let i = 0; i < data.length; i++) {
    const fila = data[i];
    const id = fila[0];
    const email = fila[1];
    const nombre = fila[2];

    const numFila = i + 2; // +2 porque empezamos en fila 2

    if (!id && !email && !nombre) {
      // Fila completamente vacía
      filasVacias.push(numFila);
    } else if (id && String(id).startsWith("buker-") && (email || nombre)) {
      // Fila con ID válido Y datos reales
      filasConDatos.push(numFila);
    } else {
      // Fila con problemas (sin ID válido O ID sin datos)
      filasSinID.push(numFila);
    }
  }

  Logger.log(`\n=== RESUMEN ===`);
  Logger.log(`Total de filas: ${data.length}`);
  Logger.log(`Filas completamente vacías: ${filasVacias.length}`);
  Logger.log(`Filas con ID válido (buker-): ${filasConDatos.length}`);
  Logger.log(`Filas sin ID válido: ${filasSinID.length}`);

  if (filasVacias.length > 0) {
    Logger.log(`\nPrimeras 10 filas vacías: ${filasVacias.slice(0, 10).join(', ')}`);
  }

  if (filasSinID.length > 0) {
    Logger.log(`\nPrimeras 10 filas sin ID válido:`);
    filasSinID.slice(0, 10).forEach(fila => {
      const datos = data[fila - 2]; // -2 porque data empieza en 0
      Logger.log(`  Fila ${fila}: ${JSON.stringify(datos)}`);
    });
  }

  return {
    totalFilas: data.length,
    filasVacias: filasVacias.length,
    filasConDatos: filasConDatos.length,
    filasSinID: filasSinID.length,
    listaFilasVacias: filasVacias,
    listaFilasSinID: filasSinID
  };
}

/**
 * Limpia SOLO las filas completamente vacías (VERSIÓN ULTRA RÁPIDA)
 * Esto es seguro porque solo elimina filas sin ningún dato
 * Reescribe la hoja completa con solo las filas que tienen datos
 */
function limpiarFilasVacias() {
  const sheet = obtenerHojaPrincipal().getSheetByName('Respuestas Reserva');
  const lastRow = sheet.getLastRow();

  Logger.log(`=== Limpiando filas vacías (ULTRA RÁPIDO) ===`);

  if (lastRow < 2) {
    Logger.log("✓ La hoja está vacía o solo tiene encabezados");
    return "Hoja vacía";
  }

  // Leer encabezados
  const headers = sheet.getRange(1, 1, 1, 6).getValues()[0];

  // Leer TODOS los datos de una vez
  const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();

  Logger.log(`Analizando ${data.length} filas...`);

  // Filtrar en memoria - CONSERVAR solo filas con al menos un dato
  const filasConDatos = data.filter(fila => {
    return fila.some(celda => celda !== "" && celda !== null && celda !== undefined);
  });

  const filasEliminadas = data.length - filasConDatos.length;

  Logger.log(`Filas con datos: ${filasConDatos.length}`);
  Logger.log(`Filas vacías a eliminar: ${filasEliminadas}`);

  if (filasEliminadas === 0) {
    Logger.log("✓ No hay filas vacías para eliminar");
    return "No hay filas vacías";
  }

  Logger.log(`Reescribiendo hoja (esto toma solo 1-2 segundos)...`);

  // Limpiar toda la hoja
  sheet.clear();

  // Escribir encabezados
  sheet.getRange(1, 1, 1, 6).setValues([headers]);

  // Escribir SOLO filas con datos (1 operación - SUPER RÁPIDO)
  if (filasConDatos.length > 0) {
    sheet.getRange(2, 1, filasConDatos.length, 6).setValues(filasConDatos);
  }

  Logger.log(`✓ Eliminadas ${filasEliminadas} filas vacías`);
  Logger.log(`✓ Conservadas ${filasConDatos.length} filas con datos`);
  Logger.log(`Nueva última fila: ${sheet.getLastRow()}`);

  return `Eliminadas ${filasEliminadas} filas vacías, conservadas ${filasConDatos.length}`;
}

/**
 * Limpia TODAS las filas basura - VERSIÓN ULTRA RÁPIDA
 * Reescribe la hoja completa con solo las filas válidas
 * ⚠️ USAR CON PRECAUCIÓN - Elimina filas que pueden tener datos
 */
function limpiarTodasLasFilasBasura() {
  const sheet = obtenerHojaPrincipal().getSheetByName('Respuestas Reserva');
  const lastRow = sheet.getLastRow();

  Logger.log(`=== Limpiando filas basura (ULTRA RÁPIDO) ===`);
  Logger.log(`⚠️ ESTO ELIMINARÁ FILAS SIN ID VÁLIDO`);

  // Leer encabezados
  const headers = sheet.getRange(1, 1, 1, 6).getValues()[0];

  // Leer TODOS los datos de una vez
  const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();

  Logger.log(`Analizando ${data.length} filas...`);

  // Filtrar en memoria - CONSERVAR solo filas con ID válido Y datos reales
  const filasValidas = data.filter(fila => {
    const id = fila[0];
    const email = fila[1];
    const nombre = fila[2];

    // Debe tener ID válido Y al menos email o nombre
    return id && String(id).startsWith("buker-") && (email || nombre);
  });

  const eliminadas = data.length - filasValidas.length;

  Logger.log(`Filas válidas: ${filasValidas.length}`);
  Logger.log(`Filas a eliminar: ${eliminadas}`);

  if (eliminadas === 0) {
    Logger.log("✓ No hay filas basura");
    return "No hay filas basura";
  }

  Logger.log(`Reescribiendo hoja...`);

  // Limpiar toda la hoja
  sheet.clear();

  // Escribir encabezados
  sheet.getRange(1, 1, 1, 6).setValues([headers]);

  // Escribir SOLO filas válidas (1 operación)
  if (filasValidas.length > 0) {
    sheet.getRange(2, 1, filasValidas.length, 6).setValues(filasValidas);
  }

  Logger.log(`✓ Eliminadas ${eliminadas} filas`);
  Logger.log(`✓ Conservadas ${filasValidas.length} filas`);
  Logger.log(`Nueva última fila: ${sheet.getLastRow()}`);

  return `Eliminadas ${eliminadas} filas, conservadas ${filasValidas.length}`;
}
