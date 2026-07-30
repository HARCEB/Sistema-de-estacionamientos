
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('Mis Reservas');
}

function currentUser() {
  try {
    // Esto fuerza a Google a leer el correo del visitante en el instante exacto
    const emailVisitante = Session.getActiveUser().getEmail(); 
    
    if (emailVisitante && emailVisitante !== '') {
      return emailVisitante;
    } else {
      return "Error: No se pudo detectar tu correo de Buk";
    }
  } catch (error) {
    return "Error al detectar usuario!!!";
  }
}

function getDataReserva() {
  var emailVisitante = Session.getActiveUser().getEmail(); // 1. Obtenemos el correo en tiempo real
  var sheetName = 'Estacionamientos_Asignados';
  var emailHeader = 'Email'; 
  const ss = obtenerHojaPrincipal();
  var activeSheet = ss.getSheetByName(sheetName);
  
  // 2. EL CAMBIO MÁGICO: Leemos texto puro, adiós problemas de zona horaria
  var values = activeSheet.getDataRange().getDisplayValues(); 
  var header = values[0];
  var emailIndex = header.indexOf(emailHeader);
  var userData = [];
  
  // Buscamos las filas del usuario (empezamos en i=1 para saltar el encabezado)
  for (var i = 1; i < values.length; i++) {
    if (values[i][emailIndex] === emailVisitante) {
      userData.push(values[i]);
    }
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0); 

  // 3. NUEVO FILTRO DE FECHAS SEGURO (usando parseDateSecure)
  userData = userData.filter(item => {
    var fechaObj = parseDateSecure(item[3]);
    if (fechaObj) {
      var fechaReserva = new Date(fechaObj);
      fechaReserva.setHours(0, 0, 0, 0);
      return fechaReserva >= hoy;
    }
    return true; // Si hay algún error raro, lo mostramos por si acaso
  });

  if (userData.length > 0) {
    return { success: true, headers: header, data: userData };
  } else {
    return { success: false, message: 'No se encontraron datos de Reserva.' };
  }
}

function getDataFila() {
  var emailVisitante = Session.getActiveUser().getEmail(); // 1. Obtenemos el correo en tiempo real
  var sheetName = "Fila_Espera";
  var emailHeader = 'Email'; 
  const ss = obtenerHojaPrincipal();
  var activeSheet = ss.getSheetByName(sheetName);
  
  // 2. EL CAMBIO MÁGICO: Leemos texto puro
  var values = activeSheet.getDataRange().getDisplayValues();
  var header = values[0];
  var emailIndex = header.indexOf(emailHeader);
  var userData = [];
  
  for (var i = 1; i < values.length; i++) {
    if (values[i][emailIndex] === emailVisitante) {
      userData.push(values[i]);
    }
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0); 

  // 3. NUEVO FILTRO DE FECHAS SEGURO (usando parseDateSecure)
  userData = userData.filter(item => {
    var fechaObj = parseDateSecure(item[3]);
    if (fechaObj) {
      var fechaReserva = new Date(fechaObj);
      fechaReserva.setHours(0, 0, 0, 0);
      return fechaReserva >= hoy;
    }
    return true; 
  });

  if (userData.length > 0) {
    return { success: true, headers: header, data: userData };
  } else {
    return { success: false, message: 'No se encontraron datos de Fila de Espera.' };
  }
}


/**
 * Procesa la nueva reserva enviada desde el Portal Web (HTML)
 */
function procesarNuevaReservaWeb(datos) {
  var lock = LockService.getDocumentLock();
  try {
    // Esperamos hasta 30 segundos por si el sistema está ocupado
    lock.waitLock(30000);

    // 1. Identificamos al usuario y recibimos su nombre desde el HTML
    var email = Session.getActiveUser().getEmail();
    var nombre = datos.nombre;

    // 2. Formateamos la fecha (De YYYY-MM-DD del HTML a DD/MM/YYYY para tu Excel)
    var partesFecha = datos.fecha.split('-');
    var fechaFormateada = parseInt(partesFecha[2]) + "/" + parseInt(partesFecha[1]) + "/" + partesFecha[0];

    // 3. Creamos el ID único oficial de Buker
    var idReserva = "buker-" + Math.random().toString(36).substr(2, 9) + "-" + new Date().getTime();

    // 4. Escribimos la solicitud en "Respuestas Reserva" (Simulando al Google Form antiguo)
    // Columnas exactas: ID | Email | Nombre | Fecha | Turno | Placa | Timestamp
    var hojaRespuestas = obtenerHojaPrincipal().getSheetByName('Respuestas Reserva');
    hojaRespuestas.appendRow([
        idReserva,
        email,
        nombre,
        fechaFormateada,
        datos.turno,
        datos.placa.toUpperCase(),
        new Date() 
    ]);

    // 5. ¡LA MAGIA! Llamamos a tu código original para que haga todo el trabajo duro
    // (Tu código leerá la fila que acabamos de crear, asignará cupo o fila de espera, y mandará el email)
    asignarEstacionamiento(idReserva);

    return {
        success: true,
        message: "¡Solicitud procesada con éxito! La tabla se actualizará ahora."
    };

  } catch (error) {
    Logger.log("Error en WebApp Reserva: " + error);
    return {
        success: false,
        message: "Lo sentimos, hubo un error procesando tu solicitud."
    };
  } finally {
    lock.releaseLock();
  }
}



/**
 * Busca si el usuario ya tiene un nombre registrado en el historial
 */
function getDatosUsuarioActual() {
  var email = Session.getActiveUser().getEmail();
  var nombre = "";
  
  try {
    var sheet = obtenerHojaPrincipal().getSheetByName('Estacionamientos_Asignados');
    var data = sheet.getDataRange().getValues();
    // Busca de abajo hacia arriba (lo más reciente)
    for(var i = data.length - 1; i >= 1; i--) {
      if(data[i][2] === email && data[i][1] !== "") {
        nombre = data[i][1];
        break; // Si lo encuentra, se detiene
      }
    }
  } catch(e) {
    Logger.log("Error buscando nombre: " + e);
  }
  
  // Validar rol de administrador dinámicamente desde Sheets
  var esAdmin = false;
  try {
    esAdmin = esUsuarioAdministrador(email);
  } catch(errAdmin) {
    Logger.log("Error verificando rol de admin: " + errAdmin);
  }
  
  return { email: email, nombre: nombre, esAdmin: esAdmin };
}


// HERRAMIENTA DE ADMINISTRADOR: Forzar cancelación
function forzarCancelacionAdmin() {
  // 1. Pega el ID de la reserva entre las comillas
  var idParaBorrar = "buker-dw7pvz4wmv-1782831890965"; 
  
  // 2. Ejecutamos la función maestra de cancelación
  var resultado = cancelarReserva(idParaBorrar);
  
  // 3. Imprimimos el resultado para confirmar que todo salió bien
  Logger.log(resultado.message);
}

/**
 * Procesa la penalización de un usuario desde la Web App de forma segura
 * @param {string} emailUsuarioAPenalizar - Correo del usuario a sancionar
 * @returns {object} Estado de éxito o error
 */
function penalizarUsuarioDesdeWeb(emailUsuarioAPenalizar) {
  var emailActual = Session.getActiveUser().getEmail();
  
  // Validar seguridad en servidor dinámicamente desde Sheets
  if (!esUsuarioAdministrador(emailActual)) {
    return {
      success: false,
      message: "Error de permisos: Solo los administradores pueden aplicar penalizaciones."
    };
  }
  
  if (!emailUsuarioAPenalizar || String(emailUsuarioAPenalizar).trim() === "") {
    return {
      success: false,
      message: "Error: Debes ingresar un correo electrónico válido."
    };
  }
  
  try {
    penalizarUsuario(emailUsuarioAPenalizar);
    return {
      success: true,
      message: "Sanción aplicada exitosamente a " + emailUsuarioAPenalizar + " por 14 días. Sus reservas futuras han sido canceladas."
    };
  } catch (error) {
    Logger.log("Error al penalizar desde WebApp: " + error);
    return {
      success: false,
      message: "Hubo un error al procesar la penalización: " + error.toString()
    };
  }
}