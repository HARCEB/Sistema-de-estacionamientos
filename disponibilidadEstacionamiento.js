// ============================================================================
// MÓDULO DE VERIFICACIÓN DE CUPOS Y DISPONIBILIDAD (REFACTORIZADO SRP)
// ============================================================================

/**
 * Compara dos fechas ignorando diferencias de formato ("05/05" vs "5/5")
 */
function sonFechasIguales(fechaHoja, fechaBusqueda) {
    const d1 = parseDateSecure(fechaHoja);
    const d2 = parseDateSecure(fechaBusqueda);
    if (!d1 || !d2) return false;
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

/**
 * Valida si un email pertenece a la lista de administradores exceptuados
 */
function esUsuarioAdministrador(email) {
    if (!email) return false;
    const adminsSinLimite = ["capaza@buk.pe"];
    return adminsSinLimite.includes(String(email).trim().toLowerCase());
}

/**
 * Valida si una fecha se encuentra dentro de los próximos 30 días
 */
function validarRangoFecha(fecha) {
    const fechaObject = stringToDate(fecha);
    const difference = calculateDaysDifference(fechaObject);
    
    if (!(difference >= 0 && difference <= 30)) {
        const razon = difference < 0
            ? `La fecha solicitada (${fecha}) ya pasó. Solo puedes reservar desde hoy en adelante.`
            : `La fecha solicitada (${fecha}) está muy lejos en el futuro. Solo puedes reservar hasta 30 días corridos desde hoy.`;
        return { valida: false, reason: razon };
    }
    return { valida: true };
}

/**
 * Obtiene los cupos paramétricos configurados para un día de la semana
 */
function obtenerCuposParametricos(numeroSemana) {
    const spreadsheetParametros = obtenerHojaPrincipal().getSheetByName("PARAMETROS");
    const totalCupos = spreadsheetParametros.getLastRow() - 1; 
    return spreadsheetParametros.getRange(2, numeroSemana, totalCupos)
        .getValues()
        .filter((data) => data[0].length > 0)
        .map((data) => data[0].toUpperCase());
}

/**
 * Obtiene las asignaciones usadas de la hoja Estacionamientos_Asignados para una fecha dada
 */
function obtenerCuposUsados(fechaString) {
    const spreadsheetEstacionamientos = obtenerHojaPrincipal().getSheetByName("Estacionamientos_Asignados");
    const datosAsignados = spreadsheetEstacionamientos.getDataRange().getDisplayValues();
    const cuposUsadosPorHora = [];
    
    for (let i = 1; i < datosAsignados.length; i++) {
        let fechaEnCelda = datosAsignados[i][3]; // Columna D
        if (sonFechasIguales(fechaEnCelda, fechaString)) {
            cuposUsadosPorHora.push([
                datosAsignados[i][5].toUpperCase(), // Columna F (Cupo)
                datosAsignados[i][4].toUpperCase()  // Columna E (Hora)
            ]);
        }
    }
    return cuposUsadosPorHora;
}

/**
 * Selecciona el primer cupo disponible según la jornada solicitada (Día Completo, AM, PM)
 */
function seleccionarCupoDisponible(cuposParametricos, cuposUsadosPorHora, hora) {
    const cuposUsados = cuposUsadosPorHora.map((data) => data[0]);
    const cuposUsadosDiaCompleto = cuposUsadosPorHora
        .filter((data) => data[1] === "DIA COMPLETO")
        .map((data) => data[0]);

    const cuposLibresDiaCompleto = cuposParametricos.filter((cupo) => !cuposUsados.includes(cupo));
    const cuposLibresSoloAM = cuposParametricos.filter(
        (cupo) => !cuposUsadosDiaCompleto.includes(cupo) && !cuposUsadosPorHora.some((data) => data[0] === cupo && data[1] === "AM")
    );
    const cuposLibresSoloPM = cuposParametricos.filter(
        (cupo) => !cuposUsadosDiaCompleto.includes(cupo) && !cuposUsadosPorHora.some((data) => data[0] === cupo && data[1] === "PM")
    );

    switch (hora) {
        case "DIA COMPLETO":
            return cuposLibresDiaCompleto.length > 0 ? cuposLibresDiaCompleto[0] : false;
        case "AM":
            return cuposLibresSoloAM.length > 0 ? cuposLibresSoloAM[0] : false;
        case "PM":
            return cuposLibresSoloPM.length > 0 ? cuposLibresSoloPM[0] : false;
        default:
            return false;
    }
}

/**
 * Función principal para verificar y asignar un cupo según disponibilidad
 */
function verificarCupoEstacionamiento(fecha, hora) {
    let fechaObject = stringToDate(fecha);
    let fechaString = typeof fecha === 'string' ? fecha : formattedDate(fecha);

    if (isNaN(fechaObject.getTime())) {
        Logger.log("ERROR: Fecha inválida");
        return false;
    }

    let numeroSemana = fechaObject.getDay() + 1;
    const cuposParametricos = obtenerCuposParametricos(numeroSemana);
    const cuposUsadosPorHora = obtenerCuposUsados(fechaString);

    return seleccionarCupoDisponible(cuposParametricos, cuposUsadosPorHora, hora);
}

/**
 * Obtiene cantidad de cupos disponibles (Día Completo, AM, PM) por fecha
 */
function cuposDisponiblesFecha(fecha) {
    let fechaObject = stringToDate(fecha);
    let numeroSemana = fechaObject.getDay() + 1;

    const cuposParametricos = obtenerCuposParametricos(numeroSemana);
    const cuposUsadosPorHoraData = obtenerCuposUsados(fecha);

    const cuposUsadosHoras = cuposUsadosPorHoraData.map(d => d[1]);
    const cuposUsadosNombres = cuposUsadosPorHoraData.map(d => d[0]);

    const cuposLibresDiaCompleto = cuposParametricos.filter((cupo) => !cuposUsadosNombres.includes(cupo));

    const cuposLibresAM =
        cuposParametricos.length -
        cuposUsadosHoras.filter((data) => data == "AM").length -
        cuposUsadosHoras.filter((data) => data != "PM" && data != "AM").length;

    const cuposLibresPM =
        cuposParametricos.length -
        cuposUsadosHoras.filter((data) => data == "PM").length -
        cuposUsadosHoras.filter((data) => data != "PM" && data != "AM").length;

    return [cuposLibresDiaCompleto.length, Math.max(0, cuposLibresAM), Math.max(0, cuposLibresPM)];
}

/**
 * Escanea en memoria las hojas Estacionamientos_Asignados y Fila_Espera para contar reservas del usuario
 */
function contarReservasUsuario(email, fecha, idAExcluir = null) {
    let reservasMismoDia = 0;
    let reservasVigentesFuturas = 0;
    
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const emailAComparar = email.toString().trim().toLowerCase();

    const hojasABuscar = ["Estacionamientos_Asignados", "Fila_Espera"];
    const hojaPrincipal = obtenerHojaPrincipal();
    
    for (const nombreHoja of hojasABuscar) {
        const hoja = hojaPrincipal.getSheetByName(nombreHoja);
        if (!hoja) continue;
        
        const datos = hoja.getDataRange().getDisplayValues();
        
        for (let i = 1; i < datos.length; i++) {
            const emailCelda = datos[i][2];
            const fechaCelda = datos[i][3];

            if (emailCelda && emailCelda.toString().trim().toLowerCase() === emailAComparar) {
                const idCelda = datos[i][0];
                if (idAExcluir && idCelda && idCelda.toString().trim() === idAExcluir.toString().trim()) {
                    continue;
                }
                
                if (sonFechasIguales(fechaCelda, fecha)) {
                    reservasMismoDia++;
                }

                const fechaReservaObj = stringToDate(fechaCelda);
                if (!isNaN(fechaReservaObj.getTime())) {
                    fechaReservaObj.setHours(0, 0, 0, 0);
                    if (fechaReservaObj >= todayDate) {
                        reservasVigentesFuturas++;
                    }
                }
            }
        }
    }

    return { reservasMismoDia, reservasVigentesFuturas };
}

/**
 * Función principal para verificar si un usuario cumple con las reglas para reservar
 */
function verificarRestriccionUsuario(email, fecha, idAExcluir = null) {
    // 1. Validar rango de fecha permitido
    const validacionRango = validarRangoFecha(fecha);
    if (!validacionRango.valida) {
        Logger.log("No puede solicitar: " + validacionRango.reason);
        return { success: false, reason: validacionRango.reason };
    }

    // 2. Contar reservas vigentes del usuario
    const { reservasMismoDia, reservasVigentesFuturas } = contarReservasUsuario(email, fecha, idAExcluir);

    // 3. Aplicar reglas de negocio
    const esAdmin = esUsuarioAdministrador(email);

    if (reservasMismoDia > 0 && !esAdmin) {
        const razon = `Ya tienes una reserva o estás en fila de espera para el día ${fecha}. No puedes solicitar dos estacionamientos para el mismo día.`;
        return { success: false, reason: razon };
    }

    if (reservasVigentesFuturas >= 3 && !esAdmin) {
        const razon = `Ya tienes ${reservasVigentesFuturas} reservas activas. El máximo permitido es 3 reservas vigentes simultáneamente. Por favor cancela una de tus reservas antes de solicitar una nueva.`;
        return { success: false, reason: razon };
    }

    return { success: true, reason: null };
}

// ============================================================================
// ACTUALIZADORES DE INTERFAZ Y TABLA DE DISPONIBILIDAD
// ============================================================================

function actualizarCuposPorFecha(fecha) {
    try {
        const spreadsheetDisponibilidad = obtenerHojaPrincipal().getSheetByName("Disponibilidad_Dia");
        const cuposDisponibles = cuposDisponiblesFecha(fecha);
        const fechas = spreadsheetDisponibilidad.getRange("A2:A31").getDisplayValues();
        
        const indiceFila = fechas.findIndex(row => sonFechasIguales(row[0], fecha));

        if (indiceFila === -1) return false;

        const filaActual = indiceFila + 2;
        spreadsheetDisponibilidad.getRange(filaActual, 2, 1, 3)
            .setValues([[cuposDisponibles[0], cuposDisponibles[1], cuposDisponibles[2]]]);
            
        return true;
    } catch (error) {
        Logger.log(`❌ Error actualizando cupos para fecha ${fecha}: ${error}`);
        return false;
    }
}

function actualizarCuposDisponibles() {
    const hojaPrincipal = obtenerHojaPrincipal();
    const spreadsheetDisponibilidad = hojaPrincipal.getSheetByName("Disponibilidad_Dia");
    const spreadsheetParametros = hojaPrincipal.getSheetByName("PARAMETROS");
    const spreadsheetEstacionamientos = hojaPrincipal.getSheetByName("Estacionamientos_Asignados");

    const parametrosData = spreadsheetParametros.getDataRange().getValues();
    const datosAsignados = spreadsheetEstacionamientos.getDataRange().getDisplayValues();

    const asignadosPorFecha = {};
    for (let i = 1; i < datosAsignados.length; i++) {
        const fechaEnCelda = datosAsignados[i][3];
        const hora = datosAsignados[i][4].toUpperCase();
        const cupo = datosAsignados[i][5].toUpperCase();
        if (fechaEnCelda) {
            if (!asignadosPorFecha[fechaEnCelda]) {
                asignadosPorFecha[fechaEnCelda] = [];
            }
            asignadosPorFecha[fechaEnCelda].push({ hora: hora, cupo: cupo });
        }
    }

    let fecha_actual = new Date();
    let array_cupos = [];

    for (let i = 1; i <= 30; i++) {
        let fecha_str = formattedDate(fecha_actual);
        let numero_semana = fecha_actual.getDay() + 1;

        const colIndex = numero_semana - 1;
        const cupos = [];
        for (let r = 1; r < parametrosData.length; r++) {
            if (colIndex < parametrosData[r].length) {
                const val = parametrosData[r][colIndex];
                if (val && String(val).trim() !== "") {
                    cupos.push(String(val).toUpperCase());
                }
            }
        }

        const cuposUsadosPorHora = [];
        const cuposUsados = [];
        
        for (const fechaKey in asignadosPorFecha) {
            if (sonFechasIguales(fechaKey, fecha_str)) {
                const list = asignadosPorFecha[fechaKey];
                for (let j = 0; j < list.length; j++) {
                    cuposUsadosPorHora.push(list[j].hora);
                    cuposUsados.push(list[j].cupo);
                }
            }
        }

        const cuposLibresDiaCompleto = cupos.filter((cupo) => !cuposUsados.includes(cupo));
        const cuposLibresAM = cupos.length -
            cuposUsadosPorHora.filter((data) => data == "AM").length -
            cuposUsadosPorHora.filter((data) => data != "PM" && data != "AM").length;
        const cuposLibresPM = cupos.length -
            cuposUsadosPorHora.filter((data) => data == "PM").length -
            cuposUsadosPorHora.filter((data) => data != "PM" && data != "AM").length;

        array_cupos.push([
            fecha_str,
            cuposLibresDiaCompleto.length,
            Math.max(0, cuposLibresAM),
            Math.max(0, cuposLibresPM),
        ]);

        fecha_actual.setDate(fecha_actual.getDate() + 1);
    }

    spreadsheetDisponibilidad.getRange(
        2, 1, array_cupos.length, array_cupos[0].length
    ).setValues(array_cupos);
}