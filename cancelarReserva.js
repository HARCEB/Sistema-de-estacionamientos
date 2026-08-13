/**
 * MÓDULO DE CANCELACIÓN DE RESERVAS (REFACTORIZADO CON RESPONSABILIDAD ÚNICA)
 */

/**
 * Verifica si un ID es válido para cancelar
 * @param {string} id - ID de la reserva a cancelar
 * @returns {boolean} True si el ID existe en la hoja de respuestas
 */
function checkIdCancelar(id) {
  if (!id) return false;
  
  const spreadsheetRespuestas = obtenerHojaPrincipal().getSheetByName('Respuestas Reserva');
  const result = spreadsheetRespuestas.getRange("A2:A").createTextFinder(id).matchEntireCell(true).findNext();
  
  return result !== null;
}

/**
 * Función pública principal con adquisición de bloqueo (LockService)
 * @param {string} id - ID de la reserva a cancelar
 * @returns {Object} Objeto con resultado success y message
 */
function cancelarReserva(id) {
  var lock = LockService.getDocumentLock();
  var lockAcquired = false;
  try {
    if (!lock.tryLock(30000)) {
      return { success: false, message: 'Sistema ocupado. No se pudo obtener el bloqueo, por favor intenta de nuevo en unos segundos.' };
    }
    lockAcquired = true;
    return cancelarReservaInterno(id);
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

/**
 * Función orquestadora interna para cancelar una reserva (libre de bloqueos)
 * @param {string} id - ID de la reserva
 * @returns {Object} Resultado de la operación
 */
function cancelarReservaInterno(id) {
  try {
    Logger.log("Iniciando cancelación interna para ID: " + id);
    if (!id) return { success: false, message: 'ID inválido o no encontrado' };

    // 1. Obtener y validar datos de la reserva
    const datosReserva = obtenerDatosReservaPorId(id);
    if (!datosReserva.success) return datosReserva;

    const { datosPersona, emailUsuario, fechaReservaTexto } = datosReserva;

    // 2. Buscar coincidencias en hojas de asignaciones y cola de espera
    const coincidencias = buscarCoincidenciasReserva(emailUsuario, fechaReservaTexto, id);
    if (!coincidencias.existeEnAsignados && !coincidencias.existeEnFila) {
      return { success: false, message: "La reserva ya estaba cancelada o no existe en asignados ni en fila de espera" };
    }

    // 3. Validar regla de anticipación
    const validacionAnticipacion = validarAnticipacionCancelacion(coincidencias.existeEnAsignados, fechaReservaTexto);
    if (!validacionAnticipacion.success) return validacionAnticipacion;

    // 4. Ejecutar borrado físico en hojas de cálculo
    const resultadoBorrado = ejecutarEliminacionesCancelacion(coincidencias, id);

    // 5. Finalizar procesamiento post-cancelación y notificar
    return finalizarCancelacionYNotificar(resultadoBorrado, datosPersona, id);

  } catch (error) {
    Logger.log("ERROR EXCEPCIÓN en cancelarReservaInterno: " + error.toString());
    return { success: false, message: "Error interno al cancelar: " + error.toString() };
  }
}

// ============================================================================
// FUNCIONES AUXILIARES DE RESPONSABILIDAD ÚNICA (SRP)
// ============================================================================

/**
 * 1. Obtiene los datos del usuario a partir del ID en la hoja 'Respuestas Reserva'
 */
function obtenerDatosReservaPorId(id) {
  const hojaPrincipal = obtenerHojaPrincipal();
  const spreadsheetRespuestas = hojaPrincipal.getSheetByName('Respuestas Reserva');
  const busquedaDatos = spreadsheetRespuestas.getRange("A2:A").createTextFinder(id).matchEntireCell(true).findAll();
  
  if (busquedaDatos.length === 0) {
    return { success: false, message: 'ID inválido o no encontrado' };
  }
  
  const datosPersona = spreadsheetRespuestas.getSheetValues(busquedaDatos[0].getRow(), 1, 1, 7)[0];
  const emailUsuario = datosPersona[1] ? String(datosPersona[1]).trim().toLowerCase() : "";
  const fechaReservaTexto = datosPersona[3];
  
  if (!emailUsuario || !fechaReservaTexto) {
    return { success: false, message: 'Datos de reserva incompletos en la hoja de respuestas' };
  }

  return { success: true, datosPersona, emailUsuario, fechaReservaTexto };
}

/**
 * 2. Busca todas las filas coincidentes por ID o por combinación (Email, Fecha)
 */
function buscarCoincidenciasReserva(emailUsuario, fechaReservaTexto, id) {
  const hojaPrincipal = obtenerHojaPrincipal();
  const spreadsheetEstacionamientos = hojaPrincipal.getSheetByName('Estacionamientos_Asignados');
  const spreadsheetFila = hojaPrincipal.getSheetByName('Fila_Espera');
  
  let filasAsignados = [];
  const datosAsignados = spreadsheetEstacionamientos.getDataRange().getDisplayValues();
  for (let i = 1; i < datosAsignados.length; i++) {
    const idCelda = datosAsignados[i][0];
    const emailCelda = datosAsignados[i][2];
    const fechaCelda = datosAsignados[i][3];
    
    if (idCelda === id || 
        (emailCelda && emailCelda.toString().trim().toLowerCase() === emailUsuario && sonFechasIguales(fechaCelda, fechaReservaTexto))) {
      filasAsignados.push(i + 1);
    }
  }
  
  let filasFila = [];
  const datosFila = spreadsheetFila.getDataRange().getDisplayValues();
  for (let i = 1; i < datosFila.length; i++) {
    const idCelda = datosFila[i][0];
    const emailCelda = datosFila[i][2];
    const fechaCelda = datosFila[i][3];
    
    if (idCelda === id || 
        (emailCelda && emailCelda.toString().trim().toLowerCase() === emailUsuario && sonFechasIguales(fechaCelda, fechaReservaTexto))) {
      filasFila.push({ row: i + 1, id: idCelda });
    }
  }

  return {
    filasAsignados,
    filasFila,
    existeEnAsignados: filasAsignados.length > 0,
    existeEnFila: filasFila.length > 0
  };
}

/**
 * 3. Valida la regla de días de anticipación de cancelación
 */
function validarAnticipacionCancelacion(existeEnAsignados, fechaReservaTexto) {
  if (existeEnAsignados && fechaReservaTexto) {
    let fechaReservaObj = parseDateSecure(fechaReservaTexto);
    
    if (fechaReservaObj instanceof Date && !isNaN(fechaReservaObj.getTime())) {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const reservaSoloFecha = new Date(fechaReservaObj);
      reservaSoloFecha.setHours(0, 0, 0, 0);
      
      const diffTime = reservaSoloFecha.getTime() - hoy.getTime();
      const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
      
      if (diffDays <= 0) {
        Logger.log("Cancelación rechazada: " + diffDays + " días de anticipación.");
        return { success: false, message: 'No puedes cancelar una reserva el mismo día de su uso. Debes cancelar con al menos un día de anticipación.' };
      }
    }
  }
  return { success: true };
}

/**
 * 4. Ejecuta las eliminaciones de filas en Estacionamientos_Asignados, Fila_Espera e Historial
 */
function ejecutarEliminacionesCancelacion(coincidencias, id) {
  const hojaPrincipal = obtenerHojaPrincipal();
  const spreadsheetEstacionamientos = hojaPrincipal.getSheetByName('Estacionamientos_Asignados');
  
  let eliminadoFila = false;
  let eliminadoAsignado = false;
  let fechaReserva = "";
  let cupoAsignado = "";

  // Borrar de Fila de Espera
  if (coincidencias.existeEnFila) {
    coincidencias.filasFila.forEach(item => {
      if (item.id && retirarIdFila(item.id)) {
        eliminadoFila = true;
      }
    });
    Logger.log("Registros eliminados de Fila de Espera.");
  }

  // Borrar de Estacionamientos_Asignados
  if (coincidencias.existeEnAsignados) {
    const filaReferencia = coincidencias.filasAsignados[0];
    fechaReserva = spreadsheetEstacionamientos.getRange(filaReferencia, 4).getDisplayValue();
    cupoAsignado = spreadsheetEstacionamientos.getRange(filaReferencia, 6).getDisplayValue();
    
    const indicesOrdenados = coincidencias.filasAsignados.sort((a, b) => b - a);
    indicesOrdenados.forEach(fila => {
      spreadsheetEstacionamientos.deleteRow(fila);
    });
    eliminadoAsignado = true;
    Logger.log("Puesto(s) asignado(s) eliminado(s) de Estacionamientos_Asignados.");
  }

  // Borrar de Historial
  const spreadsheetHistorial = hojaPrincipal.getSheetByName('Historial');
  if (spreadsheetHistorial) {
    const historialIndice = getIndexMatch(spreadsheetHistorial, "A2:A", id);
    if (historialIndice.length > 0) {
      const historialOrdenado = historialIndice.sort((a, b) => b - a);
      historialOrdenado.forEach(fila => {
        spreadsheetHistorial.deleteRow(fila);
      });
    }
  }

  SpreadsheetApp.flush();

  return { eliminadoAsignado, eliminadoFila, fechaReserva, cupoAsignado };
}

/**
 * 5. Re-encola el procesamiento de la fila, actualiza la disponibilidad de cupos y envía la notificación por correo
 */
function finalizarCancelacionYNotificar(resultadoBorrado, datosPersona, id) {
  const { eliminadoAsignado, eliminadoFila, fechaReserva, cupoAsignado } = resultadoBorrado;

  if (eliminadoAsignado && fechaReserva) {
    try {
      if (typeof encolarProcesamientoFila === 'function') {
        encolarProcesamientoFila(fechaReserva, 'cancelacion_id_' + id);
      } else {
        procesarFila(fechaReserva);
      }
    } catch (e) {
      procesarFila(fechaReserva);
    }
  }

  try {
    actualizarCuposDisponibles();
  } catch (e) {
    Logger.log("Error al actualizar cupos disponibles: " + e.toString());
  }

  SpreadsheetApp.flush();

  if (datosPersona) {
    if (eliminadoAsignado) {
      sendEmailCancelacionExitosa(datosPersona, cupoAsignado);
    } else if (eliminadoFila) {
      sendEmailCancelacionFilaEspera(datosPersona);
    }
  }

  Logger.log("Cancelación completada con éxito.");
  return { 
    success: true, 
    message: eliminadoAsignado ? "Reserva cancelada exitosamente" : "Solicitud en fila de espera cancelada exitosamente" 
  };
}
