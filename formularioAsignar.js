// Función que genera ID único a cada solicitud enviada en formulario y retorna el ID
function setUniqueId(e) {
	try {
		// Generar el identificador único
		const randomUnique = `buker-${Math.random().toString(36).slice(2)}-${Date.now()}`

		// Obtener la hoja de respuestas
		const spreadsheetRespuestas = obtenerHojaPrincipal().getSheetByName('Respuestas Reserva')

		// CORRECCIÓN: Usar e.range.getRow() en lugar de getLastRow()
		// Esto obtiene la fila EXACTA donde el formulario escribió los datos
		const row = e.range.getRow()

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
		spreadsheetRespuestas.getRange(row, 1).setValue(randomUnique)

		// Forzar flush para asegurar que el ID y los datos normalizados se guarden físicamente
		SpreadsheetApp.flush();

		Logger.log(`[setUniqueId] ID asignado: ${randomUnique}`);

		// NUEVO: Encolar la asignación en lugar de ejecutarla directamente
		// Esto evita bloquear el trigger del formulario
		Logger.log(`[setUniqueId] Encolando asignación de estacionamiento...`);
		const resultado = encolarAsignacionCupo(randomUnique, null, null, 'formulario_reserva');

		if (resultado.success) {
			Logger.log(`[setUniqueId] ✓ Asignación encolada exitosamente`);
			Logger.log(`[setUniqueId]   Request ID: ${resultado.requestId}`);
			Logger.log(`[setUniqueId]   Posición en cola: ${resultado.positionInQueue}`);
			Logger.log(`[setUniqueId]   Será procesada en máximo 20 minutos`);
		} else {
			Logger.log(`[setUniqueId] ✗ Error al encolar: ${resultado.error}`);
			// Fallback: ejecutar directamente si falla el encolamiento
			Logger.log(`[setUniqueId] Ejecutando asignación directamente como fallback...`);
			asignarEstacionamiento(randomUnique);
		}
	} catch (error) {
		Logger.log(`[setUniqueId] ERROR: ${error.toString()}`);
		throw error;
	}
}


// Función que asigna un estacionamiento en base al ID
function asignarEstacionamiento(id) {
    try {
        const spreadsheetRespuestas = obtenerHojaPrincipal().getSheetByName('Respuestas Reserva');
        Logger.log("Procesando ID: " + id);
        
        // 1. LA MAGIA: Buscamos la fila exacta
        const busqueda = spreadsheetRespuestas.getRange("A:A").createTextFinder(id).matchEntireCell(true).findAll();
        
        if (busqueda.length == 0) {
            Logger.log("No se encontraron coincidencias con id " + id);
            return;
        }
        
        const fila = busqueda[0].getRow();
        
        // 2. EXTRAEMOS COMO TEXTO VISUAL (getDisplayValues) PARA EVITAR EL SALTO DE DÍAS
        const datosPersona = spreadsheetRespuestas.getRange(fila, 1, 1, 7).getDisplayValues()[0];
        const fechaReservaTexto = datosPersona[3]; // Ahora esto es un texto seguro como "5/5/2026"
        
        // Verificar Usuario baneado
        if (verificarBan(datosPersona[1])) {
            sendEmailBaneo(datosPersona);
            return;
        }
        
        // 3. Verificar si puede pedir estacionamiento
        const verificacion = verificarRestriccionUsuario(datosPersona[1], fechaReservaTexto);
        
        if (verificacion.success) {
            Logger.log("Puede pedir");

            const cupoAsignado = verificarCupoEstacionamiento(fechaReservaTexto, datosPersona[4]);
            
            if (cupoAsignado === false) {
                Logger.log("No hay cupos, se envía a fila de espera");
                enviarFilaEsperaFormulario(datosPersona[0]); // Aquí ya usará el texto seguro
                sendEmailListaEspera(datosPersona);
            } else {
                Logger.log("El cupo asignado es " + cupoAsignado);
                const spreadsheetEstacionamientos = obtenerHojaPrincipal().getSheetByName('Estacionamientos_Asignados');
                const patenteUpperCase = String(datosPersona[5]).toUpperCase();
                
                spreadsheetEstacionamientos.appendRow([datosPersona[0], datosPersona[2], datosPersona[1], fechaReservaTexto, datosPersona[4], cupoAsignado, patenteUpperCase]);
                
                // IMPORTANTE: Forzar flush inmediato para consolidar la reserva físicamente
                SpreadsheetApp.flush();
                
                if (matchCell(spreadsheetEstacionamientos, "A2:A", 1, id).length == 1) {
                    const spreadsheetHistorial = obtenerHojaPrincipal().getSheetByName('Historial');
                    spreadsheetHistorial.appendRow([datosPersona[0], datosPersona[1], fechaReservaTexto]);
                    
                    // Sincronizar historial
                    SpreadsheetApp.flush();
                    
                    sendEmailcupoAsignado(datosPersona, cupoAsignado);
                } else {
                    sendEmailNoPuede(datosPersona, "Hubo un error interno al procesar tu reserva. Por favor intenta nuevamente.");
                }
            }

        } else {
            Logger.log("No puede pedir: " + verificacion.reason);
            sendEmailNoPuede(datosPersona, verificacion.reason);
        }

        // Actualizar cupos visuales
        try { actualizarCuposPorFecha(fechaReservaTexto); } catch (e) {}
        
    } catch (error) {
        Logger.log("Error en asignarEstacionamiento: " + error.toString());
        throw error;
    }
}