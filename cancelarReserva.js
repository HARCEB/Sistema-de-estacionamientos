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
    
    if (!id) {
      return { success: false, message: 'ID inválido o no encontrado' };
    }
    
    const hojaPrincipal = obtenerHojaPrincipal();
    
    // 1 & 2. Validar ID y Obtener datos del usuario en una sola búsqueda
    const spreadsheetRespuestas = hojaPrincipal.getSheetByName('Respuestas Reserva');
    const busquedaDatos = spreadsheetRespuestas.getRange("A2:A").createTextFinder(id).matchEntireCell(true).findAll();
    
    if (busquedaDatos.length === 0) {
      return { success: false, message: 'ID inválido o no encontrado' };
    }
    
    let datosPersona = spreadsheetRespuestas.getSheetValues(busquedaDatos[0].getRow(), 1, 1, 7)[0];
    
    const emailUsuario = datosPersona[1] ? String(datosPersona[1]).trim().toLowerCase() : "";
    const fechaReservaTexto = datosPersona[3];
    
    if (!emailUsuario || !fechaReservaTexto) {
      return { success: false, message: 'Datos de reserva incompletos en la hoja de respuestas' };
    }
    
    const spreadsheetEstacionamientos = hojaPrincipal.getSheetByName('Estacionamientos_Asignados');
    const spreadsheetFila = hojaPrincipal.getSheetByName('Fila_Espera');
    
    // 3. Buscar todas las filas coincidentes por ID exacto O por (Email, Fecha)
    let filasAsignados = [];
    const datosAsignados = spreadsheetEstacionamientos.getDataRange().getDisplayValues();
    for (let i = 1; i < datosAsignados.length; i++) {
      const idCelda = datosAsignados[i][0];
      const emailCelda = datosAsignados[i][2]; // Col C
      const fechaCelda = datosAsignados[i][3]; // Col D
      
      if (idCelda === id || 
          (emailCelda && emailCelda.toString().trim().toLowerCase() === emailUsuario && sonFechasIguales(fechaCelda, fechaReservaTexto))) {
        filasAsignados.push(i + 1);
      }
    }
    
    let filasFila = [];
    const datosFila = spreadsheetFila.getDataRange().getDisplayValues();
    for (let i = 1; i < datosFila.length; i++) {
      const idCelda = datosFila[i][0];
      const emailCelda = datosFila[i][2]; // Col C
      const fechaCelda = datosFila[i][3]; // Col D
      
      if (idCelda === id || 
          (emailCelda && emailCelda.toString().trim().toLowerCase() === emailUsuario && sonFechasIguales(fechaCelda, fechaReservaTexto))) {
        filasFila.push({
          row: i + 1,
          id: idCelda
        });
      }
    }
    
    const existeEnAsignados = filasAsignados.length > 0;
    const existeEnFila = filasFila.length > 0;
    
    if (!existeEnAsignados && !existeEnFila) {
      return { success: false, message: "La reserva ya estaba cancelada o no existe en asignados ni en fila de espera" };
    }
    
    // 4. Validar anticipación de cancelación (Solo aplica si la reserva está Asignada/Confirmada)
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
    
    let eliminadoFila = false;
    let eliminadoAsignado = false;
    let fechaReserva = "";
    let cupoAsignado = "";
    
    // 5. Eliminar de Fila de Espera (limpiando duplicados y actualizando puestos de forma segura)
    if (existeEnFila) {
      filasFila.forEach(item => {
        if (item.id) {
          // retirarIdFila ya borra la fila y desplaza las posiciones de los demás en la cola
          if (retirarIdFila(item.id)) {
            eliminadoFila = true;
          }
        }
      });
      Logger.log("Registros eliminados de Fila de Espera.");
    }
    
    // 6. Eliminar de Estacionamientos_Asignados (eliminando todas las filas en orden inverso)
    if (existeEnAsignados) {
      const filaReferencia = filasAsignados[0];
      fechaReserva = spreadsheetEstacionamientos.getRange(filaReferencia, 4).getDisplayValue();
      cupoAsignado = spreadsheetEstacionamientos.getRange(filaReferencia, 6).getDisplayValue();
      
      // Ordenamos de mayor a menor para borrar sin alterar los índices de las filas anteriores
      const indicesOrdenados = filasAsignados.sort((a, b) => b - a);
      indicesOrdenados.forEach(fila => {
        spreadsheetEstacionamientos.deleteRow(fila);
      });
      eliminadoAsignado = true;
      Logger.log("Puesto(s) asignado(s) eliminado(s) de Estacionamientos_Asignados. Filas borradas: " + indicesOrdenados.length);
    }
    
    // 7. Eliminar del Historial si existe (por ID exacto)
    const spreadsheetHistorial = hojaPrincipal.getSheetByName('Historial');
    if (spreadsheetHistorial) {
      const historialIndice = getIndexMatch(spreadsheetHistorial, "A2:A", id);
      if (historialIndice.length > 0) {
        const historialOrdenado = historialIndice.sort((a, b) => b - a);
        historialOrdenado.forEach(fila => {
          spreadsheetHistorial.deleteRow(fila);
        });
        Logger.log("Registro eliminado del Historial. Filas borradas: " + historialOrdenado.length);
      }
    }
    
    // IMPORTANTE: Forzamos la escritura/eliminación en la base de datos de Sheets
    SpreadsheetApp.flush();
    
    // 8. Encolar el procesamiento de la fila si liberamos un cupo asignado
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
    
    // 9. Actualizar los cupos
    try {
      actualizarCuposDisponibles();
    } catch (e) {
      Logger.log("Error al actualizar cupos disponibles: " + e.toString());
    }
    
    // Forzamos nuevamente el guardado de los cupos y la cola actualizados
    SpreadsheetApp.flush();
    
    // 10. Enviar correos correspondientes
    if (datosPersona) {
      if (eliminadoAsignado) {
        sendEmailCancelacionExitosa(datosPersona, cupoAsignado);
      } else if (eliminadoFila) {
        sendEmailCancelacionFilaEspera(datosPersona);
      }
    }
    
    Logger.log("Cancelación completada con éxito.");
    return { success: true, message: eliminadoAsignado ? "Reserva cancelada exitosamente" : "Solicitud en fila de espera cancelada exitosamente" };
    
  } catch (error) {
    Logger.log("ERROR EXCEPCIÓN en cancelarReservaInterno: " + error.toString());
    return { success: false, message: "Error interno al cancelar: " + error.toString() };
  }
}
