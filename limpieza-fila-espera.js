/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SCRIPT DE LIMPIEZA MASIVA - FILA DE ESPERA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PROBLEMA: La hoja Fila_Espera tiene miles de registros desde 2023
 * que nunca fueron eliminados cuando las personas fueron asignadas.
 *
 * SOLUCIÓN: Limpieza masiva en 3 estrategias:
 * 1. Eliminar fechas pasadas (antes de hoy)
 * 2. Eliminar duplicados (personas que ya están en Estacionamientos_Asignados)
 * 3. Eliminar registros antiguos (más de X días)
 *
 * USO: Ejecutar UNA SOLA VEZ para limpiar el sistema
 *
 * Fecha: 18/12/2024
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ============================================================================
// ANÁLISIS DEL PROBLEMA
// ============================================================================

/**
 * Analiza la situación actual de la fila de espera
 * Muestra estadísticas detalladas
 */
function analizarFilaEsperaSituacion() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║        ANÁLISIS DE SITUACIÓN - FILA DE ESPERA               ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  const spreadsheetFila = obtenerHojaPrincipal().getSheetByName('Fila_Espera');
  const lastRow = spreadsheetFila.getLastRow();
  const numRows = lastRow > 1 ? lastRow - 1 : 0;

  if (numRows === 0) {
    Logger.log("✅ La fila está vacía");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return { total: 0 };
  }

  Logger.log(`📊 Total de registros en Fila_Espera: ${numRows}\n`);

  // Leer todos los datos
  const datos = spreadsheetFila.getRange(2, 1, numRows, 7).getValues();
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  // Estadísticas
  const stats = {
    total: 0,
    conFechasPasadas: 0,
    conFechasValidas: 0,
    duplicadosEnAsignados: 0,
    porAnio: {},
    fechasPasadas: [],
    fechasValidas: [],
    duplicados: []
  };

  // Obtener IDs de personas ya asignadas
  const spreadsheetAsignados = obtenerHojaPrincipal().getSheetByName('Estacionamientos_Asignados');
  const lastRowAsignados = spreadsheetAsignados.getLastRow();
  const idsAsignados = lastRowAsignados > 1
    ? new Set(spreadsheetAsignados.getRange(2, 1, lastRowAsignados - 1, 1).getValues().flat())
    : new Set();

  Logger.log("Analizando registros...\n");

  datos.forEach((row, index) => {
    if (row[0] === "") return; // Fila vacía

    const id = row[0];
    const nombre = row[1];
    const fechaCelda = row[3];

    stats.total++;

    // Convertir fecha
    let fechaReserva;
    if (fechaCelda instanceof Date) {
      fechaReserva = new Date(fechaCelda);
    } else {
      try {
        const parts = String(fechaCelda).split("/");
        fechaReserva = new Date(+parts[2], parts[1] - 1, +parts[0]);
      } catch (error) {
        Logger.log(`⚠️ Fila ${index + 2}: Fecha inválida "${fechaCelda}"`);
        return;
      }
    }

    fechaReserva.setHours(0, 0, 0, 0);

    // Estadística por año
    const anio = fechaReserva.getFullYear();
    stats.porAnio[anio] = (stats.porAnio[anio] || 0) + 1;

    // ¿Fecha pasada?
    if (fechaReserva < hoy) {
      stats.conFechasPasadas++;
      stats.fechasPasadas.push({
        fila: index + 2,
        id: id,
        nombre: nombre,
        fecha: formattedDate(fechaReserva),
        diasPasados: Math.floor((hoy - fechaReserva) / (1000 * 60 * 60 * 24))
      });
    } else {
      stats.conFechasValidas++;
      stats.fechasValidas.push({
        fila: index + 2,
        id: id,
        nombre: nombre,
        fecha: formattedDate(fechaReserva)
      });
    }

    // ¿Duplicado?
    if (idsAsignados.has(id)) {
      stats.duplicadosEnAsignados++;
      stats.duplicados.push({
        fila: index + 2,
        id: id,
        nombre: nombre,
        fecha: formattedDate(fechaReserva)
      });
    }
  });

  // Mostrar resultados
  Logger.log("═══════════════════════════════════════════════════════════════");
  Logger.log("                    RESULTADOS DEL ANÁLISIS");
  Logger.log("═══════════════════════════════════════════════════════════════\n");

  Logger.log(`📊 TOTAL DE REGISTROS: ${stats.total}\n`);

  Logger.log("📅 Por año:");
  Object.keys(stats.porAnio).sort().forEach(anio => {
    Logger.log(`   ${anio}: ${stats.porAnio[anio]} registro(s)`);
  });
  Logger.log("");

  Logger.log(`❌ FECHAS PASADAS: ${stats.conFechasPasadas} (${((stats.conFechasPasadas/stats.total)*100).toFixed(1)}%)`);
  Logger.log(`✅ FECHAS VÁLIDAS: ${stats.conFechasValidas} (${((stats.conFechasValidas/stats.total)*100).toFixed(1)}%)`);
  Logger.log(`🔄 DUPLICADOS (ya asignados): ${stats.duplicadosEnAsignados} (${((stats.duplicadosEnAsignados/stats.total)*100).toFixed(1)}%)\n`);

  // Mostrar algunos ejemplos de fechas pasadas
  if (stats.fechasPasadas.length > 0) {
    Logger.log("📋 Ejemplos de fechas pasadas (primeras 10):");
    stats.fechasPasadas.slice(0, 10).forEach(item => {
      Logger.log(`   Fila ${item.fila}: ${item.nombre} - ${item.fecha} (hace ${item.diasPasados} días)`);
    });
    if (stats.fechasPasadas.length > 10) {
      Logger.log(`   ... y ${stats.fechasPasadas.length - 10} más`);
    }
    Logger.log("");
  }

  // Mostrar algunos ejemplos de duplicados
  if (stats.duplicados.length > 0) {
    Logger.log("📋 Ejemplos de duplicados (primeras 10):");
    stats.duplicados.slice(0, 10).forEach(item => {
      Logger.log(`   Fila ${item.fila}: ${item.nombre} (${item.id}) - YA ASIGNADO`);
    });
    if (stats.duplicados.length > 10) {
      Logger.log(`   ... y ${stats.duplicados.length - 10} más`);
    }
    Logger.log("");
  }

  // Recomendaciones
  Logger.log("═══════════════════════════════════════════════════════════════");
  Logger.log("                       RECOMENDACIONES");
  Logger.log("═══════════════════════════════════════════════════════════════\n");

  if (stats.conFechasPasadas > 0) {
    Logger.log(`⚠️  Hay ${stats.conFechasPasadas} registros con fechas pasadas`);
    Logger.log("   → Ejecuta: limpiarFechasPasadas()");
    Logger.log("");
  }

  if (stats.duplicadosEnAsignados > 0) {
    Logger.log(`⚠️  Hay ${stats.duplicadosEnAsignados} personas ya asignadas (duplicados)`);
    Logger.log("   → Ejecuta: limpiarDuplicados()");
    Logger.log("");
  }

  if (stats.conFechasValidas > 100) {
    Logger.log(`⚠️  Hay ${stats.conFechasValidas} personas con fechas válidas en fila`);
    Logger.log("   → Esto es mucho, considera procesar: procesarColaAhora()");
    Logger.log("");
  }

  Logger.log("💡 Para limpieza completa automática:");
  Logger.log("   → Ejecuta: limpiezaCompletaFilaEspera()");
  Logger.log("");

  Logger.log("════════════════════════════════════════════════════════════════\n");

  return stats;
}

// ============================================================================
// FUNCIONES DE LIMPIEZA
// ============================================================================

/**
 * Elimina TODOS los registros con fechas pasadas
 * OPTIMIZADO: En vez de eliminar fila por fila, reescribe solo las válidas
 */
function limpiarFechasPasadas() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║           LIMPIEZA DE FECHAS PASADAS                        ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  const spreadsheetFila = obtenerHojaPrincipal().getSheetByName('Fila_Espera');
  const lastRow = spreadsheetFila.getLastRow();
  const numRows = lastRow > 1 ? lastRow - 1 : 0;

  if (numRows === 0) {
    Logger.log("✅ La fila ya está vacía");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return { eliminados: 0 };
  }

  const datos = spreadsheetFila.getRange(2, 1, numRows, 7).getValues();
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const filasValidas = [];
  let eliminados = 0;

  Logger.log("📊 Filtrando fechas válidas...\n");

  // Filtrar solo filas válidas (fechas futuras)
  for (let i = 0; i < datos.length; i++) {
    if (datos[i][0] === "") continue;

    const fechaCelda = datos[i][3];
    let fechaReserva;

    if (fechaCelda instanceof Date) {
      fechaReserva = new Date(fechaCelda);
    } else {
      try {
        const parts = String(fechaCelda).split("/");
        fechaReserva = new Date(+parts[2], parts[1] - 1, +parts[0]);
      } catch (error) {
        // Si no se puede parsear, eliminar
        eliminados++;
        continue;
      }
    }

    fechaReserva.setHours(0, 0, 0, 0);

    // Si es fecha futura, conservar
    if (fechaReserva >= hoy) {
      filasValidas.push(datos[i]);
    } else {
      eliminados++;
    }
  }

  Logger.log(`✅ Fechas válidas encontradas: ${filasValidas.length}`);
  Logger.log(`🗑️  Fechas pasadas a eliminar: ${eliminados}\n`);

  if (eliminados === 0) {
    Logger.log("✅ No hay fechas pasadas para eliminar");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return { eliminados: 0 };
  }

  Logger.log("🔄 Reescribiendo hoja con solo fechas válidas...");

  // Limpiar todo el contenido (excepto header)
  if (numRows > 0) {
    spreadsheetFila.getRange(2, 1, numRows, 7).clearContent();
  }

  // Reescribir solo las válidas
  if (filasValidas.length > 0) {
    spreadsheetFila.getRange(2, 1, filasValidas.length, 7).setValues(filasValidas);
  }

  Logger.log(`\n✅ ${eliminados} registro(s) eliminado(s)`);
  Logger.log(`✅ ${filasValidas.length} registro(s) conservado(s)`);
  Logger.log("════════════════════════════════════════════════════════════════\n");

  return { eliminados: eliminados, conservados: filasValidas.length };
}

/**
 * Elimina registros que ya están en Estacionamientos_Asignados (duplicados)
 * OPTIMIZADO: Reescribe solo los no-duplicados
 */
function limpiarDuplicados() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║           LIMPIEZA DE DUPLICADOS                             ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  const spreadsheetFila = obtenerHojaPrincipal().getSheetByName('Fila_Espera');
  const spreadsheetAsignados = obtenerHojaPrincipal().getSheetByName('Estacionamientos_Asignados');

  const lastRowFila = spreadsheetFila.getLastRow();
  const numRowsFila = lastRowFila > 1 ? lastRowFila - 1 : 0;

  if (numRowsFila === 0) {
    Logger.log("✅ La fila ya está vacía");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return { eliminados: 0 };
  }

  // Obtener todos los IDs de personas asignadas
  const lastRowAsignados = spreadsheetAsignados.getLastRow();
  const idsAsignados = lastRowAsignados > 1
    ? new Set(spreadsheetAsignados.getRange(2, 1, lastRowAsignados - 1, 1).getValues().flat())
    : new Set();

  Logger.log(`📊 IDs en Estacionamientos_Asignados: ${idsAsignados.size}\n`);

  // Leer fila de espera
  const datosFila = spreadsheetFila.getRange(2, 1, numRowsFila, 7).getValues();
  const filasNoDuplicadas = [];
  let eliminados = 0;

  Logger.log("📊 Filtrando no-duplicados...\n");

  // Filtrar solo filas que NO son duplicados
  for (let i = 0; i < datosFila.length; i++) {
    if (datosFila[i][0] === "") continue;

    const id = datosFila[i][0];
    if (!idsAsignados.has(id)) {
      filasNoDuplicadas.push(datosFila[i]);
    } else {
      eliminados++;
    }
  }

  Logger.log(`✅ No-duplicados encontrados: ${filasNoDuplicadas.length}`);
  Logger.log(`🗑️  Duplicados a eliminar: ${eliminados}\n`);

  if (eliminados === 0) {
    Logger.log("✅ No hay duplicados para eliminar");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return { eliminados: 0 };
  }

  Logger.log("🔄 Reescribiendo hoja sin duplicados...");

  // Limpiar todo el contenido (excepto header)
  if (numRowsFila > 0) {
    spreadsheetFila.getRange(2, 1, numRowsFila, 7).clearContent();
  }

  // Reescribir solo los no-duplicados
  if (filasNoDuplicadas.length > 0) {
    spreadsheetFila.getRange(2, 1, filasNoDuplicadas.length, 7).setValues(filasNoDuplicadas);
  }

  Logger.log(`\n✅ ${eliminados} duplicado(s) eliminado(s)`);
  Logger.log(`✅ ${filasNoDuplicadas.length} registro(s) conservado(s)`);
  Logger.log("════════════════════════════════════════════════════════════════\n");

  return { eliminados: eliminados, conservados: filasNoDuplicadas.length };
}

/**
 * Limpieza completa: fechas pasadas + duplicados
 * Esta es la función TODO-EN-UNO recomendada
 */
function limpiezaCompletaFilaEspera() {
  Logger.log("\n\n");
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║                                                              ║");
  Logger.log("║        🧹 LIMPIEZA COMPLETA DE FILA DE ESPERA 🧹            ║");
  Logger.log("║                                                              ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝");
  Logger.log(`⏰ ${new Date().toString()}\n\n`);

  const inicio = Date.now();

  // Paso 1: Análisis inicial
  Logger.log("═══ PASO 1: ANÁLISIS INICIAL ═══\n");
  const statsInicial = analizarFilaEsperaSituacion();

  if (statsInicial.total === 0) {
    Logger.log("✅ La fila ya está limpia, nada que hacer\n");
    return { totalEliminados: 0 };
  }

  Logger.log("\n═══ PASO 2: LIMPIEZA DE FECHAS PASADAS ═══\n");
  const resultadoFechas = limpiarFechasPasadas();

  Logger.log("\n═══ PASO 3: LIMPIEZA DE DUPLICADOS ═══\n");
  const resultadoDuplicados = limpiarDuplicados();

  Logger.log("\n═══ PASO 4: ANÁLISIS FINAL ═══\n");
  const statsFinal = analizarFilaEsperaSituacion();

  const tiempo = ((Date.now() - inicio) / 1000).toFixed(2);

  Logger.log("\n\n");
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║                    RESUMEN DE LIMPIEZA                       ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");
  Logger.log(`📊 Registros antes: ${statsInicial.total}`);
  Logger.log(`🗑️  Fechas pasadas eliminadas: ${resultadoFechas.eliminados}`);
  Logger.log(`🗑️  Duplicados eliminados: ${resultadoDuplicados.eliminados}`);
  Logger.log(`📊 Registros después: ${statsFinal.total}`);
  Logger.log(`⏱️  Tiempo total: ${tiempo}s\n`);

  const totalEliminados = resultadoFechas.eliminados + resultadoDuplicados.eliminados;
  const porcentajeEliminado = ((totalEliminados / statsInicial.total) * 100).toFixed(1);

  Logger.log(`✅ LIMPIEZA COMPLETADA: ${totalEliminados} registros eliminados (${porcentajeEliminado}%)`);
  Logger.log("════════════════════════════════════════════════════════════════\n\n");

  return {
    totalEliminados: totalEliminados,
    fechasPasadas: resultadoFechas.eliminados,
    duplicados: resultadoDuplicados.eliminados,
    registrosRestantes: statsFinal.total,
    tiempo: tiempo
  };
}

// ============================================================================
// BACKUP Y RECUPERACIÓN
// ============================================================================

/**
 * Crea un backup de la hoja Fila_Espera antes de limpiar
 * IMPORTANTE: Ejecutar esto ANTES de cualquier limpieza
 */
function crearBackupFilaEspera() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║              CREANDO BACKUP DE FILA_ESPERA                   ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  try {
    const ss = obtenerHojaPrincipal();
    const filaEspera = ss.getSheetByName('Fila_Espera');

    if (!filaEspera) {
      Logger.log("❌ No se encuentra la hoja Fila_Espera");
      return { success: false };
    }

    // Crear copia con timestamp
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");
    const nombreBackup = `Fila_Espera_BACKUP_${timestamp}`;

    const backup = filaEspera.copyTo(ss);
    backup.setName(nombreBackup);

    // Mover al final
    ss.moveActiveSheet(ss.getNumSheets());

    Logger.log(`✅ Backup creado: ${nombreBackup}`);
    Logger.log(`📊 Filas copiadas: ${backup.getLastRow()}`);
    Logger.log("\n💡 Si algo sale mal, puedes restaurar desde este backup");
    Logger.log("════════════════════════════════════════════════════════════════\n");

    return { success: true, nombreBackup: nombreBackup, filas: backup.getLastRow() };

  } catch (error) {
    Logger.log(`❌ Error al crear backup: ${error}`);
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return { success: false, error: error.toString() };
  }
}
