// ============================================================================
// MÓDULO DE VERIFICACIÓN DE CUPOS Y DISPONIBILIDAD
// ============================================================================

/**
 * Función auxiliar para comparar fechas ignorando formatos como "05/05" vs "5/5"
 */
function sonFechasIguales(fechaHoja, fechaBusqueda) {
    let s1 = normalizarFechaAString(fechaHoja);
    let s2 = normalizarFechaAString(fechaBusqueda);
    return s1 === s2 && s1 !== "";
}

function verificarCupoEstacionamiento(fecha, hora) {
    const spreadsheetParametros = obtenerHojaPrincipal().getSheetByName("PARAMETROS");
    
    // Usamos nuestra función segura que pone la hora a las 12:00 PM
    let fechaObject = stringToDate(fecha);
    let fechaString = typeof fecha === 'string' ? fecha : formattedDate(fecha);

    // Validar que la fecha es válida
    if (isNaN(fechaObject.getTime())) {
        Logger.log("ERROR: Fecha inválida");
        return false;
    }

    // Número de día de la semana
    let numero_semana = fechaObject.getDay() + 1;
    
    // Cupos disponibles según día de la semana
    const totalCupos = spreadsheetParametros.getLastRow() - 1; 
    const cupos = spreadsheetParametros.getRange(2, numero_semana, totalCupos)
        .getValues()
        .filter((data) => data[0] !== "" && data[0] !== null && data[0] !== undefined)
        .map((data) => String(data[0]).trim().toUpperCase());

    // 🚀 CAMBIO CLAVE: BÚSQUEDA SEGURA EN MEMORIA (Ignorando TextFinder)
    const spreadsheetEstacionamientos = obtenerHojaPrincipal().getSheetByName("Estacionamientos_Asignados");
    const datosAsignados = spreadsheetEstacionamientos.getDataRange().getDisplayValues();
    
    const cuposUsadosPorHora = [];
    
    // Recorremos las asignaciones (empezando en 1 para saltar encabezado)
    for (let i = 1; i < datosAsignados.length; i++) {
        let fechaEnCelda = datosAsignados[i][3]; // Columna D
        
        if (sonFechasIguales(fechaEnCelda, fechaString)) {
            cuposUsadosPorHora.push([
                datosAsignados[i][5].toUpperCase(), // Columna F (Cupo)
                datosAsignados[i][4].toUpperCase()  // Columna E (Hora)
            ]);
        }
    }

    const cuposUsados = cuposUsadosPorHora.map((data) => data[0]);
    const cuposUsadosDiaCompleto = cuposUsadosPorHora
        .filter((data) => data[1] === "DIA COMPLETO")
        .map((data) => data[0]);

    const cuposLibresDiaCompleto = cupos.filter((cupo) => !cuposUsados.includes(cupo));
    const cuposLibresSoloAM = cupos.filter(
        (cupo) => !cuposUsadosDiaCompleto.includes(cupo) && !cuposUsadosPorHora.some((data) => data[0] === cupo && data[1] === "AM")
    );
    const cuposLibresSoloPM = cupos.filter(
        (cupo) => !cuposUsadosDiaCompleto.includes(cupo) && !cuposUsadosPorHora.some((data) => data[0] === cupo && data[1] === "PM")
    );

    switch (hora) {
        case "DIA COMPLETO":
            if (cuposLibresDiaCompleto.length > 0) return cuposLibresDiaCompleto[0];
            return false;
            
        case "AM":
            if (cuposLibresSoloAM.length > 0) return cuposLibresSoloAM[0];
            return false;
            
        case "PM":
            if (cuposLibresSoloPM.length > 0) return cuposLibresSoloPM[0];
            return false;
            
        default:
            return false;
    }
}

// Función que obtiene cantidad de cupos disponibles por día y hora
function cuposDisponiblesFecha(fecha) {
    const spreadsheetParametros = obtenerHojaPrincipal().getSheetByName("PARAMETROS");

    // Forzar el reloj al mediodía (12:00 PM) para estabilizar zona horaria
    let fechaObject = stringToDate(fecha);
    let numero_semana = fechaObject.getDay() + 1;

    // Cupos paramétricos
    const totalCupos = spreadsheetParametros.getLastRow() - 1;
    const cupos = spreadsheetParametros.getRange(2, numero_semana, totalCupos)
        .getValues()
        .filter((data) => data[0] !== "" && data[0] !== null && data[0] !== undefined)
        .map((data) => String(data[0]).trim().toUpperCase());

    // 🚀 CAMBIO CLAVE: BÚSQUEDA SEGURA EN MEMORIA PARA CONTADORES
    const spreadsheetEstacionamientos = obtenerHojaPrincipal().getSheetByName("Estacionamientos_Asignados");
    const datosAsignados = spreadsheetEstacionamientos.getDataRange().getDisplayValues();
    
    const cuposUsadosPorHora = [];
    const cuposUsados = [];

    for (let i = 1; i < datosAsignados.length; i++) {
        let fechaEnCelda = datosAsignados[i][3]; // Columna D
        
        if (sonFechasIguales(fechaEnCelda, fecha)) {
            cuposUsadosPorHora.push(datosAsignados[i][4].toUpperCase()); // Columna E (Hora)
            cuposUsados.push(datosAsignados[i][5].toUpperCase());        // Columna F (Cupo)
        }
    }

    // Obtener lista de cupos libres
    const cuposLibresDiaCompleto = cupos.filter((cupo) => !cuposUsados.includes(cupo));

    const cuposLibresAM =
        cupos.length -
        cuposUsadosPorHora.filter((data) => data == "AM").length -
        cuposUsadosPorHora.filter((data) => data != "PM" && data != "AM").length;

    const cuposLibresPM =
        cupos.length -
        cuposUsadosPorHora.filter((data) => data == "PM").length -
        cuposUsadosPorHora.filter((data) => data != "PM" && data != "AM").length;

    return [cuposLibresDiaCompleto.length, Math.max(0, cuposLibresAM), Math.max(0, cuposLibresPM)];
}

// ============================================================================
// ACTUALIZADORES DE INTERFAZ Y TRIGGERS
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
    const spreadsheetDisponibilidad = obtenerHojaPrincipal().getSheetByName("Disponibilidad_Dia");
    let fecha_actual = new Date();
    let array_cupos = [];

    for (let i = 1; i <= 30; i++) {
        let fecha_str = formattedDate(fecha_actual);
        const cuposDisponibles = cuposDisponiblesFecha(fecha_str);

        array_cupos.push([
            fecha_str,
            cuposDisponibles[0],
            cuposDisponibles[1],
            cuposDisponibles[2],
        ]);

        fecha_actual.setDate(fecha_actual.getDate() + 1);
    }

    spreadsheetDisponibilidad.getRange(
        2, 1, array_cupos.length, array_cupos[0].length
    ).setValues(array_cupos);
}

// ============================================================================
// VERIFICACIÓN DE RESTRICCIONES DE USUARIO
// ============================================================================

/**
 * Verifica si el usuario cumple con las reglas para reservar.
 * VERSIÓN BLINDADA: Evita el TextFinder y lee todo desde la memoria.
 */
function verificarRestriccionUsuario(email, fecha) {
    const fechaObject = stringToDate(fecha);
    const difference = calculateDaysDifference(fechaObject);
    
    // 1. Validar límite de 30 días
    if (!(difference >= 0 && difference <= 30)) {
        const razon = difference < 0
            ? `La fecha solicitada (${fecha}) ya pasó. Solo puedes reservar desde hoy en adelante.`
            : `La fecha solicitada (${fecha}) está muy lejos en el futuro. Solo puedes reservar hasta 30 días corridos desde hoy.`;
        Logger.log("No puede solicitar: " + razon);
        return { success: false, reason: razon };
    }

    let reservasMismoDia = 0;
    let reservasVigentesFuturas = 0;
    
    const todayDate = new Date();
    todayDate.setHours(0,0,0,0);
    const emailAComparar = email.toString().trim().toLowerCase();

    // 2. Escaneo en memoria de Estacionamientos_Asignados y Fila_Espera
    const hojasABuscar = ["Estacionamientos_Asignados", "Fila_Espera"];
    const hojaPrincipal = obtenerHojaPrincipal();
    
    for (const nombreHoja of hojasABuscar) {
        const hoja = hojaPrincipal.getSheetByName(nombreHoja);
        if (!hoja) continue;
        
        const datos = hoja.getDataRange().getDisplayValues();
        
        // Empezar en 1 para saltar encabezados
        for (let i = 1; i < datos.length; i++) {
            const emailCelda = datos[i][2]; // Columna C (Email)
            const fechaCelda = datos[i][3]; // Columna D (Fecha)

            // Validamos que el email de la fila coincida con el que solicita
            if (emailCelda && emailCelda.toString().trim().toLowerCase() === emailAComparar) {
                
                // ¿Ya tiene reserva para este mismo día exacto?
                if (sonFechasIguales(fechaCelda, fecha)) {
                    reservasMismoDia++;
                }

                // ¿Es una reserva vigente (de hoy hacia el futuro)?
                const fechaReservaObj = stringToDate(fechaCelda);
                if (!isNaN(fechaReservaObj.getTime())) {
                    fechaReservaObj.setHours(0,0,0,0);
                    if (fechaReservaObj >= todayDate) {
                        reservasVigentesFuturas++;
                    }
                }
            }
        }
    }

    // 3. Aplicación de reglas de negocio
    if (reservasMismoDia > 0) {
        const razon = `Ya tienes una reserva o estás en fila de espera para el día ${fecha}. No puedes solicitar dos estacionamientos para el mismo día.`;
        return { success: false, reason: razon };
    }

    if (reservasVigentesFuturas >= 3) {
        const razon = `Ya tienes ${reservasVigentesFuturas} reservas activas. El máximo permitido es 3 reservas vigentes simultáneamente. Por favor cancela una de tus reservas antes de solicitar una nueva.`;
        return { success: false, reason: razon };
    }

    return { success: true, reason: null };
}