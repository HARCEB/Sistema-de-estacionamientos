/**
 * Verifica si un ID es válido para cancelar (es decir, si existe en la hoja de respuestas)
 * @param {string} id - ID de la reserva a cancelar
 * @returns {boolean} True si el ID existe y es válido
 */
function checkIdCancelar(id) {
  if (!id) return false;
  
  const spreadsheetRespuestas = obtenerHojaPrincipal().getSheetByName('Respuestas Reserva');
  const result = spreadsheetRespuestas.getRange("A2:A").createTextFinder(id).matchEntireCell(true).findNext();
  
  return result !== null;
}

/**
 * Función principal para cancelar una reserva.
 * Puede ser llamada desde el formulario de cancelación, desde la interfaz de admin, o desde el sistema de colas.
 * 
 * @param {string} id - ID de la reserva a cancelar
 * @returns {Object} Objeto con success y message
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
 * Lógica interna de cancelación (libre de bloqueos, para uso interno seguro)
 */
function cancelarReservaInterno(id) {
  try {
    Logger.log("Iniciando cancelación interna para ID: " + id);
    
    // 1. Validar el ID
    if (!checkIdCancelar(id)) {
      return { success: false, message: 'ID inválido o no encontrado' };
    }
    
    // 2. Obtener datos del usuario
    const spreadsheetRespuestas = obtenerHojaPrincipal().getSheetByName('Respuestas Reserva');
    const busquedaDatos = spreadsheetRespuestas.getRange("A2:A").createTextFinder(id).matchEntireCell(true).findAll();
    
    let datosPersona = null;
    if (busquedaDatos.length > 0) {
      datosPersona = spreadsheetRespuestas.getSheetValues(busquedaDatos[0].getRow(), 1, 1, 7)[0];
    }
    
    // 3. Validar anticipación de cancelación (No se puede cancelar el mismo día o fecha pasada)
    if (datosPersona && datosPersona[3]) {
      let fechaReservaObj = datosPersona[3];
      if (typeof fechaReservaObj === 'string') {
        fechaReservaObj = stringToDate(fechaReservaObj);
      }
      
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
    
    // 4. Caso A: La reserva estaba en Fila de Espera
    if (retirarIdFila(id)) {
      Logger.log("ID encontrado y retirado de Fila de Espera.");
      // Aseguramos que la eliminación de la fila de espera se guarde físicamente
      SpreadsheetApp.flush();
      if (datosPersona) {
        sendEmailCancelacionFilaEspera(datosPersona);
      }
      return { success: true, message: "Reserva eliminada de la fila de espera exitosamente" };
    }
    
    // 5. Caso B: La reserva ya estaba Asignada
    const spreadsheetEstacionamientos = obtenerHojaPrincipal().getSheetByName('Estacionamientos_Asignados');
    const puestoAsignadoIndice = getIndexMatch(spreadsheetEstacionamientos, "A2:A", id);
    
    if (puestoAsignadoIndice.length === 0) {
      return { success: false, message: "La reserva ya estaba cancelada o no existe en asignados" };
    }
    
    const filaAEliminar = puestoAsignadoIndice[0];
    const fechaReserva = spreadsheetEstacionamientos.getRange(filaAEliminar, 4).getDisplayValue();
    const cupoAsignado = spreadsheetEstacionamientos.getRange(filaAEliminar, 6).getDisplayValue();
    
    // Eliminar de Estacionamientos_Asignados
    spreadsheetEstacionamientos.deleteRow(filaAEliminar);
    Logger.log("Puesto asignado eliminado.");
    
    // Eliminar del Historial si existe
    const spreadsheetHistorial = obtenerHojaPrincipal().getSheetByName('Historial');
    if (spreadsheetHistorial) {
      const historialIndice = getIndexMatch(spreadsheetHistorial, "A2:A", id);
      if (historialIndice.length > 0) {
        spreadsheetHistorial.deleteRow(historialIndice[0]);
        Logger.log("Registro eliminado del Historial.");
      }
    }
    
    // IMPORTANTE: Forzamos la escritura/eliminación en la base de datos de Sheets
    // antes de realizar otros procesos o enviar el correo.
    SpreadsheetApp.flush();
    
    // Encolar el procesamiento de la fila
    try {
      if (typeof encolarProcesamientoFila === 'function') {
        encolarProcesamientoFila(fechaReserva, 'cancelacion_id_' + id);
      } else {
        procesarFila(fechaReserva);
      }
    } catch (e) {
      procesarFila(fechaReserva);
    }
    
    // Actualizar los cupos
    try {
      actualizarCuposDisponibles();
    } catch (e) {
      Logger.log("Error al actualizar cupos disponibles: " + e.toString());
    }
    
    // Forzamos nuevamente el guardado de los cupos y la cola actualizados
    SpreadsheetApp.flush();
    
    // Enviar correo de cancelación exitosa (SOLO después de confirmar los cambios en la base de datos)
    if (datosPersona) {
      sendEmailCancelacionExitosa(datosPersona, cupoAsignado);
    }
    
    Logger.log("Cancelación completada con éxito.");
    return { success: true, message: "Reserva cancelada exitosamente" };
    
  } catch (error) {
    Logger.log("ERROR EXCEPCIÓN en cancelarReservaInterno: " + error.toString());
    return { success: false, message: "Error interno al cancelar: " + error.toString() };
  }
}
