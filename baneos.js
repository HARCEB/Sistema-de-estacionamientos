/**
 * Verifica si un usuario tiene un baneo activo.
 * @param {string} email - Correo del usuario.
 * @returns {boolean} true si está baneado, false si no.
 */
function verificarBan(email) {
    if (!email) return false;
    const spreadsheetSanciones = obtenerHojaPrincipal().getSheetByName('Sanciones');
    const busquedaSanciones = matchCell(spreadsheetSanciones, "A2:A", 1, email.trim().toLowerCase());
    if (busquedaSanciones.length > 0) return true;
    return false;
}
  
/**
 * Elimina las sanciones que ya han expirado (fecha de fin menor o igual a hoy).
 * Ejecutado automáticamente de forma diaria para levantar sanciones vencidas.
 */
function terminarBaneos() {
    const spreadsheetSanciones = obtenerHojaPrincipal().getSheetByName('Sanciones');
    const datosSanciones = spreadsheetSanciones.getDataRange().getDisplayValues();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    // Recorrer de abajo hacia arriba para evitar descalce de índices al eliminar filas
    for (let i = datosSanciones.length - 1; i >= 1; i--) {
        const fechaFinCelda = datosSanciones[i][1]; // Columna B (Fecha fin)
        if (fechaFinCelda) {
            const fechaFinObj = parseDateSecure(fechaFinCelda);
            if (fechaFinObj) {
                const fechaFinComp = new Date(fechaFinObj);
                fechaFinComp.setHours(0, 0, 0, 0);
                
                // Si la fecha de término ya pasó o es hoy, se levanta la sanción
                if (fechaFinComp <= hoy) {
                    Logger.log("Levantando sanción vencida para: " + datosSanciones[i][0]);
                    spreadsheetSanciones.deleteRow(i + 1);
                }
            }
        }
    }
    SpreadsheetApp.flush();
}

/**
 * Penaliza a un usuario impidiéndole reservar por 14 días.
 * Cancela todas sus reservas futuras en Estacionamientos_Asignados y Fila_Espera, 
 * y reasigna los cupos liberados a los siguientes en la fila.
 * @param {string} email - El correo del usuario a sancionar.
 */
function penalizarUsuario(email) {
    if (!email) {
        Logger.log("Error: Email no válido para penalización.");
        return;
    }
    
    const emailAComparar = email.trim().toLowerCase();
    Logger.log("Iniciando proceso de penalización para: " + emailAComparar);
    
    const hoy = new Date();
    
    // 1. Calcular la fecha de término (hoy + 14 días)
    const fechaFinObj = new Date(hoy.getTime() + 14 * 24 * 60 * 60 * 1000);
    fechaFinObj.setHours(12, 0, 0, 0); // Estabilizar zona horaria al mediodía
    const fechaFinStr = formattedDate(fechaFinObj);
    
    // 2. Intentar buscar el nombre del usuario de forma robusta
    let nombreUsuario = buscarNombrePorEmail(emailAComparar);
    if (!nombreUsuario) nombreUsuario = emailAComparar.split('@')[0];
    
    // 3. Registrar o actualizar la sanción en la hoja "Sanciones"
    const spreadsheetSanciones = obtenerHojaPrincipal().getSheetByName('Sanciones');
    const datosSanciones = spreadsheetSanciones.getDataRange().getDisplayValues();
    let filaSancion = -1;
    
    for (let i = 1; i < datosSanciones.length; i++) {
        if (datosSanciones[i][0] && datosSanciones[i][0].toString().trim().toLowerCase() === emailAComparar) {
            filaSancion = i + 1;
            break;
        }
    }
    
    if (filaSancion !== -1) {
        spreadsheetSanciones.getRange(filaSancion, 2).setValue(fechaFinStr);
        Logger.log("Sanción actualizada en la hoja Sanciones (Fila " + filaSancion + ") hasta: " + fechaFinStr);
    } else {
        spreadsheetSanciones.appendRow([emailAComparar, fechaFinStr]);
        Logger.log("Nueva sanción agregada en la hoja Sanciones hasta: " + fechaFinStr);
    }
    SpreadsheetApp.flush();
    
    // 4. Cancelar reservas futuras en "Estacionamientos_Asignados" (hoy en adelante)
    const spreadsheetEstacionamientos = obtenerHojaPrincipal().getSheetByName('Estacionamientos_Asignados');
    const datosEstacionamientos = spreadsheetEstacionamientos.getDataRange().getDisplayValues();
    const hoyLimite = new Date();
    hoyLimite.setHours(0, 0, 0, 0);
    
    const fechasParaProcesarCola = [];
    
    for (let i = datosEstacionamientos.length - 1; i >= 1; i--) {
        const emailCelda = datosEstacionamientos[i][2];
        const fechaCelda = datosEstacionamientos[i][3];
        const idCelda = datosEstacionamientos[i][0];
        
        if (emailCelda && emailCelda.toString().trim().toLowerCase() === emailAComparar) {
            const fechaReservaObj = parseDateSecure(fechaCelda);
            if (fechaReservaObj) {
                const fechaReservaComp = new Date(fechaReservaObj);
                fechaReservaComp.setHours(0, 0, 0, 0);
                
                if (fechaReservaComp >= hoyLimite) {
                    const fechaStr = formattedDate(fechaReservaObj);
                    if (!fechasParaProcesarCola.includes(fechaStr)) {
                        fechasParaProcesarCola.push(fechaStr);
                    }
                    
                    Logger.log("Cancelando reserva futura asignada para fecha " + fechaStr + " (ID: " + idCelda + ")");
                    // Eliminar fila
                    spreadsheetEstacionamientos.deleteRow(i + 1);
                    
                    // Eliminar del Historial
                    try {
                        const spreadsheetHistorial = obtenerHojaPrincipal().getSheetByName('Historial');
                        const indexHistorial = getIndexMatch(spreadsheetHistorial, "A2:A", idCelda);
                        if (indexHistorial.length > 0) {
                            spreadsheetHistorial.deleteRow(indexHistorial[0]);
                        }
                    } catch (errHistorial) {
                        Logger.log("No se pudo limpiar del Historial: " + errHistorial);
                    }
                    
                    // Enviar correo de cancelación de este cupo específico
                    const datosPersonaSimulado = [
                        idCelda, 
                        emailAComparar, 
                        nombreUsuario, 
                        fechaStr, 
                        datosEstacionamientos[i][4], // Turno
                        datosEstacionamientos[i][6]  // Patente
                    ];
                    try {
                        sendEmailcupoCancelacion(datosPersonaSimulado, "");
                    } catch (errEmail) {
                        Logger.log("Error al enviar correo de cancelación individual: " + errEmail);
                    }
                }
            }
        }
    }
    SpreadsheetApp.flush();
    
    // 5. Eliminar de la lista de espera ("Fila_Espera") las solicitudes futuras
    try {
        const spreadsheetFila = obtenerHojaPrincipal().getSheetByName('Fila_Espera');
        if (spreadsheetFila) {
            const datosFila = spreadsheetFila.getDataRange().getDisplayValues();
            for (let i = datosFila.length - 1; i >= 1; i--) {
                const emailCelda = datosFila[i][2];
                const fechaCelda = datosFila[i][3];
                const idCelda = datosFila[i][0];
                
                if (emailCelda && emailCelda.toString().trim().toLowerCase() === emailAComparar) {
                    const fechaReservaObj = parseDateSecure(fechaCelda);
                    if (fechaReservaObj) {
                        const fechaReservaComp = new Date(fechaReservaObj);
                        fechaReservaComp.setHours(0, 0, 0, 0);
                        
                        if (fechaReservaComp >= hoyLimite) {
                            Logger.log("Retirando de fila de espera futura para fecha " + formattedDate(fechaReservaObj) + " (ID: " + idCelda + ")");
                            retirarIdFila(idCelda);
                        }
                    }
                }
            }
        }
    } catch (errFila) {
        Logger.log("Error limpiando fila de espera: " + errFila);
    }
    SpreadsheetApp.flush();
    
    // 6. Reajustar colas/filas de espera para los días liberados
    for (const fechaStr of fechasParaProcesarCola) {
        try {
            Logger.log("Procesando cola para la fecha liberada: " + fechaStr);
            procesarFila(fechaStr);
        } catch (errProcesar) {
            Logger.log("Error al procesar fila para " + fechaStr + ": " + errProcesar);
        }
    }
    
    // 7. Sincronizar contadores de cupos
    try {
        actualizarCuposDisponibles();
    } catch (errCupos) {
        Logger.log("Error al actualizar cupos disponibles: " + errCupos);
    }
    SpreadsheetApp.flush();
    
    // 8. Enviar correo de penalización general al usuario
    try {
        sendEmailPenalizacion(emailAComparar, nombreUsuario, fechaFinStr);
        Logger.log("Proceso de penalización finalizado con éxito para " + emailAComparar);
    } catch (errEmailPenalizacion) {
        Logger.log("Error al enviar email general de penalización: " + errEmailPenalizacion);
    }
}

/**
 * Busca recursivamente en las hojas de datos el nombre completo asociado a un correo
 * @param {string} email - Correo del usuario a buscar
 * @returns {string} Nombre completo encontrado, o cadena vacía si no existe
 */
function buscarNombrePorEmail(email) {
    if (!email) return "";
    const emailAComparar = email.trim().toLowerCase();
    const ss = obtenerHojaPrincipal();
    
    // 1. Intentar buscar en Estacionamientos_Asignados (Columna C es Email, Columna B es Nombre)
    try {
        const sheet = ss.getSheetByName('Estacionamientos_Asignados');
        if (sheet) {
            const data = sheet.getDataRange().getValues();
            for (let i = data.length - 1; i >= 1; i--) {
                if (data[i][2] && data[i][2].toString().trim().toLowerCase() === emailAComparar && data[i][1]) {
                    return data[i][1];
                }
            }
        }
    } catch (e) {
        Logger.log("Error buscando nombre en Estacionamientos_Asignados: " + e);
    }
    
    // 2. Intentar buscar en Respuestas Reserva (Columna B es Email, Columna C es Nombre)
    try {
        const sheet = ss.getSheetByName('Respuestas Reserva');
        if (sheet) {
            const data = sheet.getDataRange().getValues();
            for (let i = data.length - 1; i >= 1; i--) {
                if (data[i][1] && data[i][1].toString().trim().toLowerCase() === emailAComparar && data[i][2]) {
                    return data[i][2];
                }
            }
        }
    } catch (e) {
        Logger.log("Error buscando nombre en Respuestas Reserva: " + e);
    }
    
    // 3. Intentar buscar en Fila_Espera (Columna C es Email, Columna B es Nombre)
    try {
        const sheet = ss.getSheetByName('Fila_Espera');
        if (sheet) {
            const data = sheet.getDataRange().getValues();
            for (let i = data.length - 1; i >= 1; i--) {
                if (data[i][2] && data[i][2].toString().trim().toLowerCase() === emailAComparar && data[i][1]) {
                    return data[i][1];
                }
            }
        }
    } catch (e) {
        Logger.log("Error buscando nombre en Fila_Espera: " + e);
    }
    
    return "";
}
