// ============================================================================
// MÓDULO DE RECEPCIÓN Y ASIGNACIÓN DE FORMULARIOS (REFACTORIZADO SRP)
// ============================================================================

/**
 * Función ejecutada por el trigger del Formulario para asignar ID único y encolar
 */
function setUniqueId(e) {
	try {
		const randomUnique = `buker-${Math.random().toString(36).slice(2)}-${Date.now()}`;
		const spreadsheetRespuestas = obtenerHojaPrincipal().getSheetByName('Respuestas Reserva');
		const row = e.range.getRow();

		Logger.log(`[setUniqueId] Procesando fila ${row} con ID ${randomUnique}`);

		// Normalizar nombre (columna 3)
		const nombre = spreadsheetRespuestas.getRange(row, 3).getValue();
		if (nombre) {
			spreadsheetRespuestas.getRange(row, 3).setValue(normalizarNombre(nombre));
		}

		// Convertir patente a mayúsculas (columna 6)
		const patente = spreadsheetRespuestas.getRange(row, 6).getValue();
		if (patente) {
			spreadsheetRespuestas.getRange(row, 6).setValue(String(patente).toUpperCase());
		}

		// Asignar ID único
		spreadsheetRespuestas.getRange(row, 1).setValue(randomUnique);
		SpreadsheetApp.flush();

		Logger.log(`[setUniqueId] ID asignado: ${randomUnique}`);
		Logger.log(`[setUniqueId] Encolando asignación de estacionamiento...`);

		const resultado = encolarAsignacionCupo(randomUnique, null, null, 'formulario_reserva');

		if (resultado.success) {
			Logger.log(`[setUniqueId] ✓ Asignación encolada exitosamente (Request ID: ${resultado.requestId})`);
		} else {
			Logger.log(`[setUniqueId] ✗ Error al encolar, ejecutando fallback directo...`);
			asignarEstacionamiento(randomUnique);
		}
	} catch (error) {
		Logger.log(`[setUniqueId] ERROR: ${error.toString()}`);
		throw error;
	}
}

/**
 * Función principal para asignar un estacionamiento en base al ID
 */
function asignarEstacionamiento(id) {
    try {
        const hojaPrincipal = obtenerHojaPrincipal();
        const spreadsheetEstacionamientos = hojaPrincipal.getSheetByName('Estacionamientos_Asignados');
        
        // Evitar asignación duplicada en reintentos
        const coincidenciaAsignado = getIndexMatch(spreadsheetEstacionamientos, "A2:A", id);
        if (coincidenciaAsignado.length > 0) {
            Logger.log("El ID " + id + " ya está asignado en Estacionamientos_Asignados. Evitando duplicación.");
            return;
        }

        Logger.log("Procesando ID: " + id);
        const datosPersona = obtenerSolicitudPorId(id);
        if (!datosPersona) {
            Logger.log("No se encontraron coincidencias con id " + id);
            return;
        }
        
        const fechaReservaTexto = datosPersona[3];
        
        // Verificar Usuario baneado
        if (verificarBan(datosPersona[1])) {
            sendEmailBaneo(datosPersona);
            return;
        }
        
        // Verificar restricciones del usuario
        const verificacion = verificarRestriccionUsuario(datosPersona[1], fechaReservaTexto, id);
        
        if (verificacion.success) {
            Logger.log("Usuario autorizado para solicitar");
            const cupoAsignado = verificarCupoEstacionamiento(fechaReservaTexto, datosPersona[4]);
            
            if (cupoAsignado === false) {
                Logger.log("Sin cupos libres, enviando a fila de espera");
                enviarFilaEsperaFormulario(datosPersona[0]);
                sendEmailListaEspera(datosPersona);
            } else {
                Logger.log("Cupo asignado: " + cupoAsignado);
                procesarAsignacionDirecta(datosPersona, fechaReservaTexto, cupoAsignado, id);
            }
        } else {
            Logger.log("Solicitud rechazada: " + verificacion.reason);
            sendEmailNoPuede(datosPersona, verificacion.reason);
        }

        // Actualizar tabla de disponibilidad
        try { actualizarCuposPorFecha(fechaReservaTexto); } catch (e) {}
        
    } catch (error) {
        Logger.log("Error en asignarEstacionamiento: " + error.toString());
        throw error;
    }
}

// ============================================================================
// FUNCIONES AUXILIARES DE RESPONSABILIDAD ÚNICA (SRP)
// ============================================================================

/**
 * 1. Obtiene los datos de la solicitud por ID desde la hoja 'Respuestas Reserva'
 */
function obtenerSolicitudPorId(id) {
    const spreadsheetRespuestas = obtenerHojaPrincipal().getSheetByName('Respuestas Reserva');
    const busqueda = spreadsheetRespuestas.getRange("A:A").createTextFinder(id).matchEntireCell(true).findAll();
    
    if (busqueda.length === 0) return null;
    
    const fila = busqueda[0].getRow();
    return spreadsheetRespuestas.getRange(fila, 1, 1, 7).getDisplayValues()[0];
}

/**
 * 2. Escribe el cupo asignado en 'Estacionamientos_Asignados' e 'Historial' y envía el correo
 */
function procesarAsignacionDirecta(datosPersona, fechaReservaTexto, cupoAsignado, id) {
    const spreadsheetEstacionamientos = obtenerHojaPrincipal().getSheetByName('Estacionamientos_Asignados');
    const patenteUpperCase = String(datosPersona[5]).toUpperCase();
    
    spreadsheetEstacionamientos.appendRow([
        datosPersona[0], 
        datosPersona[2], 
        datosPersona[1], 
        fechaReservaTexto, 
        datosPersona[4], 
        cupoAsignado, 
        patenteUpperCase
    ]);
    
    SpreadsheetApp.flush();
    
    if (matchCell(spreadsheetEstacionamientos, "A2:A", 1, id).length === 1) {
        const spreadsheetHistorial = obtenerHojaPrincipal().getSheetByName('Historial');
        spreadsheetHistorial.appendRow([datosPersona[0], datosPersona[1], fechaReservaTexto]);
        SpreadsheetApp.flush();
        sendEmailcupoAsignado(datosPersona, cupoAsignado);
    } else {
        sendEmailNoPuede(datosPersona, "Hubo un error interno al procesar tu reserva. Por favor intenta nuevamente.");
    }
}