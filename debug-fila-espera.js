/**
 * 🔧 HERRAMIENTAS DE DEBUGGING PARA FILA DE ESPERA
 * 
 * Este archivo contiene funciones para diagnosticar y solucionar
 * problemas con el sistema de fila de espera.
 * 
 * INSTRUCCIONES:
 * 1. Abre el Editor de Apps Script
 * 2. Copia este archivo al proyecto
 * 3. Ejecuta las funciones según necesites
 */

// ============================================================================
// 📊 FUNCIONES DE DIAGNÓSTICO
// ============================================================================

/**
 * Muestra un resumen completo del estado de las filas de espera
 * 
 * USO: Ejecutar cuando necesites ver el estado general
 */
function diagnosticarFilasEspera() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║        DIAGNÓSTICO COMPLETO DE FILAS DE ESPERA              ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");
  
  const spreadsheetFila = obtenerHojaPrincipal().getSheetByName('Fila_Espera');
  const datos = spreadsheetFila.getRange("A2:G").getValues().filter(row => row[0] !== "");
  
  Logger.log(`📋 Total de personas en fila: ${datos.length}\n`);
  
  if (datos.length === 0) {
    Logger.log("✅ No hay personas en fila de espera");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return {total: 0, porFecha: {}};
  }
  
  // Agrupar por fecha
  const porFecha = {};
  datos.forEach(row => {
    let fechaCelda = row[3]; // Columna D
    const puesto = row[6]; // Columna G
    
    // Convertir Date a string para agrupar
    let fechaKey;
    if (fechaCelda instanceof Date) {
      fechaKey = [fechaCelda.getDate(), fechaCelda.getMonth() + 1, fechaCelda.getFullYear()].join("/");
    } else {
      fechaKey = fechaCelda;
    }
    
    if (!porFecha[fechaKey]) {
      porFecha[fechaKey] = [];
    }
    porFecha[fechaKey].push({
      id: row[0],
      nombre: row[1],
      email: row[2],
      hora: row[4],
      patente: row[5],
      puesto: puesto,
      fechaOriginal: fechaCelda
    });
  });
  
  // Mostrar por fecha
  Logger.log("📅 Desglose por fecha:\n");
  const fechasOrdenadas = Object.keys(porFecha).sort((a, b) => {
    return stringToDate(a) - stringToDate(b);
  });
  
  fechasOrdenadas.forEach(fechaKey => {
    const personas = porFecha[fechaKey];
    Logger.log(`╭─ ${fechaKey} (${personas.length} personas en espera) ─────────────`);
    
    // Ordenar por puesto
    personas.sort((a, b) => a.puesto - b.puesto);
    
    personas.forEach(p => {
      Logger.log(`│  ${p.puesto}. ${p.nombre}`);
      Logger.log(`│     Email: ${p.email}`);
      Logger.log(`│     Hora: ${p.hora} | Patente: ${p.patente}`);
      Logger.log(`│     ID: ${p.id}`);
      Logger.log(`│`);
    });
    
    // Verificar cupos disponibles - usar la fecha original (puede ser Date o string)
    const fechaParaVerificar = personas[0].fechaOriginal;
    
    try {
      const cupos = verificarCupoEstacionamiento(fechaParaVerificar, "DIA COMPLETO");
      const cuposAM = verificarCupoEstacionamiento(fechaParaVerificar, "AM");
      const cuposPM = verificarCupoEstacionamiento(fechaParaVerificar, "PM");
      
      Logger.log(`│  💡 Cupos disponibles:`);
      Logger.log(`│     Día Completo: ${cupos ? cupos : 'NO HAY'}`);
      Logger.log(`│     AM: ${cuposAM ? cuposAM : 'NO HAY'}`);
      Logger.log(`│     PM: ${cuposPM ? cuposPM : 'NO HAY'}`);
    } catch (error) {
      Logger.log(`│  ⚠️  Error al verificar cupos: ${error.message}`);
    }
    
    Logger.log(`╰────────────────────────────────────────────────────────────\n`);
  });
  
  Logger.log("════════════════════════════════════════════════════════════════\n");
  
  return {total: datos.length, porFecha: porFecha};
}

/**
 * Verifica el estado de los triggers del proyecto
 * 
 * USO: Ejecutar para ver qué triggers están activos
 */
function diagnosticarTriggers() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║              DIAGNÓSTICO DE TRIGGERS                         ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");
  
  const triggers = ScriptApp.getProjectTriggers();
  
  Logger.log(`📊 Total de triggers: ${triggers.length}\n`);
  
  if (triggers.length === 0) {
    Logger.log("⚠️  NO HAY TRIGGERS CONFIGURADOS");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return {total: 0, triggers: []};
  }
  
  const triggersPorTipo = {
    formSubmit: [],
    timeBased: [],
    otros: []
  };
  
  triggers.forEach((trigger, index) => {
    const func = trigger.getHandlerFunction();
    const tipo = trigger.getEventType().toString();
    const id = trigger.getUniqueId();
    
    const info = {
      index: index + 1,
      funcion: func,
      tipo: tipo,
      id: id
    };
    
    if (tipo === 'ON_FORM_SUBMIT') {
      triggersPorTipo.formSubmit.push(info);
    } else if (tipo === 'CLOCK') {
      triggersPorTipo.timeBased.push(info);
    } else {
      triggersPorTipo.otros.push(info);
    }
  });
  
  // Mostrar por tipo
  Logger.log("📋 Triggers de Formulario (ON_FORM_SUBMIT):");
  if (triggersPorTipo.formSubmit.length === 0) {
    Logger.log("   ⚠️  NINGUNO - El sistema NO procesará formularios\n");
  } else {
    triggersPorTipo.formSubmit.forEach(t => {
      Logger.log(`   ${t.index}. ${t.funcion}`);
      Logger.log(`      ID: ${t.id}\n`);
    });
  }
  
  Logger.log("⏰ Triggers Temporizados (CLOCK):");
  if (triggersPorTipo.timeBased.length === 0) {
    Logger.log("   ⚠️  NINGUNO - No hay procesamiento automático de filas\n");
  } else {
    triggersPorTipo.timeBased.forEach(t => {
      Logger.log(`   ${t.index}. ${t.funcion}`);
      Logger.log(`      ID: ${t.id}\n`);
    });
  }
  
  if (triggersPorTipo.otros.length > 0) {
    Logger.log("🔧 Otros Triggers:");
    triggersPorTipo.otros.forEach(t => {
      Logger.log(`   ${t.index}. ${t.funcion} (${t.tipo})`);
      Logger.log(`      ID: ${t.id}\n`);
    });
  }
  
  // Recomendaciones
  Logger.log("💡 Recomendaciones:");
  if (triggersPorTipo.formSubmit.length === 0) {
    Logger.log("   ❌ Falta trigger de formulario - ejecuta: configurarTriggerDispatcher()");
  } else if (triggersPorTipo.formSubmit.length > 1) {
    Logger.log("   ⚠️  Múltiples triggers de formulario - podrían causar duplicados");
  } else {
    Logger.log("   ✅ Trigger de formulario OK");
  }
  
  if (triggersPorTipo.timeBased.length === 0) {
    Logger.log("   ❌ No hay trigger automático para procesar filas");
    Logger.log("      → Las filas solo se procesan en cancelaciones");
    Logger.log("      → Ejecuta: instalarTriggerAutomaticoFilas()");
  } else {
    Logger.log("   ✅ Hay trigger(s) automático(s)");
  }
  
  Logger.log("\n════════════════════════════════════════════════════════════════\n");
  
  return {total: triggers.length, porTipo: triggersPorTipo};
}

/**
 * Verifica las propiedades del script (configuración)
 */
function diagnosticarConfiguracion() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║           DIAGNÓSTICO DE CONFIGURACIÓN                      ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");
  
  const props = PropertiesService.getScriptProperties().getProperties();
  
  Logger.log("📋 Propiedades del Script:\n");
  
  const propiedadesRequeridas = ['sheet_id', 'url', 'reply_email'];
  const faltantes = [];
  
  propiedadesRequeridas.forEach(prop => {
    if (props[prop]) {
      Logger.log(`✅ ${prop}: ${props[prop].substring(0, 50)}...`);
    } else {
      Logger.log(`❌ ${prop}: NO CONFIGURADO`);
      faltantes.push(prop);
    }
  });
  
  Logger.log("");
  
  // Propiedades adicionales (pueden ser temporales)
  const adicionales = Object.keys(props).filter(k => !propiedadesRequeridas.includes(k));
  if (adicionales.length > 0) {
    Logger.log("🔧 Propiedades Adicionales/Temporales:");
    adicionales.forEach(prop => {
      Logger.log(`   ${prop}: ${props[prop]}`);
    });
    Logger.log("");
  }
  
  if (faltantes.length > 0) {
    Logger.log("⚠️  FALTAN PROPIEDADES REQUERIDAS:");
    faltantes.forEach(prop => {
      Logger.log(`   - ${prop}`);
    });
  } else {
    Logger.log("✅ Todas las propiedades requeridas están configuradas");
  }
  
  Logger.log("\n════════════════════════════════════════════════════════════════\n");
  
  return {propiedades: props, faltantes: faltantes};
}

// ============================================================================
// 🔧 FUNCIONES DE REPARACIÓN
// ============================================================================

/**
 * Limpia todos los triggers huérfanos o duplicados
 * 
 * USO: Ejecutar cuando hay triggers acumulados
 */
function limpiarTriggersHuerfanos() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║          LIMPIEZA DE TRIGGERS HUÉRFANOS                      ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");
  
  const triggers = ScriptApp.getProjectTriggers();
  Logger.log(`📊 Triggers actuales: ${triggers.length}\n`);
  
  let eliminados = 0;
  const funcionesAEliminar = ['procesarFilaBackground']; // Triggers temporales
  
  triggers.forEach(trigger => {
    const func = trigger.getHandlerFunction();
    
    if (funcionesAEliminar.includes(func)) {
      Logger.log(`🗑️  Eliminando: ${func} (${trigger.getUniqueId()})`);
      ScriptApp.deleteTrigger(trigger);
      eliminados++;
    }
  });
  
  Logger.log("");
  if (eliminados > 0) {
    Logger.log(`✅ Se eliminaron ${eliminados} trigger(s) huérfano(s)`);
  } else {
    Logger.log("✅ No se encontraron triggers huérfanos");
  }
  
  Logger.log("\n════════════════════════════════════════════════════════════════\n");
  
  return {eliminados: eliminados};
}

/**
 * Procesa TODAS las filas de espera pendientes AHORA
 * 
 * USO: Solución de emergencia cuando hay cupos vacíos y personas en fila
 * IMPORTANTE: Esta función puede tardar varios minutos
 */
function procesarTodasLasFilasAhora() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║       PROCESAMIENTO MANUAL DE TODAS LAS FILAS               ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");
  
  const inicio = Date.now();

  // Obtener todas las fechas únicas en la fila
  const spreadsheetFila = obtenerHojaPrincipal().getSheetByName('Fila_Espera');
  const lastRow = spreadsheetFila.getLastRow();
  const numRows = lastRow > 1 ? lastRow - 1 : 0;

  if (numRows === 0) {
    Logger.log("✅ No hay personas en fila de espera");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return {procesadas: 0, asignadas: 0};
  }

  const todasLasFechas = spreadsheetFila.getRange(2, 4, numRows, 1)
    .getValues()
    .flat()
    .filter(fecha => fecha !== "")
    .map(fecha => {
      // Asegurar formato correcto
      if (fecha instanceof Date) {
        return formattedDate(fecha);
      }
      return fecha;
    });
  
  // Eliminar duplicados
  const fechasUnicas = [...new Set(todasLasFechas)];
  
  Logger.log(`📅 Fechas con personas en fila: ${fechasUnicas.length}\n`);
  
  if (fechasUnicas.length === 0) {
    Logger.log("✅ No hay personas en fila de espera");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return {procesadas: 0, asignadas: 0};
  }
  
  let procesadas = 0;
  let personasAsignadas = 0;
  let errores = 0;
  
  fechasUnicas.forEach(fecha => {
    Logger.log(`\n─────────────────────────────────────────────────────────────`);
    Logger.log(`📆 Procesando fecha: ${fecha}`);
    Logger.log(`─────────────────────────────────────────────────────────────`);
    
    try {
      // Contar personas antes
      const antesIndices = getIndexMatch(spreadsheetFila, "D2:D", fecha);
      const personasAntes = antesIndices.length;
      Logger.log(`   Personas en fila ANTES: ${personasAntes}`);
      
      // Procesar
      procesarFila(fecha);
      
      // Contar personas después
      const despuesIndices = getIndexMatch(spreadsheetFila, "D2:D", fecha);
      const personasDespues = despuesIndices.length;
      const asignadas = personasAntes - personasDespues;
      
      Logger.log(`   Personas en fila DESPUÉS: ${personasDespues}`);
      Logger.log(`   ✅ Personas asignadas: ${asignadas}`);
      
      procesadas++;
      personasAsignadas += asignadas;
      
    } catch (error) {
      Logger.log(`   ❌ ERROR al procesar: ${error.toString()}`);
      errores++;
    }
  });
  
  Logger.log("\n╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║                    RESUMEN FINAL                             ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝");
  Logger.log(`📊 Fechas procesadas: ${procesadas}/${fechasUnicas.length}`);
  Logger.log(`✅ Personas asignadas: ${personasAsignadas}`);
  Logger.log(`❌ Errores: ${errores}`);
  Logger.log(`⏱️  Tiempo total: ${((Date.now() - inicio) / 1000).toFixed(2)}s`);
  Logger.log("════════════════════════════════════════════════════════════════\n");
  
  // Actualizar cupos disponibles
  Logger.log("📊 Actualizando cupos disponibles...");
  try {
    actualizarCuposDisponibles();
    Logger.log("✅ Cupos actualizados\n");
  } catch (error) {
    Logger.log(`❌ Error al actualizar cupos: ${error.toString()}\n`);
  }
  
  return {
    procesadas: procesadas,
    asignadas: personasAsignadas,
    errores: errores,
    tiempo: Date.now() - inicio
  };
}

// ============================================================================
// 🚀 FUNCIONES DE IMPLEMENTACIÓN DE SOLUCIONES
// ============================================================================

/**
 * Instala un trigger que procesa automáticamente las filas cada hora
 * 
 * ESTA ES LA SOLUCIÓN AL PROBLEMA PRINCIPAL
 * 
 * USO: Ejecutar UNA VEZ para instalar el trigger automático
 */
function instalarTriggerAutomaticoFilas() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║     INSTALANDO TRIGGER AUTOMÁTICO PARA FILAS DE ESPERA      ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");
  
  // Verificar si ya existe
  const triggers = ScriptApp.getProjectTriggers();
  const yaExiste = triggers.some(t => 
    t.getHandlerFunction() === 'procesarTodasLasFilasAutomatico'
  );
  
  if (yaExiste) {
    Logger.log("⚠️  Ya existe un trigger automático para procesar filas");
    Logger.log("   Si quieres reinstalarlo, primero ejecuta: desinstalarTriggerAutomaticoFilas()");
    Logger.log("\n════════════════════════════════════════════════════════════════\n");
    return {instalado: false, razon: 'Ya existe'};
  }
  
  try {
    // Crear trigger que se ejecuta cada hora
    ScriptApp.newTrigger('procesarTodasLasFilasAutomatico')
      .timeBased()
      .everyHours(1) // Cambiar a .everyMinutes(30) si quieres cada 30 min
      .create();
    
    Logger.log("✅ Trigger instalado exitosamente");
    Logger.log("");
    Logger.log("⏰ Se ejecutará cada 1 hora automáticamente");
    Logger.log("📋 Función: procesarTodasLasFilasAutomatico()");
    Logger.log("");
    Logger.log("💡 Para verificar que funciona:");
    Logger.log("   1. Espera 1 hora");
    Logger.log("   2. Ve a 'Ejecuciones' en el editor");
    Logger.log("   3. Busca 'procesarTodasLasFilasAutomatico'");
    Logger.log("");
    Logger.log("🔧 Para cambiar frecuencia:");
    Logger.log("   1. Ejecuta: desinstalarTriggerAutomaticoFilas()");
    Logger.log("   2. Edita esta función");
    Logger.log("   3. Vuelve a ejecutar: instalarTriggerAutomaticoFilas()");
    
    Logger.log("\n════════════════════════════════════════════════════════════════\n");
    
    return {instalado: true};
    
  } catch (error) {
    Logger.log(`❌ ERROR al instalar trigger: ${error.toString()}`);
    Logger.log("\n════════════════════════════════════════════════════════════════\n");
    return {instalado: false, error: error.toString()};
  }
}

/**
 * Desinstala el trigger automático de procesamiento de filas
 */
function desinstalarTriggerAutomaticoFilas() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║    DESINSTALANDO TRIGGER AUTOMÁTICO DE FILAS DE ESPERA      ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");
  
  const triggers = ScriptApp.getProjectTriggers();
  let eliminados = 0;
  
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'procesarTodasLasFilasAutomatico') {
      Logger.log(`🗑️  Eliminando trigger: ${trigger.getUniqueId()}`);
      ScriptApp.deleteTrigger(trigger);
      eliminados++;
    }
  });
  
  Logger.log("");
  if (eliminados > 0) {
    Logger.log(`✅ Se eliminaron ${eliminados} trigger(s)`);
  } else {
    Logger.log("ℹ️  No se encontraron triggers de procesamiento automático");
  }
  
  Logger.log("\n════════════════════════════════════════════════════════════════\n");
  
  return {eliminados: eliminados};
}

/**
 * Función que será ejecutada automáticamente por el trigger
 * Procesa todas las filas pendientes
 */
function procesarTodasLasFilasAutomatico() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║   🤖 EJECUCIÓN AUTOMÁTICA - PROCESAMIENTO DE FILAS          ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝");
  Logger.log(`⏰ Hora: ${new Date().toString()}\n`);
  
  const resultado = procesarTodasLasFilasAhora();
  
  // Log resumido para ejecuciones automáticas
  Logger.log(`\n✅ Ejecución completada: ${resultado.asignadas} personas asignadas`);
  
  return resultado;
}

// ============================================================================
// 🧪 FUNCIONES DE TESTING
// ============================================================================

/**
 * Simula el procesamiento de una fila SIN hacer cambios reales
 * 
 * USO: Para probar qué pasaría si se procesa una fecha específica
 */
function simularProcesamientoFila(fecha) {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║         SIMULACIÓN DE PROCESAMIENTO (SIN CAMBIOS)           ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");
  Logger.log(`📅 Fecha: ${fecha}\n`);
  
  const spreadsheetFila = obtenerHojaPrincipal().getSheetByName('Fila_Espera');
  
  // Obtener personas en fila para esta fecha
  let filaEspera = getIndexMatch(spreadsheetFila, "D2:D", fecha)
    .map(index => {
      const row = spreadsheetFila.getRange(index, 1, 1, 7).getValues()[0];
      return {
        index: index,
        id: row[0],
        nombre: row[1],
        email: row[2],
        fecha: row[3],
        hora: row[4],
        patente: row[5],
        puesto: row[6]
      };
    })
    .sort((a, b) => a.puesto - b.puesto);
  
  Logger.log(`👥 Personas en fila: ${filaEspera.length}\n`);
  
  if (filaEspera.length === 0) {
    Logger.log("✅ No hay nadie en la fila para esta fecha");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return {personasEnFila: 0, sePodria: []};
  }
  
  const sePodriaAsignar = [];
  
  filaEspera.forEach(persona => {
    Logger.log(`─────────────────────────────────────────────────────────────`);
    Logger.log(`👤 Puesto #${persona.puesto}: ${persona.nombre}`);
    Logger.log(`   Email: ${persona.email}`);
    Logger.log(`   Hora solicitada: ${persona.hora}`);
    Logger.log(`   Patente: ${persona.patente}`);
    
    const cupoDisponible = verificarCupoEstacionamiento(fecha, persona.hora);
    
    if (cupoDisponible) {
      Logger.log(`   ✅ SE PODRÍA ASIGNAR: Cupo ${cupoDisponible}`);
      sePodriaAsignar.push({...persona, cupo: cupoDisponible});
    } else {
      Logger.log(`   ❌ NO HAY CUPO DISPONIBLE para ${persona.hora}`);
    }
    Logger.log("");
  });
  
  Logger.log("════════════════════════════════════════════════════════════════");
  Logger.log(`📊 RESUMEN:`);
  Logger.log(`   Total en fila: ${filaEspera.length}`);
  Logger.log(`   Se podrían asignar: ${sePodriaAsignar.length}`);
  Logger.log(`   Quedarían en fila: ${filaEspera.length - sePodriaAsignar.length}`);
  Logger.log("════════════════════════════════════════════════════════════════\n");
  
  return {
    personasEnFila: filaEspera.length,
    sePodria: sePodriaAsignar
  };
}

/**
 * Ejecuta un diagnóstico completo del sistema
 * 
 * USO: Primera función a ejecutar cuando hay problemas
 */
function diagnosticoCompleto() {
  Logger.log("\n\n");
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║                                                              ║");
  Logger.log("║          🔍 DIAGNÓSTICO COMPLETO DEL SISTEMA 🔍              ║");
  Logger.log("║                                                              ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝");
  Logger.log(`⏰ Fecha/Hora: ${new Date().toString()}\n\n`);
  
  const resultados = {};
  
  // 1. Configuración
  try {
    resultados.configuracion = diagnosticarConfiguracion();
  } catch (error) {
    Logger.log(`❌ Error en diagnóstico de configuración: ${error}\n\n`);
  }
  
  // 2. Triggers
  try {
    resultados.triggers = diagnosticarTriggers();
  } catch (error) {
    Logger.log(`❌ Error en diagnóstico de triggers: ${error}\n\n`);
  }
  
  // 3. Filas de espera
  try {
    resultados.filas = diagnosticarFilasEspera();
  } catch (error) {
    Logger.log(`❌ Error en diagnóstico de filas: ${error}\n\n`);
  }
  
  // Resumen final
  Logger.log("\n\n");
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║                    RESUMEN EJECUTIVO                         ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");
  
  if (resultados.configuracion && resultados.configuracion.faltantes.length > 0) {
    Logger.log("❌ PROBLEMA: Faltan propiedades de configuración");
  } else {
    Logger.log("✅ Configuración: OK");
  }
  
  if (resultados.triggers) {
    const tieneFormSubmit = resultados.triggers.porTipo.formSubmit.length > 0;
    const tieneAutomatico = resultados.triggers.porTipo.timeBased.length > 0;
    
    if (!tieneFormSubmit) {
      Logger.log("❌ PROBLEMA: No hay trigger para formularios");
    } else {
      Logger.log("✅ Trigger de formularios: OK");
    }
    
    if (!tieneAutomatico) {
      Logger.log("⚠️  ADVERTENCIA: No hay trigger automático para filas");
      Logger.log("   → Las filas solo se procesan en cancelaciones");
    } else {
      Logger.log("✅ Trigger automático: OK");
    }
  }
  
  if (resultados.filas && resultados.filas.total > 0) {
    Logger.log(`ℹ️  Hay ${resultados.filas.total} persona(s) en fila de espera`);
    Logger.log("   → Ejecuta: procesarTodasLasFilasAhora() para procesar");
  } else {
    Logger.log("✅ No hay personas en fila de espera");
  }
  
  Logger.log("\n════════════════════════════════════════════════════════════════\n\n");
  
  return resultados;
}

// ============================================================================
// 📚 FUNCIONES DE UTILIDAD
// ============================================================================

/**
 * Convierte string de fecha a objeto Date
 */
function stringToDate(fecha) {
  if (fecha instanceof Date) return fecha;
  
  const parts = fecha.split("/");
  return new Date(+parts[2], parts[1] - 1, +parts[0]);
}

/**
 * Limpia filas antiguas (personas con fechas pasadas)
 * 
 * USO: Ejecutar cuando hay personas en fila con fechas muy antiguas
 */
function limpiarFilasAntiguas() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║           LIMPIEZA DE FILAS ANTIGUAS                        ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  const spreadsheetFila = obtenerHojaPrincipal().getSheetByName('Fila_Espera');
  const lastRow = spreadsheetFila.getLastRow();
  const numRows = lastRow > 1 ? lastRow - 1 : 0;

  if (numRows === 0) {
    Logger.log("✅ No hay filas antiguas para eliminar");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return {eliminados: 0};
  }

  const datos = spreadsheetFila.getRange(2, 1, numRows, 7).getValues();
  
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0); // Ignorar hora
  
  let eliminados = 0;
  const aEliminar = [];
  
  Logger.log(`📅 Fecha actual: ${formattedDate(hoy)}\n`);
  
  // Recorrer de abajo hacia arriba para no afectar índices
  for (let i = datos.length - 1; i >= 0; i--) {
    if (datos[i][0] === "") continue; // Fila vacía
    
    const id = datos[i][0];
    const nombre = datos[i][1];
    const fechaCelda = datos[i][3];
    
    // Convertir fecha
    let fechaReserva;
    if (fechaCelda instanceof Date) {
      fechaReserva = fechaCelda;
    } else {
      try {
        fechaReserva = stringToDate(fechaCelda);
      } catch (error) {
        Logger.log(`⚠️  Fila ${i + 2}: Error al parsear fecha "${fechaCelda}" - Se eliminará`);
        aEliminar.push({fila: i + 2, nombre: nombre, fecha: fechaCelda, razon: "Fecha inválida"});
        continue;
      }
    }
    
    fechaReserva.setHours(0, 0, 0, 0);
    
    // Si la fecha ya pasó
    if (fechaReserva < hoy) {
      const diasPasados = Math.floor((hoy - fechaReserva) / (1000 * 60 * 60 * 24));
      Logger.log(`🗑️  Fila ${i + 2}: ${nombre} - Fecha: ${formattedDate(fechaReserva)} (hace ${diasPasados} días)`);
      aEliminar.push({
        fila: i + 2, 
        nombre: nombre, 
        fecha: formattedDate(fechaReserva), 
        razon: `Fecha pasada (hace ${diasPasados} días)`
      });
    }
  }
  
  Logger.log("");
  
  if (aEliminar.length === 0) {
    Logger.log("✅ No hay filas antiguas para eliminar");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return {eliminados: 0};
  }
  
  Logger.log(`📋 Se encontraron ${aEliminar.length} fila(s) antigua(s)\n`);
  Logger.log("¿Deseas eliminarlas? Ejecuta: confirmarLimpiezaFilas()\n");
  
  // Guardar en propiedades para confirmar
  PropertiesService.getScriptProperties().setProperty(
    'filas_a_eliminar', 
    JSON.stringify(aEliminar)
  );
  
  Logger.log("════════════════════════════════════════════════════════════════\n");
  
  return {
    encontrados: aEliminar.length,
    filas: aEliminar
  };
}

/**
 * Elimina TODAS las filas de espera (emergencia)
 * 
 * USO: Cuando la hoja está corrupta y necesitas empezar de cero
 */
function vaciarFilaEsperaCompleta() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║      ⚠️  VACIAR TODA LA FILA DE ESPERA (EMERGENCIA)        ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  const spreadsheetFila = obtenerHojaPrincipal().getSheetByName('Fila_Espera');
  const lastRow = spreadsheetFila.getLastRow();
  const numRows = lastRow > 1 ? lastRow - 1 : 0;

  if (numRows === 0) {
    Logger.log("ℹ️ La fila ya está vacía");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return {filas: 0};
  }

  const datos = spreadsheetFila.getRange(2, 1, numRows, 7).getValues();
  const filasConDatos = datos.filter(row => row[0] !== "").length;
  
  Logger.log(`⚠️  ADVERTENCIA: Esto eliminará ${filasConDatos} persona(s) de la fila\n`);
  Logger.log("💡 Si estás seguro, ejecuta: confirmarVaciarFilaCompleta()\n");
  
  // Guardar en propiedades
  PropertiesService.getScriptProperties().setProperty('confirmar_vaciar_fila', 'true');
  
  Logger.log("════════════════════════════════════════════════════════════════\n");
  
  return {filas: filasConDatos};
}

/**
 * Confirma el vaciado de la fila completa
 */
function confirmarVaciarFilaCompleta() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║        EJECUTANDO VACIADO COMPLETO DE FILA                  ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");
  
  const confirmar = PropertiesService.getScriptProperties().getProperty('confirmar_vaciar_fila');

  if (confirmar !== 'true') {
    Logger.log("⚠️  Primero ejecuta: vaciarFilaEsperaCompleta()");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return {eliminados: 0};
  }

  const spreadsheetFila = obtenerHojaPrincipal().getSheetByName('Fila_Espera');
  const lastRow = spreadsheetFila.getLastRow();
  const numRows = lastRow > 1 ? lastRow - 1 : 0;

  if (numRows === 0) {
    Logger.log("ℹ️ La fila ya está vacía");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    PropertiesService.getScriptProperties().deleteProperty('confirmar_vaciar_fila');
    return {eliminados: 0};
  }

  const datos = spreadsheetFila.getRange(2, 1, numRows, 7).getValues();
  
  let eliminados = 0;
  
  // Eliminar de abajo hacia arriba
  for (let i = datos.length - 1; i >= 0; i--) {
    if (datos[i][0] !== "") {
      spreadsheetFila.deleteRow(i + 2); // +2 porque empezamos en fila 2
      eliminados++;
    }
  }
  
  // Limpiar propiedad
  PropertiesService.getScriptProperties().deleteProperty('confirmar_vaciar_fila');
  
  Logger.log(`✅ Se eliminaron ${eliminados} fila(s)`);
  Logger.log(`✅ La hoja Fila_Espera está ahora vacía`);
  Logger.log("════════════════════════════════════════════════════════════════\n");
  
  return {eliminados: eliminados};
}

/**
 * Confirma y ejecuta la limpieza de filas antiguas
 * 
 * USO: Ejecutar DESPUÉS de limpiarFilasAntiguas() para confirmar
 */
function confirmarLimpiezaFilas() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║        CONFIRMANDO LIMPIEZA DE FILAS ANTIGUAS                ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");
  
  const filasStr = PropertiesService.getScriptProperties().getProperty('filas_a_eliminar');
  
  if (!filasStr) {
    Logger.log("⚠️  No hay filas marcadas para eliminar");
    Logger.log("   Ejecuta primero: limpiarFilasAntiguas()");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return {eliminados: 0};
  }
  
  const aEliminar = JSON.parse(filasStr);
  
  Logger.log(`🗑️  Eliminando ${aEliminar.length} fila(s)...\n`);
  
  const spreadsheetFila = obtenerHojaPrincipal().getSheetByName('Fila_Espera');
  let eliminados = 0;
  
  // Ordenar de mayor a menor para no afectar índices
  aEliminar.sort((a, b) => b.fila - a.fila);
  
  aEliminar.forEach(item => {
    try {
      Logger.log(`   Eliminando fila ${item.fila}: ${item.nombre} (${item.fecha})`);
      spreadsheetFila.deleteRow(item.fila);
      eliminados++;
    } catch (error) {
      Logger.log(`   ❌ Error eliminando fila ${item.fila}: ${error}`);
    }
  });
  
  // Limpiar propiedad
  PropertiesService.getScriptProperties().deleteProperty('filas_a_eliminar');
  
  Logger.log("");
  Logger.log(`✅ Se eliminaron ${eliminados} fila(s) antigua(s)`);
  Logger.log("════════════════════════════════════════════════════════════════\n");
  
  return {eliminados: eliminados};
}
