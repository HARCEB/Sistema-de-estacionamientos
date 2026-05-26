function asignarCupoAdmin() {
	var lock = LockService.getDocumentLock();
	try {
		lock.waitLock(60000); // Esperar un máximo de 30 segundos para adquirir el bloqueo
		const spreadsheetAdmin = obtenerHojaPrincipal().getSheetByName('ADMIN');
		if (spreadsheetAdmin.getRange("C2").isBlank()) {
			SpreadsheetApp.getUi().alert("Debes llenar los campos requeridos");
			return;
		}
		const nombre = normalizarNombre(spreadsheetAdmin.getRange("C2").getValue())
		const mail = spreadsheetAdmin.getRange("C3").getValue()
		if (spreadsheetAdmin.getRange("C4").isBlank()) {
			SpreadsheetApp.getUi().alert("Debes llenar los campos requeridos");
			return;
		}
		const fecha = spreadsheetAdmin.getRange("C4").getValue()
		if (spreadsheetAdmin.getRange("C5").isBlank()) {
			SpreadsheetApp.getUi().alert("Debes llenar los campos requeridos");
			return;
		}
		const hora = spreadsheetAdmin.getRange("C5").getValue()
		const patente = spreadsheetAdmin.getRange("C6").getValue()
		if (nombre.lenght == 0) {
			SpreadsheetApp.getUi().alert("Debes rellenar los campos requeridos");
			return
		}
		const cupoAsignado = verificarCupoEstacionamiento(formattedDate(fecha), hora)
		console.log(cupoAsignado)
		if (!cupoAsignado) {
			console.log("No hay cupos")
			const spreadsheetEstacionamientos = obtenerHojaPrincipal().getSheetByName('Estacionamientos_Asignados');
			// Se obtienen los IDs distintos a los asignados por Admin
			let personasAsignadas = spreadsheetEstacionamientos.getRange("D2:D").createTextFinder(formattedDate(fecha))
				.matchEntireCell(true)
				.findAll()
				.map(data => spreadsheetEstacionamientos.getRange(data.getRow(), 1)
					.getValue())
				.filter(id => !id.includes("admin"))
			if (personasAsignadas.length == 0) SpreadsheetApp.getUi().alert("No puedes asignar, no queda puestos, ya los asignaste todos");
			//Eliminará siempre la última persona que esté asignada y que no esté asignada por admin
			while (personasAsignadas.length > 0) {
				let personaActual = personasAsignadas.pop()
				console.log(personasAsignadas)
				console.log(personaActual)
				console.log(obtenerHoraDeId(personaActual))
				// Tiene hora todo el día o tiene la misma hora que necesita el admin, caso contrario sigue con la siguiente persona
				if ((obtenerHoraDeId(personaActual) != "PM" && obtenerHoraDeId(personaActual) != "AM") || obtenerHoraDeId(personaActual) == hora) {
					const cupoPersona = obtenerCupoDeId(personaActual)
					const nombrePersona = obtenerNombreDeId(personaActual)
					const mailPersona = obtenerMailDeId(personaActual)
					cancelarReservaAdmin(personaActual)
					console.log("El cupo asignado es " + cupoPersona)
					// Generar ID único
					const randomUnique = `admin-${Math.random().toString(36).slice(2)}-${Date.now()}`
					spreadsheetEstacionamientos.appendRow([randomUnique, nombre, mail, formattedDate(fecha), hora, cupoPersona, patente])
					SpreadsheetApp.flush(); // Consolidar la escritura antes de actualizar cupos
					const datosPersona = [randomUnique, mail, nombre, fecha, hora, patente]
					sendEmailcupoAsignado(datosPersona, cupoPersona)
					actualizarCuposDisponibles()
					spreadsheetAdmin.getRange("C2:C6").clearContent()
					SpreadsheetApp.getUi().alert("Cupo cancelado a: " + nombrePersona + " (" + mailPersona + ") \n Se asigna el cupo " + cupoPersona + " a " + nombre + " (" + mail + ")")
					break
				}
			}
			//if (personas_asignadas.length == 0) SpreadsheetApp.getUi().alert("No puedes asignar, no queda puestos, ya los asignaste todos");
		} else {
			console.log("Hay cupos disponibles, no es necesario quitar hora a un usuario")
			console.log("El cupo asignado es " + cupoAsignado.toUpperCase())
			const spreadsheetEstacionamientos = obtenerHojaPrincipal().getSheetByName('Estacionamientos_Asignados');
			const randomUnique = `admin-${Math.random().toString(36).slice(2)}-${Date.now()}`
			spreadsheetEstacionamientos.appendRow([randomUnique, nombre, mail, formattedDate(fecha), hora, cupoAsignado.toUpperCase(), patente])
			SpreadsheetApp.flush(); // Consolidar la escritura antes de actualizar cupos
			SpreadsheetApp.getUi().alert("Se asigna el cupo " + cupoAsignado.toUpperCase() + " a " + nombre + " (" + mail + ")")
			const datosPersona = [randomUnique, mail, nombre, fecha, hora, patente]
			sendEmailcupoAsignado(datosPersona, cupoAsignado.toUpperCase())
			actualizarCuposDisponibles()
			spreadsheetAdmin.getRange("C2:C6").clearContent()
			SpreadsheetApp.getUi().alert("Se asigna el cupo " + cupoAsignado.toUpperCase() + " a " + nombre + " (" + mail + ")")
		}
	} finally {
		lock.releaseLock();
	}
}

function cancelarReservaUI() {
	var lock = LockService.getDocumentLock();
	try {
		lock.waitLock(60000); // Esperar un máximo de 30 segundos para adquirir el bloqueo
		const spreadsheetAdmin = obtenerHojaPrincipal().getSheetByName('ADMIN');
		if (spreadsheetAdmin.getRange("C11").isBlank()) {
			SpreadsheetApp.getUi().alert("Debes llenar los campos requeridos");
			return;
		}
		const id = spreadsheetAdmin.getRange("C11").getValue()
		if (!checkIdCancelar(id)) {
			SpreadsheetApp.getUi().alert('Error, Id inválido');
			return;
		}
		// Obtener datos del usuario para el correo de cancelación
		const spreadsheetRespuestas = obtenerHojaPrincipal().getSheetByName('Respuestas Reserva');
		const datosPersona = spreadsheetRespuestas.getRange("A2:A").createTextFinder(id)
			.matchEntireCell(true)
			.findAll().map(data => spreadsheetRespuestas.getSheetValues(data.getRow(), 1, 1, 7)[0])[0]
		// Si la reserva estaba en la fila, sólo se elimina de la fila y se envía correo
		if (retirarIdFila(id)) {
			if (datosPersona) sendEmailcupoCancelacion(datosPersona, "")
			SpreadsheetApp.getUi().alert("Id estaba en la fila");
			return;
		};
		// Caso contrario, debe eliminar el puesto del estacionamiento asignado y procesar la cola
		//Eliminar puesto asignado 
		const spreadsheetEstacionamientos = obtenerHojaPrincipal().getSheetByName('Estacionamientos_Asignados');
		let puestoAsignadoIndice = getIndexMatch(spreadsheetEstacionamientos, "A2:A", id)
		if (puestoAsignadoIndice.length == 0) {
			SpreadsheetApp.getUi().alert("Reserva ya estaba cancelada");
			return;
		}
		const fechaReserva = spreadsheetEstacionamientos.getRange(puestoAsignadoIndice, 4).getDisplayValue()
		spreadsheetEstacionamientos.deleteRow(puestoAsignadoIndice[0])
		//Eliminar del Historial
		spreadsheetHistorial = obtenerHojaPrincipal().getSheetByName('Historial');
		puestoAsignadoIndice = getIndexMatch(spreadsheetHistorial, "A2:A", id)
		if (puestoAsignadoIndice.length > 0) spreadsheetHistorial.deleteRow(puestoAsignadoIndice[0])
		
		// Confirmar las eliminaciones en el spreadsheet
		SpreadsheetApp.flush();
		
		// Procesar Fila
		procesarFila(fechaReserva)
		// Actualizar Cupos Disponibles
		actualizarCuposDisponibles()
		
		// Confirmar actualizaciones
		SpreadsheetApp.flush();
		
		// Enviar correo de cancelación al usuario (SOLO después de confirmar los cambios)
		if (datosPersona) sendEmailcupoCancelacion(datosPersona, "")
		spreadsheetAdmin.getRange("C11").clearContent()
	} finally {
		lock.releaseLock();
	}
}


function cancelarReservaAdmin(id) {
	Logger.log("El admin cancela reserva ID " + id)
	//Eliminar puesto asignado 
	const spreadsheetEstacionamientos = obtenerHojaPrincipal().getSheetByName('Estacionamientos_Asignados');
	let puestoAsignadoIndex = getIndexMatch(spreadsheetEstacionamientos, "A2:A", id)
	spreadsheetEstacionamientos.deleteRow(puestoAsignadoIndex[0])
	//Eliminar del Historial
	const spreadsheetHistorial = obtenerHojaPrincipal().getSheetByName('Historial');
	puestoAsignadoIndex = getIndexMatch(spreadsheetHistorial, "A2:A", id)
	if (puestoAsignadoIndex.length > 0) spreadsheetHistorial.deleteRow(puestoAsignadoIndex[0])
	
	// Confirmar los cambios de eliminación físicamente en la hoja antes de proceder
	SpreadsheetApp.flush();
	
	// Enviar Correo que canceló el admin
	const spreadsheetRespuestas = obtenerHojaPrincipal().getSheetByName('Respuestas Reserva');
	const datosPersona = spreadsheetRespuestas.getRange("A2:A").createTextFinder(id)
		.matchEntireCell(true)
		.findAll().map(data => spreadsheetRespuestas.getSheetValues(data.getRow(), 1, 1, 7)[0])[0]
	sendEmailcupoCancelacion(datosPersona, "")
}

function eliminarFilaAdmin() {
	var lock = LockService.getDocumentLock();
	try {
		lock.waitLock(60000); // Esperar un máximo de 30 segundos para adquirir el bloqueo
		const spreadsheetAdmin = obtenerHojaPrincipal().getSheetByName('ADMIN');
		const ID = spreadsheetAdmin.getRange("C11").getValue()
		if (spreadsheetAdmin.getRange("C11").isBlank()) {
			SpreadsheetApp.getUi().alert("Debes llenar los campos requeridos");
			return;
		}
		retirarIdFila(ID) ? SpreadsheetApp.getUi().alert("ID " + ID + " eliminado con éxito de la fila") : SpreadsheetApp.getUi().alert("ID " + ID + " no encontrado")
		spreadsheetAdmin.getRange("C11").clearContent()
	} finally {
		lock.releaseLock();
	}
}