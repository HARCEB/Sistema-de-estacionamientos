var activeUser = Session.getActiveUser();
var ss = obtenerHojaPrincipal()

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

  // 3. NUEVO FILTRO DE FECHAS: Le enseñamos a JS a leer el texto "DD/MM/YYYY"
  userData = userData.filter(item => {
    var fechaTexto = item[3]; // ej: "30/4/2026"
    var partes = fechaTexto.split('/'); // Lo divide en ["30", "4", "2026"]
    
    if(partes.length === 3) {
      // Formato Date en JS es: Año, Mes (de 0 a 11), Día
      var fecha = new Date(partes[2], partes[1] - 1, partes[0]);
      return fecha >= hoy;
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

  // 3. NUEVO FILTRO DE FECHAS SEGURO
  userData = userData.filter(item => {
    var fechaTexto = item[3];
    var partes = fechaTexto.split('/'); 
    
    if(partes.length === 3) {
      var fecha = new Date(partes[2], partes[1] - 1, partes[0]);
      return fecha >= hoy;
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

    // Forzar la escritura física para que asignarEstacionamiento pueda buscar la fila mediante textFinder
    SpreadsheetApp.flush();

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
  
  return { email: email, nombre: nombre };
}


// HERRAMIENTA DE ADMINISTRADOR: Forzar cancelación
function forzarCancelacionAdmin() {
  // 1. Pega el ID de la reserva entre las comillas
  var idParaBorrar = "buker-7852l7vq4ni-1777411971274"; 
  
  // 2. Ejecutamos la función maestra de cancelación
  var resultado = cancelarReserva(idParaBorrar);
  
  // 3. Imprimimos el resultado para confirmar que todo salió bien
  Logger.log(resultado.message);
}