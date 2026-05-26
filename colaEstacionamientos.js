/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SISTEMA DE COLA LOCK-FREE PARA PROCESAMIENTO DE ESTACIONAMIENTOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Arquitectura LOCK-FREE (Append-Only):
 * - Cada operación escribe a una clave ÚNICA → No hay Read-Modify-Write
 * - Claves: queue_<timestamp>_<random> → Garantiza unicidad
 * - encolarOperacion() NO necesita lock → ~30-50ms, nunca se bloquea
 * - procesarColaPrincipal() SÍ tiene lock → Previene procesadores concurrentes
 * - FIFO garantizado por ordenamiento de timestamp
 *
 * Ventajas:
 * ✅ Usuarios nunca se bloquean al encolar (verdadero lock-free)
 * ✅ No hay race conditions en encolamiento
 * ✅ Respuesta inmediata (< 50ms) incluso si procesador está ejecutando
 * ✅ Escalable a cientos de usuarios concurrentes
 *
 * Uso:
 * 1. Encolar operaciones: encolarOperacion(tipo, datos) → Lock-free
 * 2. Sistema crea triggers on-demand automáticamente
 * 3. Procesador ejecuta 3 minutos después, procesa TODO
 *
 * Fecha: 18/12/2024 - Migración a arquitectura lock-free
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

var QUEUE_CONFIG = {
  PROPERTY_KEY_PREFIX: 'queue_',  // Prefijo para claves únicas (lock-free)
  ON_DEMAND_DELAY_MINUTES: 2,     // Procesar 2 minutos después de encolar
  MAX_QUEUE_SIZE: 1000,            // Máximo de operaciones en cola
  MAX_PROCESSING_TIME_MS: 270000,  // 4.5 minutos (antes del timeout de 5min)
  MAX_RETRIES: 3                   // Máximo de reintentos antes de descartar una operación
};

var OPERATION_TYPE = {
  PROCESAR_FILA: 'PROCESAR_FILA',
  PROCESAR_TODAS_FILAS: 'PROCESAR_TODAS_FILAS',
  ASIGNAR_CUPO: 'ASIGNAR_CUPO',
  CANCELAR_RESERVA: 'CANCELAR_RESERVA'
};

// ============================================================================
// TRIGGERS ON-DEMAND - HELPERS (Nuevo)
// ============================================================================

/**
 * Programa un trigger on-demand usando un reloj interno para evitar bloqueos
 */
function programarProcesamientoOnDemand() {
  try {
    const scriptProps = PropertiesService.getScriptProperties();
    const now = Date.now();
    const delayMs = QUEUE_CONFIG.ON_DEMAND_DELAY_MINUTES * 60 * 1000;
    const targetTimeStr = scriptProps.getProperty('cola_target_time');

    // 1. Verificamos si hay un motor programado que aún esté "vivo"
    if (targetTimeStr) {
      const targetTime = parseInt(targetTimeStr);
      // Le damos un margen de 3 minutos extra por si los servidores de Google se demoran
      if (targetTime > now - 180000) {
        Logger.log('ℹ️ Ya existe un motor válido programado, no se crea otro');
        return { success: true, created: false, reason: 'trigger_exists' };
      }
    }

    // 2. Si llegamos aquí, cualquier trigger existente es un Zombie Inhabilitado. Lo matamos.
    limpiarTriggersProcesamientoCompletados();

    // 3. Creamos el nuevo motor limpio
    ScriptApp.newTrigger('procesarColaPrincipal')
      .timeBased()
      .after(delayMs)
      .create();

    // 4. Guardamos la hora exacta en la que debería arrancar
    scriptProps.setProperty('cola_target_time', (now + delayMs).toString());

    Logger.log(`✓ Motor creado: procesará cola en ${QUEUE_CONFIG.ON_DEMAND_DELAY_MINUTES} minutos`);
    return { success: true, created: true, delayMinutes: QUEUE_CONFIG.ON_DEMAND_DELAY_MINUTES };

  } catch (error) {
    Logger.log(`❌ Error al crear motor: ${error}`);
    return { success: false, error: error.toString() };
  }
}

/**
 * Elimina todos los motores viejos o inhabilitados
 */
function limpiarTriggersProcesamientoCompletados() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    let eliminados = 0;

    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'procesarColaPrincipal' &&
          trigger.getTriggerSource() === ScriptApp.TriggerSource.CLOCK) {
        ScriptApp.deleteTrigger(trigger);
        eliminados++;
      }
    });

    if (eliminados > 0) {
      Logger.log(`🗑️ ${eliminados} motor(es) zombie limpiado(s)`);
    }
    return eliminados;
  } catch (error) {
    Logger.log(`⚠️ Error al limpiar motores: ${error}`);
    return 0;
  }
}

// ============================================================================
// API PÚBLICA - ENCOLAR OPERACIONES
// ============================================================================

/**
 * Encola una operación para ser procesada (LOCK-FREE)
 *
 * ARQUITECTURA LOCK-FREE:
 * - NO lee cola existente (no Read-Modify-Write)
 * - Escribe DIRECTAMENTE a clave única
 * - Cada operación = 1 property con clave única
 * - NO necesita lock = Nunca se bloquea
 * - Tiempo: ~30-50ms (constante, no importa si procesador ejecutando)
 *
 * @param {string} tipo - Tipo de operación (OPERATION_TYPE)
 * @param {Object} datos - Datos específicos de la operación
 * @param {string} source - Origen de la petición (opcional)
 * @returns {Object} ID de la petición encolada
 */
function encolarOperacion(tipo, datos, source = 'desconocido') {
  try {
    // Generar clave única: queue_<timestamp>_<random>
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11); // 9 caracteres random
    const uniqueKey = `${QUEUE_CONFIG.PROPERTY_KEY_PREFIX}${timestamp}_${random}`;

    // Crear operación
    const operacion = {
      id: uniqueKey,         // Usar la clave como ID
      type: tipo,
      data: datos,
      timestamp: timestamp,  // Para ordenamiento FIFO
      source: source,
      enqueueTime: new Date(timestamp).toISOString() // Para debugging
    };

    // ✅ LOCK-FREE: Escribir directamente a clave única
    // NO hay Read-Modify-Write = NO hay race condition
    const scriptProps = PropertiesService.getScriptProperties();
    scriptProps.setProperty(uniqueKey, JSON.stringify(operacion));

    Logger.log(`✓ Operación encolada (lock-free): ${tipo}`);
    Logger.log(`  → ID: ${uniqueKey}`);

    // Verificar límite de tamaño (solo para warning, no bloquea)
    try {
      const allKeys = scriptProps.getKeys();
      const queueKeys = allKeys.filter(k => k.startsWith(QUEUE_CONFIG.PROPERTY_KEY_PREFIX));
      const queueSize = queueKeys.length;

      if (queueSize >= QUEUE_CONFIG.MAX_QUEUE_SIZE) {
        Logger.log(`⚠️ Cola grande (${queueSize} operaciones) - Considerar procesar manualmente`);
      }

      // Programar procesamiento on-demand
      // Solo crea trigger si no existe uno ya programado
      const triggerResult = programarProcesamientoOnDemand();
      if (triggerResult.created) {
        Logger.log(`  → Procesamiento programado para ${triggerResult.delayMinutes} min`);
      } else if (triggerResult.reason === 'trigger_exists') {
        Logger.log(`  → Trigger ya existe, será procesada junto con las demás`);
      }

      return {
        success: true,
        requestId: uniqueKey,
        positionInQueue: queueSize  // Aproximado, no crítico
      };

    } catch (error) {
      // Si falla obtener size/crear trigger, no es crítico
      Logger.log(`  ⚠️ Warning al verificar cola: ${error}`);
      return {
        success: true,
        requestId: uniqueKey,
        positionInQueue: -1  // Desconocido pero encolado exitosamente
      };
    }

  } catch (error) {
    Logger.log(`❌ Error al encolar: ${error}`);
    return { success: false, error: error.toString() };
  }
}

/**
 * Atajos para encolar operaciones comunes
 */
function encolarProcesamientoFila(fecha, source = 'cancelacion') {
  return encolarOperacion(OPERATION_TYPE.PROCESAR_FILA, { fecha: fecha }, source);
}

function encolarProcesamientoTodasFilas(source = 'trigger_automatico') {
  return encolarOperacion(OPERATION_TYPE.PROCESAR_TODAS_FILAS, {}, source);
}

function encolarAsignacionCupo(idPersona, fecha, hora, source = 'reserva_nueva') {
  return encolarOperacion(OPERATION_TYPE.ASIGNAR_CUPO, {
    id: idPersona,
    fecha: fecha,
    hora: hora
  }, source);
}

function encolarCancelacion(idReserva, source = 'cancelacion_manual') {
  return encolarOperacion(OPERATION_TYPE.CANCELAR_RESERVA, {
    id: idReserva
  }, source);
}

// ============================================================================
// PROCESADOR DE COLA (ejecutado por trigger)
// ============================================================================

/**
 * Procesa la cola de operaciones (con LOCK para prevenir procesadores concurrentes)
 *
 * ARQUITECTURA:
 * - Lee TODAS las claves que empiezan con 'queue_'
 * - Ordena por timestamp (FIFO)
 * - Procesa cada operación
 * - Elimina la clave después de procesar
 *
 * LOCK:
 * - SÍ usa lock (previene que 2 procesadores ejecuten simultáneamente)
 * - Pero NO afecta a usuarios encolando (ellos escriben a claves únicas sin lock)
 * - Lock solo previene: procesador vs procesador (que es lo que queremos)
 *
 * IMPORTANTE: Esta es la ÚNICA función que modifica sheets
 */
function procesarColaPrincipal() {
  var lock = LockService.getDocumentLock();
  var lockAcquired = false;

  try {
    // Intentar adquirir lock con timeout corto
    // Si no puede, significa que ya hay otro procesador ejecutando
    if (!lock.tryLock(5000)) {
      Logger.log("ℹ️ Ya hay un procesador ejecutando, saltando esta ejecución");
      return { skipped: true, reason: 'Lock no disponible - otro procesador activo' };
    }

    lockAcquired = true;

    Logger.log("╔══════════════════════════════════════════════════════════════╗");
    Logger.log("║     🔄 PROCESADOR DE COLA LOCK-FREE - INICIO                ║");
    Logger.log("╚══════════════════════════════════════════════════════════════╝");
    Logger.log(`⏰ ${new Date().toISOString()}\n`);

    const inicioTotal = Date.now();
    const scriptProps = PropertiesService.getScriptProperties();

    // LOCK-FREE: Leer TODAS las claves que empiezan con 'queue_' (1 Sola llamada a la API = ¡Rápido!)
    const allProps = scriptProps.getProperties();
    const queueKeys = Object.keys(allProps).filter(k => k.startsWith(QUEUE_CONFIG.PROPERTY_KEY_PREFIX));

    if (queueKeys.length === 0) {
      Logger.log("✅ Cola vacía, nada que procesar");
      Logger.log("════════════════════════════════════════════════════════════════\n");
      return { processed: 0, errors: 0, pending: 0 };
    }

    Logger.log(`📋 Operaciones en cola: ${queueKeys.length}\n`);

    // Leer todas las operaciones (Ya están en memoria)
    const operaciones = [];
    queueKeys.forEach(key => {
      try {
        const operacionJSON = allProps[key];
        if (operacionJSON) {
          const operacion = JSON.parse(operacionJSON);
          operaciones.push(operacion);
        }
      } catch (error) {
        Logger.log(`⚠️ Error procesando ${key}: ${error}`);
      }
    });

    // Ordenar por timestamp (FIFO)
    operaciones.sort((a, b) => a.timestamp - b.timestamp);

    Logger.log(`✓ Operaciones ordenadas por timestamp (FIFO)\n`);

    let procesadas = 0;
    let errores = 0;
    const resultados = [];

    // Procesar cada operación en orden FIFO
    for (let i = 0; i < operaciones.length; i++) {
      // Verificar timeout
      if (Date.now() - inicioTotal > QUEUE_CONFIG.MAX_PROCESSING_TIME_MS) {
        const pendientes = operaciones.length - i;
        Logger.log(`\n⚠️ Timeout alcanzado, dejando ${pendientes} operaciones para próxima ejecución`);
        break;
      }

      const operacion = operaciones[i];

      Logger.log(`\n${'─'.repeat(64)}`);
      Logger.log(`📌 Procesando: ${operacion.type} (${i + 1}/${operaciones.length})`);
      Logger.log(`   ID: ${operacion.id}`);
      Logger.log(`   Origen: ${operacion.source}`);
      Logger.log(`   Encolada: ${operacion.enqueueTime || 'N/A'}`);

      try {
        const inicio = Date.now();
        const resultado = ejecutarOperacion(operacion);
        const tiempo = Date.now() - inicio;

        if (resultado.success) {
          Logger.log(`   ✅ Exitosa (${tiempo}ms)`);
          procesadas++;

          // ✅ ELIMINAR operación procesada exitosamente
          scriptProps.deleteProperty(operacion.id);

        } else {
          const motivo = resultado.error || resultado.message || 'Error desconocido';
          const reintentos = (operacion.retryCount || 0) + 1;
          Logger.log(`   ❌ Falló: ${motivo} (intento ${reintentos}/${QUEUE_CONFIG.MAX_RETRIES})`);
          errores++;

          if (reintentos >= QUEUE_CONFIG.MAX_RETRIES) {
            Logger.log(`   🗑️ Máximo de reintentos alcanzado, descartando operación`);
            scriptProps.deleteProperty(operacion.id);
          } else {
            // Actualizar contador de reintentos en la operación
            operacion.retryCount = reintentos;
            operacion.lastError = motivo;
            scriptProps.setProperty(operacion.id, JSON.stringify(operacion));
          }
        }

        resultados.push({
          id: operacion.id,
          type: operacion.type,
          success: resultado.success,
          time: tiempo
        });

      } catch (error) {
        const reintentos = (operacion.retryCount || 0) + 1;
        Logger.log(`   ❌ Excepción: ${error.toString()} (intento ${reintentos}/${QUEUE_CONFIG.MAX_RETRIES})`);
        errores++;

        resultados.push({
          id: operacion.id,
          type: operacion.type,
          success: false,
          error: error.toString()
        });

        if (reintentos >= QUEUE_CONFIG.MAX_RETRIES) {
          Logger.log(`   🗑️ Máximo de reintentos alcanzado, descartando operación`);
          scriptProps.deleteProperty(operacion.id);
        } else {
          operacion.retryCount = reintentos;
          operacion.lastError = error.toString();
          scriptProps.setProperty(operacion.id, JSON.stringify(operacion));
        }
      }
    }

    // Contar operaciones pendientes (las que quedaron en propiedades)
    const keysRestantes = scriptProps.getKeys().filter(k => k.startsWith(QUEUE_CONFIG.PROPERTY_KEY_PREFIX));
    const pendientes = keysRestantes.length;

    const tiempoTotal = Date.now() - inicioTotal;

    Logger.log("\n╔══════════════════════════════════════════════════════════════╗");
    Logger.log("║              RESUMEN DE PROCESAMIENTO LOCK-FREE              ║");
    Logger.log("╚══════════════════════════════════════════════════════════════╝");
    Logger.log(`✅ Procesadas: ${procesadas}`);
    Logger.log(`❌ Errores: ${errores}`);
    Logger.log(`⏱️  Tiempo total: ${tiempoTotal}ms`);
    Logger.log(`📊 Pendientes: ${pendientes}`);
    Logger.log("════════════════════════════════════════════════════════════════\n");

    return {
      processed: procesadas,
      errors: errores,
      pending: pendientes,
      time: tiempoTotal
    };

  } catch (error) {
    Logger.log(`\n❌ ERROR CRÍTICO EN PROCESADOR: ${error}`);
    Logger.log(`Stack: ${error.stack}`);
    throw error;

  } finally {
    if (lockAcquired) {
      lock.releaseLock();

      // ✨ NUEVO: Reiniciamos el reloj interno para permitir nuevos motores
      PropertiesService.getScriptProperties().deleteProperty('cola_target_time');

      // Limpiar triggers on-demand completados
      try {
        limpiarTriggersProcesamientoCompletados();
      } catch (cleanupError) {
        Logger.log(`⚠️ Error al limpiar triggers: ${cleanupError}`);
      }

      // Re-verificar si quedaron operaciones pendientes (encoladas durante el procesamiento)
      try {
        const scriptProps = PropertiesService.getScriptProperties();
        const keysRestantes = scriptProps.getKeys().filter(k => k.startsWith(QUEUE_CONFIG.PROPERTY_KEY_PREFIX));
        if (keysRestantes.length > 0) {
          Logger.log(`📋 Quedan ${keysRestantes.length} operación(es) pendiente(s), reprogramando procesamiento...`);
          programarProcesamientoOnDemand();
        }
      } catch (recheckError) {
        Logger.log(`⚠️ Error al re-verificar cola pendiente: ${recheckError}`);
      }
    }
  }
}

/**
 * Ejecuta una operación específica
 * @param {Object} operacion - La operación a ejecutar
 * @returns {Object} Resultado de la operación
 */
function ejecutarOperacion(operacion) {
  switch (operacion.type) {
    case OPERATION_TYPE.PROCESAR_FILA:
      return ejecutarProcesamientoFila(operacion.data);

    case OPERATION_TYPE.PROCESAR_TODAS_FILAS:
      return ejecutarProcesamientoTodasFilas();

    case OPERATION_TYPE.ASIGNAR_CUPO:
      return ejecutarAsignacionCupo(operacion.data);

    case OPERATION_TYPE.CANCELAR_RESERVA:
      return ejecutarCancelacion(operacion.data);

    default:
      return { success: false, error: `Tipo de operación desconocido: ${operacion.type}` };
  }
}

/**
 * Implementaciones de operaciones
 */
function ejecutarProcesamientoFila(data) {
  try {
    procesarFila(data.fecha);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function ejecutarProcesamientoTodasFilas() {
  try {
    // Obtener todas las fechas únicas de la fila
    const spreadsheetFila = obtenerHojaPrincipal().getSheetByName('Fila_Espera');
    const lastRow = spreadsheetFila.getLastRow();
    const numRows = lastRow > 1 ? lastRow - 1 : 0;

    if (numRows === 0) {
      return { success: true, fechasProcesadas: 0 };
    }

    const todasLasFechas = spreadsheetFila.getRange(2, 4, numRows, 1)
      .getValues()
      .flat()
      .filter(fecha => fecha !== "")
      .map(fecha => fecha instanceof Date ? formattedDate(fecha) : fecha);

    const fechasUnicas = [...new Set(todasLasFechas)];

    let procesadas = 0;
    fechasUnicas.forEach(fecha => {
      try {
        procesarFila(fecha);
        procesadas++;
      } catch (error) {
        Logger.log(`Error procesando fecha ${fecha}: ${error}`);
      }
    });

    // Actualizar cupos disponibles
    try {
      actualizarCuposDisponibles();
    } catch (error) {
      Logger.log(`Error actualizando cupos: ${error}`);
    }

    return { success: true, fechasProcesadas: procesadas };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function ejecutarAsignacionCupo(data) {
  try {
    asignarEstacionamiento(data.id);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function ejecutarCancelacion(data) {
  try {
    const resultado = cancelarReservaInterno(data.id);
    return resultado;
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ============================================================================
// INSTALACIÓN Y CONFIGURACIÓN
// ============================================================================

/**
 * DEPRECADO: Esta función ya no es necesaria
 *
 * El sistema ahora usa TRIGGERS ON-DEMAND en lugar de triggers periódicos.
 * Los triggers se crean automáticamente cuando se encolan operaciones.
 *
 * Esta función solo sirve para LIMPIAR triggers periódicos antiguos si existen.
 */
function instalarProcesadorCola() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║      ℹ️  SISTEMA ON-DEMAND ACTIVO                           ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  Logger.log("⚠️  NOTA: Esta función está DEPRECADA\n");
  Logger.log("El sistema ahora usa TRIGGERS ON-DEMAND:");
  Logger.log("  • Triggers se crean automáticamente al encolar operaciones");
  Logger.log("  • Se ejecutan 3 minutos después de encolar");
  Logger.log("  • Se auto-eliminan después de procesar");
  Logger.log("  • Cero desperdicio de recursos\n");

  // Limpiar triggers periódicos antiguos si existen
  const triggers = ScriptApp.getProjectTriggers();
  let eliminados = 0;

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'procesarColaPrincipal' &&
        trigger.getTriggerSource() === ScriptApp.TriggerSource.CLOCK) {
      // Solo eliminar si es periódico (no one-time)
      try {
        const triggerSourceString = trigger.getTriggerSource().toString();
        Logger.log(`🗑️ Limpiando trigger antiguo: ${trigger.getUniqueId()}`);
        ScriptApp.deleteTrigger(trigger);
        eliminados++;
      } catch (e) {
        // Continuar con el siguiente
      }
    }
  });

  if (eliminados > 0) {
    Logger.log(`✓ ${eliminados} trigger(s) periódico(s) antiguo(s) eliminado(s)\n`);
  } else {
    Logger.log("✓ No hay triggers periódicos antiguos que limpiar\n");
  }

  Logger.log("💡 Cómo funciona el sistema ON-DEMAND:");
  Logger.log("   1. Usuario envía formulario → Operación encolada (< 1 seg)");
  Logger.log("   2. Sistema crea trigger para 3 minutos después");
  Logger.log("   3. Trigger ejecuta → Procesa TODA la cola");
  Logger.log("   4. Trigger se auto-elimina\n");
  Logger.log("🔍 Para verificar:");
  Logger.log("   verEstadoCola()              - Ver operaciones en cola");
  Logger.log("   procesarColaAhora()          - Procesar manualmente");
  Logger.log("   verTriggersDelSistemaCola()  - Ver triggers activos\n");
  Logger.log("════════════════════════════════════════════════════════════════\n");

  return { success: true, cleaned: eliminados, mode: 'on-demand' };
}

/**
 * Desinstala el procesador
 */
function desinstalarProcesadorCola() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║         DESINSTALANDO PROCESADOR DE COLA                    ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  const triggers = ScriptApp.getProjectTriggers();
  let eliminados = 0;

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'procesarColaPrincipal') {
      Logger.log(`🗑️ Eliminando: ${trigger.getUniqueId()}`);
      ScriptApp.deleteTrigger(trigger);
      eliminados++;
    }
  });

  if (eliminados > 0) {
    Logger.log(`\n✅ ${eliminados} trigger(s) eliminado(s)`);
  } else {
    Logger.log(`\nℹ️ No se encontraron triggers de procesador de cola`);
  }

  Logger.log("\n⚠️ Nota: La cola actual NO se ha vaciado");
  Logger.log("   Para vaciarla ejecuta: vaciarCola()\n");
  Logger.log("════════════════════════════════════════════════════════════════\n");

  return { success: true, eliminados: eliminados };
}

// ============================================================================
// TRIGGER AUTOMÁTICO DIARIO (FALLBACK)
// ============================================================================

/**
 * Instala un trigger que encola el procesamiento de todas las filas una vez al día
 * Actúa como FALLBACK para detectar y corregir inconsistencias
 *
 * NOTA: Esto es ADICIONAL al procesador de cola
 * - Procesador de cola: Ejecuta lo que está en cola (cada 5 min)
 * - Trigger diario: Encola procesamiento de todas las filas (1x día a las 6 AM)
 *
 * El procesamiento normal se hace vía cancelaciones (procesa fecha específica)
 * Este trigger diario es solo un fallback de seguridad
 */
function instalarTriggerProcesamientoHorario() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║    INSTALANDO TRIGGER DE PROCESAMIENTO DIARIO (FALLBACK)    ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Eliminar trigger antiguo si existe
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'encolarProcesamientoAutomaticoHorario') {
      Logger.log(`🗑️ Eliminando trigger existente: ${trigger.getUniqueId()}`);
      ScriptApp.deleteTrigger(trigger);
    }
  });

  try {
    ScriptApp.newTrigger('encolarProcesamientoAutomaticoHorario')
      .timeBased()
      .atHour(6)  // 6 AM
      .everyDays(1)  // Cada día
      .create();

    Logger.log(`✅ Trigger diario instalado exitosamente\n`);
    Logger.log(`⏰ Frecuencia: Una vez al día a las 6:00 AM`);
    Logger.log(`📋 Acción: Encola procesamiento de TODAS las filas`);
    Logger.log(`\n💡 Propósito: FALLBACK de seguridad`);
    Logger.log(`   - Procesamiento normal: vía cancelaciones (cada 5 min)`);
    Logger.log(`   - Este trigger: detecta inconsistencias (1x día)\n`);
    Logger.log("════════════════════════════════════════════════════════════════\n");

    return { success: true };

  } catch (error) {
    Logger.log(`❌ Error al instalar: ${error}`);
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return { success: false, error: error.toString() };
  }
}

/**
 * Función ejecutada por el trigger diario (6 AM)
 *
 * PROCESO:
 * 1. Limpia fechas pasadas de Fila_Espera (previene acumulación de basura)
 * 2. Encola procesamiento de todas las filas restantes (fallback)
 */
function encolarProcesamientoAutomaticoHorario() {
  var lock = LockService.getDocumentLock();
  try {
    lock.waitLock(60000); // Adquirir el bloqueo antes de las operaciones en la hoja

    Logger.log("╔══════════════════════════════════════════════════════════════╗");
    Logger.log("║     ⏰ TRIGGER DIARIO (6 AM) - FALLBACK Y LIMPIEZA          ║");
    Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

    // 1. LIMPIEZA: Eliminar registros con fechas pasadas
    Logger.log("1️⃣ Limpiando registros con fechas pasadas de Fila_Espera...");
    let resultadoLimpieza = null;
    try {
      resultadoLimpieza = limpiarFechasPasadas();
      Logger.log(`   ✅ Limpieza completada: ${resultadoLimpieza.eliminados} registro(s) eliminado(s)\n`);
    } catch (error) {
      Logger.log(`   ⚠️ Error en limpieza (no crítico): ${error}\n`);
      resultadoLimpieza = { eliminados: 0 };
      // Continuar aunque falle la limpieza
    }

    // 2. ACTUALIZAR CUPOS: Actualizar ventana de 30 días directamente (sin depender de la cola)
    Logger.log("2️⃣ Actualizando cupos disponibles (ventana 30 días)...");
    try {
      actualizarCuposDisponibles();
      Logger.log(`   ✅ Cupos actualizados\n`);
    } catch (error) {
      Logger.log(`   ⚠️ Error al actualizar cupos (no crítico): ${error}\n`);
    }

    // 3. PROCESAMIENTO: Encolar procesamiento de todas las filas (solo válidas)
    Logger.log("3️⃣ Encolando procesamiento de todas las filas...");
    const resultado = encolarProcesamientoTodasFilas('trigger_diario_6am');
    Logger.log(`   ✅ Encolado: ${resultado.requestId} (Posición: ${resultado.positionInQueue})\n`);

    Logger.log("════════════════════════════════════════════════════════════════\n");

    return {
      limpieza: resultadoLimpieza || { eliminados: 0 },
      actualizacionCupos: true,
      procesamiento: resultado
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Desinstala el trigger diario (6 AM)
 */
function desinstalarTriggerProcesamientoHorario() {
  Logger.log("Desinstalando trigger diario (6 AM)...\n");

  const triggers = ScriptApp.getProjectTriggers();
  let eliminados = 0;

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'encolarProcesamientoAutomaticoHorario') {
      ScriptApp.deleteTrigger(trigger);
      eliminados++;
    }
  });

  Logger.log(`✅ ${eliminados} trigger(s) eliminado(s)\n`);
  return { success: true, eliminados: eliminados };
}

// ============================================================================
// UTILIDADES Y DIAGNÓSTICO
// ============================================================================

/**
 * Ver estado actual de la cola (LOCK-FREE)
 */
function verEstadoCola() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║            ESTADO DE LA COLA (LOCK-FREE)                    ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  const scriptProps = PropertiesService.getScriptProperties();

  // Leer TODAS las propiedades (1 Sola llamada a la API = ¡Rápido!)
  const allProps = scriptProps.getProperties();
  const queueKeys = Object.keys(allProps).filter(k => k.startsWith(QUEUE_CONFIG.PROPERTY_KEY_PREFIX));

  if (queueKeys.length === 0) {
    Logger.log("✅ Cola vacía");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return { size: 0, operations: [], byType: {} };
  }

  // Leer todas las operaciones (Ya están en memoria)
  const operaciones = [];
  queueKeys.forEach(key => {
    try {
      const operacionJSON = allProps[key];
      if (operacionJSON) {
        const operacion = JSON.parse(operacionJSON);
        operaciones.push(operacion);
      }
    } catch (error) {
      Logger.log(`⚠️ Error parseando ${key}: ${error}`);
    }
  });

  // Ordenar por timestamp (FIFO)
  operaciones.sort((a, b) => a.timestamp - b.timestamp);

  Logger.log(`📊 Operaciones en cola: ${operaciones.length}\n`);

  // Contar por tipo
  const porTipo = {};
  operaciones.forEach(op => {
    porTipo[op.type] = (porTipo[op.type] || 0) + 1;
  });

  Logger.log("Desglose por tipo:");
  Object.keys(porTipo).forEach(tipo => {
    Logger.log(`  ${tipo}: ${porTipo[tipo]}`);
  });

  Logger.log("\nPróximas 5 operaciones (orden FIFO):");
  operaciones.slice(0, 5).forEach((op, index) => {
    const edad = Date.now() - op.timestamp;
    Logger.log(`  ${index + 1}. ${op.type} (${Math.floor(edad/1000)}s en cola)`);
    Logger.log(`     Origen: ${op.source}`);
    Logger.log(`     ID: ${op.id}`);
  });

  if (operaciones.length > 5) {
    Logger.log(`  ... y ${operaciones.length - 5} más`);
  }

  Logger.log("\n════════════════════════════════════════════════════════════════\n");

  return { size: operaciones.length, operations: operaciones, byType: porTipo };
}

/**
 * Limpiar cola (emergencia) - LOCK-FREE
 */
function vaciarCola() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║          ⚠️  VACIANDO COLA COMPLETA (LOCK-FREE)            ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  const scriptProps = PropertiesService.getScriptProperties();

  // Leer todas las claves que empiezan con 'queue_'
  const allKeys = scriptProps.getKeys();
  const queueKeys = allKeys.filter(k => k.startsWith(QUEUE_CONFIG.PROPERTY_KEY_PREFIX));

  if (queueKeys.length === 0) {
    Logger.log("ℹ️ La cola ya estaba vacía");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return { success: true, operacionesEliminadas: 0 };
  }

  Logger.log(`🗑️ Eliminando ${queueKeys.length} operación(es)...\n`);

  // Eliminar todas las claves de la cola
  let eliminadas = 0;
  queueKeys.forEach(key => {
    try {
      scriptProps.deleteProperty(key);
      eliminadas++;
    } catch (error) {
      Logger.log(`⚠️ Error eliminando ${key}: ${error}`);
    }
  });

  Logger.log(`✅ Cola vaciada: ${eliminadas} operación(es) eliminada(s)`);
  Logger.log("════════════════════════════════════════════════════════════════\n");

  return { success: true, operacionesEliminadas: eliminadas };
}

/**
 * Procesar cola manualmente (sin esperar al trigger)
 */
function procesarColaAhora() {
  Logger.log("🚀 Procesando cola manualmente (sin esperar trigger)...\n");
  return procesarColaPrincipal();
}

/**
 * Ver todos los triggers relacionados con el sistema de cola
 */
function verTriggersDelSistemaCola() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║           TRIGGERS DEL SISTEMA DE COLA                       ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  const triggers = ScriptApp.getProjectTriggers();
  const triggersCola = triggers.filter(t =>
    t.getHandlerFunction() === 'procesarColaPrincipal' ||
    t.getHandlerFunction() === 'encolarProcesamientoAutomaticoHorario'
  );

  if (triggersCola.length === 0) {
    Logger.log("❌ NO HAY TRIGGERS INSTALADOS\n");
    Logger.log("Para instalar:");
    Logger.log("  instalarProcesadorCola()              - Procesador (cada 1 min)");
    Logger.log("  instalarTriggerProcesamientoHorario() - Encolador (cada 1 hora)\n");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return { total: 0, triggers: [] };
  }

  Logger.log(`Total de triggers: ${triggersCola.length}\n`);

  triggersCola.forEach((trigger, index) => {
    const func = trigger.getHandlerFunction();
    const tipo = trigger.getEventType().toString();

    Logger.log(`Trigger #${index + 1}:`);
    Logger.log(`  Función: ${func}`);
    Logger.log(`  Tipo: ${tipo}`);
    Logger.log(`  ID: ${trigger.getUniqueId()}`);

    if (func === 'procesarColaPrincipal') {
      Logger.log(`  📋 PROCESADOR - Ejecuta operaciones de la cola`);
    } else if (func === 'encolarProcesamientoAutomaticoHorario') {
      Logger.log(`  ⏰ ENCOLADOR - Encola procesamiento de filas cada hora`);
    }

    Logger.log("");
  });

  // Verificación
  const tieneProcesador = triggersCola.some(t => t.getHandlerFunction() === 'procesarColaPrincipal');
  const tieneEncolador = triggersCola.some(t => t.getHandlerFunction() === 'encolarProcesamientoAutomaticoHorario');

  Logger.log("📋 Estado del sistema:");
  if (tieneProcesador) {
    Logger.log("   ✅ Procesador de cola: INSTALADO");
  } else {
    Logger.log("   ❌ Procesador de cola: NO INSTALADO");
    Logger.log("      → Ejecuta: instalarProcesadorCola()");
  }

  if (tieneEncolador) {
    Logger.log("   ✅ Trigger diario (6 AM): INSTALADO");
    Logger.log("      (FALLBACK para procesar todas las filas 1x día)");
  } else {
    Logger.log("   ⚠️ Trigger diario: NO INSTALADO (opcional)");
    Logger.log("      → Ejecuta: instalarTriggerProcesamientoHorario()");
  }

  Logger.log("\n════════════════════════════════════════════════════════════════\n");

  return { total: triggersCola.length, triggers: triggersCola };
}

/**
 * Diagnóstico completo del sistema de cola
 */
function diagnosticoCompletoCola() {
  Logger.log("\n\n");
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║                                                              ║");
  Logger.log("║       🔍 DIAGNÓSTICO COMPLETO - SISTEMA DE COLA 🔍          ║");
  Logger.log("║                                                              ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝");
  Logger.log(`⏰ ${new Date().toString()}\n\n`);

  const resultados = {};

  // 1. Estado de la cola
  Logger.log("═══ 1. ESTADO DE LA COLA ═══\n");
  try {
    resultados.cola = verEstadoCola();
  } catch (error) {
    Logger.log(`❌ Error: ${error}\n\n`);
  }

  // 2. Triggers instalados
  Logger.log("═══ 2. TRIGGERS DEL SISTEMA ═══\n");
  try {
    resultados.triggers = verTriggersDelSistemaCola();
  } catch (error) {
    Logger.log(`❌ Error: ${error}\n\n`);
  }

  // 3. Resumen ejecutivo
  Logger.log("\n\n");
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║                    RESUMEN EJECUTIVO                         ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  if (resultados.cola) {
    if (resultados.cola.size === 0) {
      Logger.log("✅ Cola vacía - Sistema sin operaciones pendientes");
    } else if (resultados.cola.size < 10) {
      Logger.log(`ℹ️ Cola con ${resultados.cola.size} operación(es) - Normal`);
    } else {
      Logger.log(`⚠️ Cola con ${resultados.cola.size} operaciones - Revisar`);
    }
  }

  if (resultados.triggers) {
    const tieneProcesador = resultados.triggers.triggers.some(t =>
      t.getHandlerFunction() === 'procesarColaPrincipal'
    );

    if (tieneProcesador) {
      Logger.log("✅ Sistema de cola activo y funcionando");
    } else {
      Logger.log("❌ PROBLEMA: Procesador NO instalado");
      Logger.log("   → Las operaciones se encolan pero NO se procesan");
      Logger.log("   → Ejecuta: instalarProcesadorCola()");
    }
  }

  Logger.log("\n════════════════════════════════════════════════════════════════\n\n");

  return resultados;
}

// ============================================================================
// MIGRACIÓN Y VERIFICACIÓN (Sistema Lock-Free)
// ============================================================================

/**
 * Verifica el estado de la migración al sistema lock-free
 *
 * EJECUTAR DESPUÉS DEL DEPLOY:
 * 1. Detecta si existe cola del sistema antiguo
 * 2. Muestra operaciones pendientes (si las hay)
 * 3. Verifica que el sistema lock-free está funcionando
 * 4. Provee instrucciones claras sobre qué hacer
 *
 * @returns {Object} Estado de la migración
 */
function verificarMigracionLockFree() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║         VERIFICACIÓN: MIGRACIÓN A SISTEMA LOCK-FREE         ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  const scriptProps = PropertiesService.getScriptProperties();
  let sistemaAntiguo = null;
  let sistemaLockFree = null;

  // ═══ 1. VERIFICAR SISTEMA ANTIGUO ═══
  Logger.log("1️⃣ Verificando sistema antiguo...\n");

  const oldQueueProperty = scriptProps.getProperty('cola_procesamiento_estacionamientos');

  if (oldQueueProperty) {
    try {
      const oldQueue = JSON.parse(oldQueueProperty);
      sistemaAntiguo = {
        existe: true,
        operaciones: oldQueue.length,
        datos: oldQueue
      };

      Logger.log(`   ⚠️ ENCONTRADO: Sistema antiguo con ${oldQueue.length} operación(es)`);

      if (oldQueue.length > 0) {
        Logger.log("\n   📋 Operaciones pendientes en sistema antiguo:");
        oldQueue.slice(0, 5).forEach((op, i) => {
          Logger.log(`      ${i+1}. ${op.type} (${op.source}) - ${new Date(op.timestamp).toISOString()}`);
        });
        if (oldQueue.length > 5) {
          Logger.log(`      ... y ${oldQueue.length - 5} más`);
        }

        Logger.log("\n   ⚠️ ACCIÓN REQUERIDA:");
        Logger.log("      Estas operaciones NO se migrarán automáticamente.");
        Logger.log("      Opciones:");
        Logger.log("      a) Descartarlas: ejecuta limpiarSistemaAntiguoDefinitivo()");
        Logger.log("      b) Son importantes: Espera a que se procesen naturalmente\n");
      } else {
        Logger.log("   ✅ Sistema antiguo vacío (se puede limpiar)\n");
      }

    } catch (error) {
      Logger.log(`   ❌ Error leyendo sistema antiguo: ${error}\n`);
      sistemaAntiguo = { existe: true, operaciones: -1, error: error.toString() };
    }
  } else {
    Logger.log("   ✅ No existe sistema antiguo (migración limpia)\n");
    sistemaAntiguo = { existe: false, operaciones: 0 };
  }

  // ═══ 2. VERIFICAR SISTEMA LOCK-FREE ═══
  Logger.log("2️⃣ Verificando sistema lock-free...\n");

  const allKeys = scriptProps.getKeys();
  const queueKeys = allKeys.filter(k => k.startsWith(QUEUE_CONFIG.PROPERTY_KEY_PREFIX));

  sistemaLockFree = {
    operaciones: queueKeys.length,
    claves: queueKeys
  };

  Logger.log(`   📊 Operaciones en cola lock-free: ${queueKeys.length}`);

  if (queueKeys.length > 0) {
    Logger.log("\n   Primeras claves:");
    queueKeys.slice(0, 5).forEach(key => {
      const op = JSON.parse(scriptProps.getProperty(key));
      Logger.log(`      - ${key}`);
      Logger.log(`        Tipo: ${op.type}, Origen: ${op.source}`);
    });
    if (queueKeys.length > 5) {
      Logger.log(`      ... y ${queueKeys.length - 5} más`);
    }
    Logger.log("");
  } else {
    Logger.log("   ✅ Cola lock-free vacía (normal si es primera instalación)\n");
  }

  // ═══ 3. VERIFICAR TRIGGERS ═══
  Logger.log("3️⃣ Verificando triggers...\n");

  const triggers = ScriptApp.getProjectTriggers();
  const triggerDiario = triggers.find(t =>
    t.getHandlerFunction() === 'encolarProcesamientoAutomaticoHorario'
  );

  if (triggerDiario) {
    Logger.log("   ✅ Trigger diario (6 AM) instalado\n");
  } else {
    Logger.log("   ⚠️ Trigger diario NO instalado");
    Logger.log("      Ejecuta: instalarTriggerProcesamientoHorario()\n");
  }

  // ═══ 4. RESUMEN EJECUTIVO ═══
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║                    RESUMEN EJECUTIVO                         ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  if (!sistemaAntiguo.existe && sistemaLockFree.operaciones === 0) {
    Logger.log("✅ MIGRACIÓN LIMPIA");
    Logger.log("   - No hay sistema antiguo");
    Logger.log("   - Sistema lock-free activo y vacío");
    Logger.log("   - Listo para producción\n");

  } else if (sistemaAntiguo.existe && sistemaAntiguo.operaciones === 0) {
    Logger.log("⚠️ ACCIÓN REQUERIDA: Limpiar sistema antiguo");
    Logger.log("   - Sistema antiguo vacío pero existe la propiedad");
    Logger.log("   - Ejecuta: limpiarSistemaAntiguoDefinitivo()\n");

  } else if (sistemaAntiguo.existe && sistemaAntiguo.operaciones > 0) {
    Logger.log("⚠️ ACCIÓN REQUERIDA: Operaciones pendientes en sistema antiguo");
    Logger.log(`   - ${sistemaAntiguo.operaciones} operación(es) en sistema antiguo`);
    Logger.log("   - Decide si descartarlas o procesarlas");
    Logger.log("   - Para descartar: limpiarSistemaAntiguoDefinitivo()\n");

  } else {
    Logger.log("✅ SISTEMA LOCK-FREE ACTIVO");
    Logger.log(`   - ${sistemaLockFree.operaciones} operación(es) en cola\n`);
  }

  Logger.log("════════════════════════════════════════════════════════════════\n");

  return {
    sistemaAntiguo: sistemaAntiguo,
    sistemaLockFree: sistemaLockFree,
    triggerDiarioInstalado: !!triggerDiario
  };
}

/**
 * Limpia definitivamente el sistema antiguo
 *
 * ⚠️ ADVERTENCIA: Esta acción es IRREVERSIBLE
 * Esto eliminará TODAS las operaciones pendientes en el sistema antiguo
 *
 * Solo ejecutar si:
 * - Has verificado que no hay operaciones importantes pendientes
 * - O has decidido descartarlas conscientemente
 *
 * @returns {Object} Resultado de la limpieza
 */
function limpiarSistemaAntiguoDefinitivo() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║         ⚠️  LIMPIEZA DEFINITIVA - SISTEMA ANTIGUO           ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  const scriptProps = PropertiesService.getScriptProperties();
  const oldQueueProperty = scriptProps.getProperty('cola_procesamiento_estacionamientos');

  if (!oldQueueProperty) {
    Logger.log("ℹ️ No existe sistema antiguo que limpiar");
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return { success: true, operacionesEliminadas: 0 };
  }

  try {
    const oldQueue = JSON.parse(oldQueueProperty);
    const cantidad = oldQueue.length;

    Logger.log(`⚠️ Se eliminarán ${cantidad} operación(es) del sistema antiguo\n`);

    if (cantidad > 0) {
      Logger.log("Operaciones que se eliminarán:");
      oldQueue.slice(0, 10).forEach((op, i) => {
        Logger.log(`  ${i+1}. ${op.type} (${op.source})`);
      });
      if (cantidad > 10) {
        Logger.log(`  ... y ${cantidad - 10} más`);
      }
      Logger.log("");
    }

    // Eliminar propiedad del sistema antiguo
    scriptProps.deleteProperty('cola_procesamiento_estacionamientos');

    Logger.log("✅ Sistema antiguo eliminado definitivamente");
    Logger.log(`   ${cantidad} operación(es) descartada(s)`);
    Logger.log("\n════════════════════════════════════════════════════════════════\n");

    return {
      success: true,
      operacionesEliminadas: cantidad,
      operaciones: oldQueue
    };

  } catch (error) {
    Logger.log(`❌ Error al limpiar sistema antiguo: ${error}`);
    Logger.log("════════════════════════════════════════════════════════════════\n");
    return { success: false, error: error.toString() };
  }
}
