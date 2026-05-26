function retirarIdFila(id) {
	try {
		const spreadsheetFila = obtenerHojaPrincipal().getSheetByName('Fila_Espera');
		const data = spreadsheetFila.getDataRange().getValues();
		
		let rowIndex = -1;
		let puestoNumero = -1;
		let dia = "";
		const idLimpio = id.toString().trim();
		
		// Encontrar el usuario
		for (let i = 1; i < data.length; i++) {
			if (data[i][0] && data[i][0].toString().trim() === idLimpio) {
				rowIndex = i;
				dia = data[i][3];
				puestoNumero = Number(data[i][6]);
				break;
			}
		}
		
		if (rowIndex === -1) return false;
		
		Logger.log("El puesto a eliminar es " + puestoNumero + " con indice " + (rowIndex + 1));
		
		// Obtener todos los puestos para actualizar posiciones (Operación en Batch)
		const numRowsToUpdate = data.length - 1;
		if (numRowsToUpdate > 0) {
		    const puestosRange = spreadsheetFila.getRange(2, 7, numRowsToUpdate, 1);
		    const puestosValores = puestosRange.getValues();
		    let changed = false;
		    
		    for (let i = 1; i < data.length; i++) {
		        if (data[i][3] === dia) {
		            let currentPuesto = Number(puestosValores[i - 1][0]);
		            if (currentPuesto > puestoNumero) {
		                puestosValores[i - 1][0] = currentPuesto - 1;
		                changed = true;
		            }
		        }
		    }
		    
		    if (changed) {
		        puestosRange.setValues(puestosValores);
		    }
		}
		
		spreadsheetFila.deleteRow(rowIndex + 1);
		SpreadsheetApp.flush(); // Asegurar la sincronización física de la hoja
		return true;
	} catch (error) {
		Logger.log("Error en retirarIdFila: " + error);
		return false;
	}
}

/**
 * Función wrapper para retirar ID de fila desde Web App
 * Devuelve respuesta estructurada para mostrar al usuario
 */
function retirarIdFilaWebApp(id) {
	try {
		// Obtener datos ANTES de eliminar para enviar email
		const spreadsheetRespuestas = obtenerHojaPrincipal().getSheetByName('Respuestas Reserva');
		const datosPersona = spreadsheetRespuestas.getRange("A2:A").createTextFinder(id)
			.matchEntireCell(true)
			.findAll()
			.map(data => spreadsheetRespuestas.getSheetValues(data.getRow(), 1, 1, 7)[0])[0]
		
		const resultado = retirarIdFila(id);
		
		if (resultado) {
			// Envía email de confirmación
			if (datosPersona && datosPersona.length > 0) {
				sendEmailCancelacionFilaEspera(datosPersona);
			}
			return { success: true, message: "Solicitud en fila de espera cancelada exitosamente. Se le ha enviado un email de confirmación." };
		} else {
			return { success: false, message: "No se encontró la solicitud en la fila de espera" };
		}
	} catch (error) {
		Logger.log("Error en retirarIdFilaWebApp: " + error);
		return { success: false, message: "Error al procesar la cancelación: " + error };
	}
}


function enviarFilaEsperaFormulario(id) {
  const spreadsheetRespuestas = obtenerHojaPrincipal().getSheetByName('Respuestas Reserva');
  const respuestasData = spreadsheetRespuestas.getDataRange().getDisplayValues();
  const idLimpio = id.toString().trim();
  
  let filaDatos = null;
  for (let i = 1; i < respuestasData.length; i++) {
    if (respuestasData[i][0] && respuestasData[i][0].toString().trim() === idLimpio) {
      filaDatos = respuestasData[i];
      break;
    }
  }
  
  if (!filaDatos) return; 

  const ID = filaDatos[0];
  const EMAIL = filaDatos[1];
  const NOMBRE = normalizarNombre(filaDatos[2]);
  const FECHA = filaDatos[3]; // Ahora FECHA es un texto seguro
  const HORA = filaDatos[4];
  const PATENTE = String(filaDatos[5]).toUpperCase();

  const spreadsheetFila = obtenerHojaPrincipal().getSheetByName('Fila_Espera');
  const filaData = spreadsheetFila.getDataRange().getValues();
  
  let maxPuesto = 0;
  let ultimaFilaReal = 1;
  
  for (let i = 0; i < filaData.length; i++) {
    if (filaData[i][0] !== "") {
      ultimaFilaReal = i + 1;
    }
    // Buscamos si hay otras personas para la misma FECHA
    if (filaData[i][3] && filaData[i][3].toString() === FECHA.toString()) {
      let puesto = Number(filaData[i][6]);
      if (!isNaN(puesto) && puesto > maxPuesto) {
        maxPuesto = puesto;
      }
    }
  }
  
  maxPuesto += 1;

  spreadsheetFila.getRange(ultimaFilaReal + 1, 1, 1, 7).setValues([[ID, NOMBRE, EMAIL, FECHA, HORA, PATENTE, maxPuesto]]);
  SpreadsheetApp.flush(); // Asegurar la sincronización física de la hoja inmediatamente
}

// Función auxiliar que procesa fila cuando se cancela la reserva
function procesarFila(fecha) {
	Logger.log("=== PROCESANDO FILA DE ESPERA ===");
	Logger.log("Fecha: " + fecha);

	const spreadsheetFila = obtenerHojaPrincipal().getSheetByName('Fila_Espera');
	const displayData = spreadsheetFila.getDataRange().getDisplayValues();
	
	let filaEspera = [];
	for (let i = 1; i < displayData.length; i++) {
	    if (displayData[i][3] === fecha) {
	        filaEspera.push({
	            index: i + 1,
	            puesto: Number(displayData[i][6]),
	            id: displayData[i][0],
	            nombre: displayData[i][1],
	            fecha: displayData[i][3],
	            hora: displayData[i][4]
	        });
	    }
	}
	
	// Ordenar por puesto
	filaEspera.sort((a, b) => a.puesto - b.puesto);

	Logger.log("Personas en fila: " + filaEspera.length);
	if (filaEspera.length === 0) {
		Logger.log("No hay nadie en la fila de espera para esta fecha");
		return;
	}

	for (const elemento of filaEspera) {
		Logger.log(`\nProcesando puesto #${elemento.puesto}: ${elemento.nombre} (${elemento.id})`);
		Logger.log(`  Fecha: ${elemento.fecha}, Hora: ${elemento.hora}`);

		let existeCupo = verificarCupoEstacionamiento(elemento.fecha, elemento.hora);
		Logger.log(`  ¿Hay cupo disponible? ${existeCupo ? 'SÍ - ' + existeCupo : 'NO'}`);

		if (existeCupo) {
			Logger.log(`  ✓ Asignando cupo ${existeCupo} a ${elemento.nombre}`);
			asignarEstacionamiento(elemento.id);
			retirarIdFila(elemento.id);
			Logger.log(`  ✓ Fila procesada exitosamente para ${elemento.nombre}`);
			break; // Sale del bucle para asegurar que el siguiente cupo se procese limpiamente en otra ejecución
		} else {
			Logger.log(`  ✗ No hay cupo disponible, continuando con siguiente persona`);
		}
	}

	Logger.log("=== FIN PROCESAMIENTO FILA ===\n");
	return;
}

function test_procesar() {
	procesarFila("29/3/2024")
}


// Obtiene número de puesto de un ID en una cola
function getNumeroCola(id) {
	const spreadsheetFila = obtenerHojaPrincipal().getSheetByName('Fila_Espera');
	const data = spreadsheetFila.getDataRange().getDisplayValues();
	const idLimpio = id.toString().trim();
	
	for (let i = 1; i < data.length; i++) {
	    if (data[i][0] && data[i][0].toString().trim() === idLimpio) {
	        return data[i][6];
	    }
	}
	return null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOLUCIÓN AL PROBLEMA DE FILAS DE ESPERA
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PROBLEMA: Las filas solo se procesan cuando alguien cancela, causando que
 * personas queden "atoradas" en fila indefinidamente mientras hay cupos vacíos.
 * 
 * SOLUCIÓN: Procesamiento automático cada hora que revisa TODAS las filas
 * pendientes y asigna cupos disponibles.
 * 
 * Para instalar: Ejecutar instalaTriggerProcesamientoAutomatico() UNA VEZ
 * 
 * Fecha: 18/12/2025
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Procesa automáticamente TODAS las filas de espera pendientes
 * Esta función es ejecutada por un trigger cada hora
 * 
 * IMPORTANTE: Esta es la SOLUCIÓN PRINCIPAL al problema de filas atoradas
 */
function procesarTodasLasFilasAutomatico() {
	var lock = LockService.getDocumentLock();
	var lockAcquired = false;
	try {
		if (!lock.tryLock(30000)) {
			Logger.log("ℹ️ Sistema ocupado, saltando procesamiento automático de filas");
			return {procesadas: 0, asignadas: 0, mensaje: "Sistema ocupado"};
		}
		lockAcquired = true;

		Logger.log("╔══════════════════════════════════════════════════════════════╗");
		Logger.log("║   🤖 PROCESAMIENTO AUTOMÁTICO DE FILAS DE ESPERA            ║");
		Logger.log("╚══════════════════════════════════════════════════════════════╝");
		Logger.log(`⏰ Hora de ejecución: ${new Date().toString()}\n`);
		
		const inicio = Date.now();
		
		// Obtener todas las fechas únicas en la fila de espera
		const spreadsheetFila = obtenerHojaPrincipal().getSheetByName('Fila_Espera');
		const lastRow = spreadsheetFila.getLastRow();
		const numRows = lastRow > 1 ? lastRow - 1 : 0; // Restar 1 por el header

		if (numRows === 0) {
			Logger.log("✅ No hay personas en fila de espera");
			Logger.log("════════════════════════════════════════════════════════════════\n");
			return {procesadas: 0, asignadas: 0, mensaje: "No hay filas pendientes"};
		}

		const todasLasFechas = spreadsheetFila.getRange(2, 4, numRows, 1) // D2:D{lastRow}
			.getValues()
			.flat()
			.filter(fecha => fecha !== "")
			.map(fecha => {
				if (fecha instanceof Date) {
					return formattedDate(fecha);
				}
				return fecha;
			});
		
		// Eliminar duplicados
		const fechasUnicas = [...new Set(todasLasFechas)];
		
		Logger.log(`📅 Fechas con personas en fila: ${fechasUnicas.length}`);
		
		if (fechasUnicas.length === 0) {
			Logger.log("✅ No hay personas en fila de espera");
			Logger.log("════════════════════════════════════════════════════════════════\n");
			return {procesadas: 0, asignadas: 0, mensaje: "No hay filas pendientes"};
		}
		
		let procesadas = 0;
		let personasAsignadas = 0;
		let errores = 0;
		
		// Procesar cada fecha
		fechasUnicas.forEach(fecha => {
			try {
				Logger.log(`\n📆 Procesando fecha: ${fecha}`);
				
				// Contar personas antes
				const antesIndices = getIndexMatch(spreadsheetFila, "D2:D", fecha);
				const personasAntes = antesIndices.length;
				
				// Procesar la fila
				procesarFila(fecha);
				
				// Contar personas después
				const despuesIndices = getIndexMatch(spreadsheetFila, "D2:D", fecha);
				const personasDespues = despuesIndices.length;
				const asignadas = personasAntes - personasDespues;
				
				Logger.log(`   Antes: ${personasAntes} | Después: ${personasDespues} | Asignadas: ${asignadas}`);
				
				procesadas++;
				personasAsignadas += asignadas;
				
			} catch (error) {
				Logger.log(`   ❌ ERROR al procesar ${fecha}: ${error.toString()}`);
				errores++;
			}
		});
		
		// Actualizar cupos disponibles
		Logger.log("\n📊 Actualizando cupos disponibles...");
		try {
			actualizarCuposDisponibles();
			Logger.log("✅ Cupos actualizados");
		} catch (error) {
			Logger.log(`⚠️ Error al actualizar cupos: ${error.toString()}`);
		}
		
		const tiempo = ((Date.now() - inicio) / 1000).toFixed(2);
		
		Logger.log("\n╔══════════════════════════════════════════════════════════════╗");
		Logger.log("║                    RESUMEN EJECUCIÓN                         ║");
		Logger.log("╚══════════════════════════════════════════════════════════════╝");
		Logger.log(`📊 Fechas procesadas: ${procesadas}/${fechasUnicas.length}`);
		Logger.log(`✅ Personas asignadas: ${personasAsignadas}`);
		Logger.log(`❌ Errores: ${errores}`);
		Logger.log(`⏱️  Tiempo: ${tiempo}s`);
		Logger.log("════════════════════════════════════════════════════════════════\n");
		
		return {
			procesadas: procesadas,
			asignadas: personasAsignadas,
			errores: errores,
			tiempo: tiempo
		};
		
	} catch (error) {
		Logger.log(`\n❌ ERROR CRÍTICO: ${error.toString()}`);
		Logger.log(`Stack: ${error.stack}`);
		Logger.log("════════════════════════════════════════════════════════════════\n");
		throw error;
	} finally {
		if (lockAcquired) {
			lock.releaseLock();
		}
	}
}

/**
 * Instala el trigger automático que procesa las filas cada hora
 * 
 * EJECUTAR ESTA FUNCIÓN UNA SOLA VEZ para activar el procesamiento automático
 * 
 * @returns {Object} Resultado de la instalación
 */
function instalaTriggerProcesamientoAutomatico() {
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
		Logger.log("   Si quieres reinstalarlo, primero ejecuta: desinstalaTriggerProcesamientoAutomatico()");
		Logger.log("\n════════════════════════════════════════════════════════════════\n");
		return {instalado: false, razon: 'Ya existe'};
	}
	
	try {
		// Crear trigger que se ejecuta cada hora
		ScriptApp.newTrigger('procesarTodasLasFilasAutomatico')
			.timeBased()
			.everyHours(1)
			.create();
		
		Logger.log("✅ Trigger instalado exitosamente\n");
		Logger.log("⏰ Frecuencia: Cada 1 hora");
		Logger.log("📋 Función: procesarTodasLasFilasAutomatico()");
		Logger.log("\n💡 El trigger procesará automáticamente TODAS las filas");
		Logger.log("   pendientes cada hora, sin depender de cancelaciones.\n");
		Logger.log("🔍 Para verificar:");
		Logger.log("   1. Ejecuta: verTriggersActivos()");
		Logger.log("   2. Ve a Apps Script → Ejecuciones (después de 1 hora)");
		Logger.log("\n════════════════════════════════════════════════════════════════\n");
		
		return {instalado: true, frecuencia: "cada 1 hora"};
		
	} catch (error) {
		Logger.log(`❌ ERROR al instalar trigger: ${error.toString()}`);
		Logger.log("\n════════════════════════════════════════════════════════════════\n");
		return {instalado: false, error: error.toString()};
	}
}

/**
 * Desinstala el trigger automático de procesamiento de filas
 * 
 * Solo usar si necesitas detener el procesamiento automático
 */
function desinstalaTriggerProcesamientoAutomatico() {
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
		Logger.log("⚠️  Las filas ahora solo se procesarán en cancelaciones");
	} else {
		Logger.log("ℹ️  No se encontraron triggers de procesamiento automático");
	}
	
	Logger.log("\n════════════════════════════════════════════════════════════════\n");
	
	return {eliminados: eliminados};
}

/**
 * Muestra todos los triggers activos en el proyecto
 * 
 * Útil para verificar que el trigger automático está instalado
 */
function verTriggersActivos() {
	Logger.log("╔══════════════════════════════════════════════════════════════╗");
	Logger.log("║              TRIGGERS ACTIVOS EN EL PROYECTO                 ║");
	Logger.log("╚══════════════════════════════════════════════════════════════╝\n");
	
	const triggers = ScriptApp.getProjectTriggers();
	
	if (triggers.length === 0) {
		Logger.log("❌ NO HAY TRIGGERS INSTALADOS");
		Logger.log("\n════════════════════════════════════════════════════════════════\n");
		return {total: 0, triggers: []};
	}
	
	Logger.log(`Total de triggers: ${triggers.length}\n`);
	
	const resultado = [];
	
	triggers.forEach((trigger, index) => {
		const func = trigger.getHandlerFunction();
		const tipo = trigger.getEventType().toString();
		const id = trigger.getUniqueId();
		
		Logger.log(`Trigger #${index + 1}:`);
		Logger.log(`  Función: ${func}`);
		Logger.log(`  Tipo: ${tipo}`);
		Logger.log(`  ID: ${id}`);
		
		if (func === 'procesarTodasLasFilasAutomatico') {
			Logger.log(`  ✅ TRIGGER DE PROCESAMIENTO AUTOMÁTICO`);
		} else if (func === 'onFormSubmitDispatcher') {
			Logger.log(`  ✅ TRIGGER DE FORMULARIOS`);
		}
		
		Logger.log("");
		
		resultado.push({funcion: func, tipo: tipo, id: id});
	});
	
	// Verificación
	const tieneAutomatico = resultado.some(t => t.funcion === 'procesarTodasLasFilasAutomatico');
	const tieneFormulario = resultado.some(t => t.funcion === 'onFormSubmitDispatcher');
	
	Logger.log("📋 Verificación:");
	if (tieneAutomatico) {
		Logger.log("   ✅ Trigger de procesamiento automático: INSTALADO");
	} else {
		Logger.log("   ❌ Trigger de procesamiento automático: NO INSTALADO");
		Logger.log("      → Ejecuta: instalaTriggerProcesamientoAutomatico()");
	}
	
	if (tieneFormulario) {
		Logger.log("   ✅ Trigger de formularios: INSTALADO");
	} else {
		Logger.log("   ⚠️  Trigger de formularios: NO INSTALADO");
		Logger.log("      → Ejecuta: configurarTriggerDispatcher()");
	}
	
	Logger.log("\n════════════════════════════════════════════════════════════════\n");
	
	return {total: triggers.length, triggers: resultado};
}

/**
 * Diagnóstico rápido del estado de las filas de espera
 * 
 * Muestra cuántas personas hay en fila y para qué fechas
 */
function diagnosticarFilasEspera() {
	Logger.log("╔══════════════════════════════════════════════════════════════╗");
	Logger.log("║        DIAGNÓSTICO DE FILAS DE ESPERA                        ║");
	Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

	const spreadsheetFila = obtenerHojaPrincipal().getSheetByName('Fila_Espera');
	const lastRow = spreadsheetFila.getLastRow();
	const numRows = lastRow > 1 ? lastRow - 1 : 0;

	if (numRows === 0) {
		Logger.log("✅ No hay personas en fila de espera");
		Logger.log("════════════════════════════════════════════════════════════════\n");
		return {total: 0, porFecha: {}};
	}

	const datos = spreadsheetFila.getRange(2, 1, numRows, 7).getValues().filter(row => row[0] !== "");
	
	Logger.log(`📋 Total de personas en fila: ${datos.length}\n`);
	
	if (datos.length === 0) {
		Logger.log("✅ No hay personas en fila de espera");
		Logger.log("════════════════════════════════════════════════════════════════\n");
		return {total: 0, porFecha: {}};
	}
	
	// Agrupar por fecha
	const porFecha = {};
	datos.forEach(row => {
		const fechaOriginal = row[3]; // Columna D - puede ser Date object o string
		const puesto = row[6]; // Columna G
		// Generar clave legible para el agrupador (siempre DD/MM/YYYY)
		let fechaKey;
		if (fechaOriginal instanceof Date) {
			fechaKey = [fechaOriginal.getDate(), fechaOriginal.getMonth() + 1, fechaOriginal.getFullYear()].join("/");
		} else {
			fechaKey = String(fechaOriginal);
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
			fechaOriginal: fechaOriginal // conservar para usar en verificarCupo
		});
	});

	// Mostrar por fecha
	Logger.log("📅 Personas en fila por fecha:\n");
	Object.keys(porFecha).forEach(fechaKey => {
		const personas = porFecha[fechaKey];
		Logger.log(`   ${fechaKey}: ${personas.length} persona(s)`);

		// Usar la fecha original (Date object o string DD/MM/YYYY) para verificar cupos
		const fechaParaVerificar = personas[0].fechaOriginal;
		const cupos = verificarCupoEstacionamiento(fechaParaVerificar, "DIA COMPLETO");
		const cuposAM = verificarCupoEstacionamiento(fechaParaVerificar, "AM");
		const cuposPM = verificarCupoEstacionamiento(fechaParaVerificar, "PM");

		const hayCupos = cupos || cuposAM || cuposPM;
		if (hayCupos) {
			Logger.log(`      💡 HAY CUPOS DISPONIBLES`);
		} else {
			Logger.log(`      ⏳ Sin cupos disponibles`);
		}
	});
	
	Logger.log("\n💡 Recomendación:");
	Logger.log("   → Ejecuta: procesarTodasLasFilasAutomatico()");
	Logger.log("   → O espera a que el trigger automático se ejecute");
	
	Logger.log("\n════════════════════════════════════════════════════════════════\n");
	
	return {total: datos.length, porFecha: porFecha};
}

function test_forzar_dia_30() {
  // Forzamos al motor a procesar SOLO el día 30 para ver qué pasa
  procesarFila("30/4/2026");
}