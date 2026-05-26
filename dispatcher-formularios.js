/**
 * DISPATCHER INTELIGENTE PARA MÚLTIPLES FORMULARIOS
 *
 * Este archivo maneja el problema de tener 2 formularios vinculados
 * al mismo Google Sheet. El dispatcher detecta automáticamente
 * qué formulario fue enviado y ejecuta la función correcta.
 */

/**
 * FUNCIÓN PRINCIPAL - Esta debe ser la ÚNICA con trigger "On form submit"
 *
 * Detecta automáticamente si es el formulario principal o de cancelación
 * y ejecuta la función correspondiente
 *
 * @param {Object} e - Event object del form submit
 */
function onFormSubmitDispatcher(e) {
  var lock = LockService.getDocumentLock();
  try {
    lock.waitLock(60000);

    // Registrar para debugging
    Logger.log("════════════════════════════════════════════════");
    Logger.log("DISPATCHER: Nuevo envío de formulario detectado");
    Logger.log("════════════════════════════════════════════════");

    if (!e || !e.values) {
      Logger.log("ERROR: Evento inválido - no tiene valores");
      return;
    }

    // Obtener valores del formulario
    const values = e.values;
    Logger.log(`Valores recibidos: ${values.length} columnas`);

    // Log de todos los valores para debugging
    values.forEach((val, index) => {
      Logger.log(`  Columna ${index}: ${String(val).substring(0, 100)}`);
    });

    // DETECTAR QUÉ FORMULARIO FUE ENVIADO
    const tipoFormulario = detectarTipoFormulario(values);

    Logger.log(`\nTipo de formulario detectado: ${tipoFormulario}`);
    Logger.log("────────────────────────────────────────────────");

    // Ejecutar la función correspondiente
    if (tipoFormulario === 'CANCELACION') {
      Logger.log("→ Ejecutando proceso de CANCELACIÓN");
      procesarFormularioCancelacion(e);
    } else if (tipoFormulario === 'RESERVA') {
      Logger.log("→ Ejecutando proceso de RESERVA");
      procesarFormularioReserva(e);
    } else {
      Logger.log("⚠️ ADVERTENCIA: Tipo de formulario desconocido");
      Logger.log("No se ejecutó ninguna acción");
    }

    Logger.log("════════════════════════════════════════════════\n");

  } catch (error) {
    Logger.log(`ERROR en dispatcher: ${error.toString()}`);
    Logger.log(`Stack: ${error.stack}`);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Detecta qué tipo de formulario fue enviado basándose en los valores
 *
 * @param {Array} values - Valores del formulario
 * @returns {string} 'RESERVA', 'CANCELACION', o 'DESCONOCIDO'
 */
function detectarTipoFormulario(values) {
  // ESTRUCTURA CONOCIDA:
  // Cancelación (4 cols): [Timestamp, Email, ID_Reserva, Confirmación]
  // Reserva (6 cols):     [Timestamp, Email, Nombre, Fecha, Hora, Placa]

  Logger.log(`  Número de columnas recibidas: ${values.length}`);

  // Estrategia 1: Buscar ID de reserva (buker-/test-) en CUALQUIER columna
  // Esta es la detección MÁS CONFIABLE - si hay un ID, es CANCELACIÓN
  for (let i = 0; i < values.length; i++) {
    const valor = String(values[i]);

    if (valor.startsWith('buker-') || valor.startsWith('test-')) {
      Logger.log(`  ✓ ID de reserva encontrado en columna ${i}: ${valor.substring(0, 30)}...`);
      Logger.log(`  → Tipo: CANCELACION`);
      return 'CANCELACION';
    }
  }

  // Estrategia 2: Número de columnas específico
  // Cancelación = 4 columnas exactas
  // Reserva = 6 columnas o más

  if (values.length === 4) {
    Logger.log(`  ✓ 4 columnas detectadas (estructura de cancelación)`);
    Logger.log(`  → Tipo: CANCELACION`);
    return 'CANCELACION';
  }

  if (values.length >= 6) {
    // Verificar que tenga el patrón de reserva: timestamp + email
    const timestamp = values[0];
    const email = String(values[1]);

    if (email.includes('@')) {
      Logger.log(`  ✓ 6+ columnas y contiene email en posición 1`);
      Logger.log(`  → Tipo: RESERVA`);
      return 'RESERVA';
    }
  }

  // Estrategia 3: Fallback para casos ambiguos
  if (values.length <= 4) {
    Logger.log(`  ⚠️ Columnas ≤ 4 pero sin ID encontrado`);
    Logger.log(`  → Asumiendo: CANCELACION (por número de columnas)`);
    return 'CANCELACION';
  }

  Logger.log(`  ⚠️ No se pudo detectar el tipo con certeza`);
  Logger.log(`  Columnas: ${values.length}, Valores: ${JSON.stringify(values)}`);
  return 'DESCONOCIDO';
}

/**
 * Procesa el formulario de RESERVA
 * Esta es la función original setUniqueId
 */
function procesarFormularioReserva(e) {
  // Llamar a la función original
  setUniqueId(e);
}

/**
 * Procesa el formulario de CANCELACIÓN
 * Esta es la función original onCancelFormSubmit
 */
function procesarFormularioCancelacion(e) {
  try {
    Logger.log("=== Procesamiento de cancelación ===");

    const values = e.values;
    let reservaId = null;

    // Buscar el ID en los valores
    for (let i = 0; i < values.length; i++) {
      const value = String(values[i]);

      if (value.startsWith('buker-') || value.startsWith('test-')) {
        reservaId = value;
        Logger.log(`ID encontrado en columna ${i}: ${reservaId}`);
        break;
      }
    }

    if (!reservaId) {
      Logger.log("ERROR: No se encontró ID de reserva en los valores del formulario");
      Logger.log("Valores recibidos: " + JSON.stringify(values));
      return;
    }

    Logger.log("Cancelando reserva: " + reservaId);

    // NUEVO: Encolar la cancelación en lugar de ejecutarla directamente
    // Esto evita bloquear el trigger del formulario
    Logger.log("Encolando cancelación...");
    const resultado = encolarCancelacion(reservaId, 'formulario_cancelacion');

    if (resultado.success) {
      Logger.log("✓ Cancelación encolada exitosamente");
      Logger.log(`  Request ID: ${resultado.requestId}`);
      Logger.log(`  Posición en cola: ${resultado.positionInQueue}`);
      Logger.log(`  Será procesada en máximo 20 minutos`);
    } else {
      Logger.log("✗ Error al encolar cancelación: " + resultado.error);
      // Fallback: ejecutar directamente si falla el encolamiento
      Logger.log("Ejecutando cancelación directamente como fallback...");
      const resultadoDirecto = cancelarReservaInterno(reservaId);
      if (resultadoDirecto.success) {
        Logger.log("✓ Cancelación directa exitosa: " + resultadoDirecto.message);
      } else {
        Logger.log("✗ Error en cancelación directa: " + resultadoDirecto.message);
      }
    }

  } catch (error) {
    Logger.log("ERROR en procesarFormularioCancelacion: " + error.toString());
    Logger.log("Stack: " + error.stack);
  }
}

/**
 * ═══════════════════════════════════════════════════════════════
 * FUNCIONES DE CONFIGURACIÓN Y DIAGNÓSTICO
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Configura el trigger para usar el dispatcher
 * EJECUTAR ESTA FUNCIÓN UNA SOLA VEZ
 */
function configurarTriggerDispatcher() {
  Logger.log("═══════════════════════════════════════════════");
  Logger.log("  CONFIGURANDO TRIGGER CON DISPATCHER");
  Logger.log("═══════════════════════════════════════════════\n");

  const SHEET_ID_PRINCIPAL = PropertiesService.getScriptProperties().getProperty('sheet_id');

  if (!SHEET_ID_PRINCIPAL) {
    Logger.log("❌ ERROR: No se encuentra 'sheet_id' en las propiedades del script");
    return;
  }

  // 1. Eliminar TODOS los triggers de form submit existentes
  Logger.log("1️⃣ Eliminando triggers antiguos...");

  const triggers = ScriptApp.getProjectTriggers();
  const triggersEliminados = [];

  triggers.forEach(trigger => {
    const func = trigger.getHandlerFunction();
    const tipo = trigger.getEventType().toString();

    // Eliminar cualquier trigger de form submit
    if (tipo === 'ON_FORM_SUBMIT') {
      Logger.log(`   Eliminando: ${func} (${tipo})`);
      ScriptApp.deleteTrigger(trigger);
      triggersEliminados.push(func);
    }
  });

  if (triggersEliminados.length > 0) {
    Logger.log(`   ✓ ${triggersEliminados.length} trigger(s) eliminado(s): ${triggersEliminados.join(', ')}`);
  } else {
    Logger.log("   ℹ️ No había triggers anteriores");
  }
  Logger.log("");

  // 2. Crear el ÚNICO trigger necesario - el dispatcher
  Logger.log("2️⃣ Creando nuevo trigger con dispatcher...");

  try {
    ScriptApp.newTrigger('onFormSubmitDispatcher')
   .forSpreadsheet(SHEET_ID_PRINCIPAL)
   .onFormSubmit()
   .create();

    Logger.log("   ✓ Trigger creado exitosamente");
    Logger.log("   Función: onFormSubmitDispatcher");
    Logger.log("   Este trigger manejará AMBOS formularios automáticamente");
  } catch (error) {
    Logger.log(`   ❌ ERROR al crear trigger: ${error.toString()}`);
    throw error;
  }
  Logger.log("");

  // 3. Verificar configuración
  Logger.log("3️⃣ Verificando configuración...");

  const triggersNuevos = ScriptApp.getProjectTriggers();
  const triggerDispatcher = triggersNuevos.find(t =>
    t.getHandlerFunction() === 'onFormSubmitDispatcher'
  );

  if (triggerDispatcher) {
    Logger.log("   ✓ Trigger dispatcher encontrado y activo");
  } else {
    Logger.log("   ❌ ERROR: No se pudo verificar el trigger");
  }
  Logger.log("");

  Logger.log("═══════════════════════════════════════════════");
  Logger.log("✅ CONFIGURACIÓN COMPLETADA");
  Logger.log("═══════════════════════════════════════════════");
  Logger.log("");
  Logger.log("Próximos pasos:");
  Logger.log("1. Envía un formulario de RESERVA y verifica los logs");
  Logger.log("2. Envía un formulario de CANCELACIÓN y verifica los logs");
  Logger.log("3. Si algo falla, ejecuta: capturarProximoEvento()");
  Logger.log("");

  return "Configuración completada";
}

/**
 * Muestra todos los triggers actuales
 */
function verTriggersActuales() {
  Logger.log("═══════════════════════════════════════════════");
  Logger.log("  TRIGGERS ACTUALES EN EL PROYECTO");
  Logger.log("═══════════════════════════════════════════════\n");

  const triggers = ScriptApp.getProjectTriggers();

  if (triggers.length === 0) {
    Logger.log("❌ NO HAY TRIGGERS INSTALADOS");
    Logger.log("Ejecuta: configurarTriggerDispatcher()");
    return;
  }

  Logger.log(`Total de triggers: ${triggers.length}\n`);

  triggers.forEach((trigger, index) => {
    Logger.log(`Trigger #${index + 1}:`);
    Logger.log(`  Función: ${trigger.getHandlerFunction()}`);
    Logger.log(`  Tipo: ${trigger.getEventType()}`);
    Logger.log(`  Fuente: ${trigger.getTriggerSource()}`);
    Logger.log(`  ID: ${trigger.getUniqueId()}`);
    Logger.log("");
  });

  // Análisis
  const formSubmitTriggers = triggers.filter(t =>
    t.getEventType().toString() === 'ON_FORM_SUBMIT'
  );

  Logger.log("═══════════════════════════════════════════════");
  Logger.log("ANÁLISIS:");
  Logger.log(`  Triggers de form submit: ${formSubmitTriggers.length}`);

  if (formSubmitTriggers.length === 0) {
    Logger.log("  ❌ No hay triggers de form submit");
  } else if (formSubmitTriggers.length === 1) {
    const func = formSubmitTriggers[0].getHandlerFunction();
    if (func === 'onFormSubmitDispatcher') {
      Logger.log("  ✅ Configuración CORRECTA (usando dispatcher)");
    } else {
      Logger.log(`  ⚠️ Usando función: ${func}`);
      Logger.log("  Recomendación: Usar dispatcher para manejar ambos formularios");
    }
  } else {
    Logger.log("  ⚠️ MÚLTIPLES triggers de form submit detectados");
    Logger.log("  Esto puede causar conflictos");
    Logger.log("  Ejecuta: configurarTriggerDispatcher() para limpiar");
  }
  Logger.log("═══════════════════════════════════════════════\n");
}

/**
 * Función temporal para capturar y mostrar el próximo evento
 * Reemplaza temporalmente el dispatcher para hacer debugging
 */
function capturarProximoEvento(e) {
  Logger.log("╔═══════════════════════════════════════════════════════╗");
  Logger.log("║          CAPTURA DE EVENTO - MODO DEBUG               ║");
  Logger.log("╚═══════════════════════════════════════════════════════╝\n");

  Logger.log("Timestamp: " + new Date().toISOString());
  Logger.log("");

  // Información del evento
  Logger.log("📋 INFORMACIÓN DEL EVENTO:");
  Logger.log("─────────────────────────────────────────────────────");

  if (!e) {
    Logger.log("❌ ERROR: Evento es null o undefined");
    return;
  }

  Logger.log("Propiedades del evento:");
  for (let prop in e) {
    if (e.hasOwnProperty(prop)) {
      Logger.log(`  ${prop}: ${typeof e[prop]}`);
    }
  }
  Logger.log("");

  // Valores del formulario
  if (e.values) {
    Logger.log("📝 VALORES DEL FORMULARIO:");
    Logger.log("─────────────────────────────────────────────────────");
    Logger.log(`Total de columnas: ${e.values.length}\n`);

    e.values.forEach((val, index) => {
      const tipo = typeof val;
      let valorStr = String(val);

      if (val instanceof Date) {
        valorStr = val.toISOString();
      } else if (valorStr.length > 100) {
        valorStr = valorStr.substring(0, 100) + "...";
      }

      Logger.log(`Columna ${index} (${tipo}):`);
      Logger.log(`  ${valorStr}`);
      Logger.log("");
    });
  } else {
    Logger.log("❌ No hay valores (e.values es undefined)");
  }

  // Range info
  if (e.range) {
    Logger.log("📍 INFORMACIÓN DEL RANGE:");
    Logger.log("─────────────────────────────────────────────────────");
    Logger.log(`  Fila: ${e.range.getRow()}`);
    Logger.log(`  Columna: ${e.range.getColumn()}`);
    Logger.log(`  Num filas: ${e.range.getNumRows()}`);
    Logger.log(`  Num columnas: ${e.range.getNumColumns()}`);
    Logger.log("");
  }

  // Detección automática
  if (e.values) {
    Logger.log("🔍 DETECCIÓN AUTOMÁTICA:");
    Logger.log("─────────────────────────────────────────────────────");
    const tipo = detectarTipoFormulario(e.values);
    Logger.log(`  Tipo detectado: ${tipo}`);
    Logger.log("");
  }

  Logger.log("╚═══════════════════════════════════════════════════════╝\n");

  // Ejecutar el dispatcher normal
  onFormSubmitDispatcher(e);
}

/**
 * Activa el modo de captura para el próximo envío
 */
function activarModoCapturaEvento() {
  Logger.log("Para activar el modo de captura:");
  Logger.log("1. Ve a Activadores/Triggers en Apps Script");
  Logger.log("2. Edita el trigger de 'onFormSubmitDispatcher'");
  Logger.log("3. Cámbialo temporalmente a 'capturarProximoEvento'");
  Logger.log("4. Envía un formulario");
  Logger.log("5. Revisa los logs para ver todos los detalles");
  Logger.log("6. Vuelve a cambiar el trigger a 'onFormSubmitDispatcher'");
}
