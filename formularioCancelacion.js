/**
 * FORMULARIO DE CANCELACIÓN
 * 
 * Este archivo maneja las cancelaciones enviadas desde Google Forms
 * El formulario debe tener un campo "ID de Reserva" que se prellenará vía URL
 */

/**
 * Función que se ejecuta cuando se envía el formulario de cancelación
 * Debe configurarse como trigger "On form submit" desde el spreadsheet de respuestas
 * 
 * @param {Object} e - Event object del spreadsheet
 */
function onCancelFormSubmit(e) {
  try {
    Logger.log("=== Procesamiento de cancelación desde formulario ===");
    
    // Obtener valores de la nueva fila (e.values contiene los valores del formulario)
    const values = e.values;
    
    let reservaId = null;
    
    // Buscar el ID en los valores (debería empezar con "buker-")
    for (let i = 0; i < values.length; i++) {
      const value = String(values[i]);
      
      if (value.startsWith('buker-') || value.startsWith('test-')) {
        reservaId = value;
        break;
      }
    }
    
    if (!reservaId) {
      Logger.log("ERROR: No se encontró ID de reserva en los valores del formulario");
      return;
    }
    
    Logger.log("Cancelando reserva: " + reservaId);
    
    // Llamar a la función de cancelación interna libre de bloqueos
    const resultado = cancelarReservaInterno(reservaId);
    
    if (resultado.success) {
      Logger.log("✓ Cancelación exitosa: " + resultado.message);
    } else {
      Logger.log("✗ Error: " + resultado.message);
    }
    
  } catch (error) {
    Logger.log("ERROR en onCancelFormSubmit: " + error.toString());
  }
}

/**
 * Genera una URL de cancelación con el ID prellenado
 * 
 * @param {string} reservaId - ID de la reserva a cancelar
 * @returns {string} URL del formulario con el ID prellenado
 */
function generarUrlCancelacion(reservaId) {
  // IDs del formulario de cancelación
  // IMPORTANTE: Este es el ID del formulario REAL vinculado a "Respuestas Cancelación"
  // URL: https://docs.google.com/forms/d/1FAIpQLSdGH6OlSJtJpkEz9rbgZkyJ6OzXmQW1lCAasywjjpZBqPLqvQ/
  const FORM_ID = '1FAIpQLSdGH6OlSJtJpkEz9rbgZkyJ6OzXmQW1lCAasywjjpZBqPLqvQ';
  const ENTRY_ID_RESERVA = 'entry.1853467438'; // Campo "ID de reserva"
  const ENTRY_ID_CONFIRMACION = 'entry.1028801206_sentinel'; // Campo de confirmación (checkbox)

  // Construir URL con prefill (incluye ambos campos prellenados)
  // Usar el formato público /d/e/ para URLs compartibles
  const baseUrl = `https://docs.google.com/forms/d/e/${FORM_ID}/viewform`;
  const prefillReserva = `${ENTRY_ID_RESERVA}=${encodeURIComponent(reservaId)}`;
  const prefillConfirmacion = `${ENTRY_ID_CONFIRMACION}=${encodeURIComponent('Confirmo que deseo cancelar mi reserva de estacionamiento')}`;

  return `${baseUrl}?usp=pp_url&${prefillReserva}&${prefillConfirmacion}`;
}

/**
 * Función de prueba para generar URL de cancelación
 */
function test_generarUrlCancelacion() {
  const testId = "buker-test123-1699999999999";
  const url = generarUrlCancelacion(testId);
  
  Logger.log("URL de cancelación generada:");
  Logger.log(url);
  
  return url;
}

/**
 * Configura el trigger para el formulario de cancelación
 * EJECUTAR ESTA FUNCIÓN UNA SOLA VEZ después de reconectar el formulario
 */
function configurarTriggerCancelacion() {
  // Usar el ID de la hoja PRINCIPAL (donde están todas las pestañas)
  const SHEET_ID_PRINCIPAL = PropertiesService.getScriptProperties().getProperty('sheet_id');
  
  if (!SHEET_ID_PRINCIPAL) {
    Logger.log("ERROR: No se encuentra 'sheet_id' en las propiedades del script");
    Logger.log("Ejecuta primero: configurarEntornoPruebas() o configura manualmente el sheet_id");
    return;
  }
  
  // Eliminar triggers existentes de onCancelFormSubmit para evitar duplicados
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'onCancelFormSubmit') {
      ScriptApp.deleteTrigger(trigger);
      Logger.log("Trigger anterior eliminado");
    }
  });
  
  try {
    // Crear nuevo trigger usando la hoja principal
    ScriptApp.newTrigger('onCancelFormSubmit')
      .forSpreadsheet(SHEET_ID_PRINCIPAL)
      .onFormSubmit()
      .create();
    
    Logger.log("✓ Trigger creado exitosamente");
    Logger.log("La función 'onCancelFormSubmit' se ejecutará cuando se envíe el formulario de cancelación");
    Logger.log("Sheet ID usado: " + SHEET_ID_PRINCIPAL);
    
    return "Trigger configurado correctamente";
    
  } catch (error) {
    Logger.log("ERROR al crear trigger: " + error.toString());
    Logger.log("Verifica que el formulario esté conectado a la hoja principal");
    throw error;
  }
}

/**
 * Modifica los emails de confirmación para incluir el link de cancelación
 * Esta función puede ser llamada desde mailCupoAsignado.js
 * 
 * @param {string} reservaId - ID de la reserva
 * @returns {string} HTML con el botón de cancelación
 */
function generarBotonCancelacion(reservaId) {
  const urlCancelacion = generarUrlCancelacion(reservaId);
  
  return `
    <div style="margin: 30px 0; text-align: center;">
      <a href="${urlCancelacion}" 
         style="background-color: #f44336; 
                color: white; 
                padding: 12px 30px; 
                text-decoration: none; 
                border-radius: 4px; 
                display: inline-block;
                font-weight: bold;">
        Cancelar esta Reserva
      </a>
    </div>
    <p style="font-size: 12px; color: #666; text-align: center;">
      También puedes cancelar desde: <a href="${urlCancelacion}">${urlCancelacion}</a>
    </p>
  `;
}
