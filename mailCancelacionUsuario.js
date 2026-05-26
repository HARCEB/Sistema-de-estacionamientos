/**
 * Envía email de confirmación cuando el usuario cancela su propia reserva
 * @param DATA - Datos del usuario desde "Respuestas de formulario"
 * @param CUPO_ASIGNADO - Cupo que tenía asignado
 */
function sendEmailCancelacionExitosa(DATA, CUPO_ASIGNADO) {
    try {
        const body = getDataCancelacion(DATA, CUPO_ASIGNADO);
        const htmlBody = getHTMLcancelacionExitosa(body);

        MailApp.sendEmail({
            to: body.email,
            replyTo: "estacionamientos@buk.cl",
            subject: "Cancelación exitosa - Estacionamiento " + body.date + ' (' + body.hour + ')',
            body: "Tu reserva ha sido cancelada exitosamente.",
            htmlBody: htmlBody,
        });
        Logger.log("Email de cancelación enviado a: " + body.email);
    } catch (error) {
        Logger.log("ERROR en sendEmailCancelacionExitosa: " + error);
        throw error;
    }
}

/**
 * Envía email cuando se cancela una solicitud en fila de espera
 * @param DATA - Datos del usuario
 */
function sendEmailCancelacionFilaEspera(DATA) {
    try {
        const body = getDataCancelacion(DATA, "");
        const htmlBody = getHTMLcancelacionFilaEspera(body);

        MailApp.sendEmail({
            to: body.email,
            replyTo: "estacionamientos@buk.cl",
            subject: "Cancelación exitosa - Solicitud en fila de espera " + body.date + ' (' + body.hour + ')',
            body: "Tu solicitud en fila de espera ha sido cancelada.",
            htmlBody: htmlBody,
        });
        Logger.log("Email de cancelación (fila espera) enviado a: " + body.email);
    } catch (error) {
        Logger.log("ERROR en sendEmailCancelacionFilaEspera: " + error);
        throw error;
    }
}

/**
 * Prepara los datos para el email de cancelación
 * @param DATA - Array con datos del formulario
 * @param CUPO_ASIGNADO - Cupo que tenía asignado (puede ser vacío)
 * @returns Objeto con datos formateados
 */
function getDataCancelacion(DATA, CUPO_ASIGNADO) {
    const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties().getProperties();
    const link_webapp = SCRIPT_PROPERTIES["url"] || "";
    
    // Usamos nuestra nueva función segura que ya no permite el doble salto
    let fechaFormateada = formattedDate(DATA[3]);
    
    const buker = {
        email: DATA[1] || "",
        name: DATA[2] || "Usuario",
        date: fechaFormateada,
        hour: DATA[4] || "",
        patente: DATA[5] || "",
        estacionamiento: CUPO_ASIGNADO || "N/A",
        link: link_webapp
    };
    
    return buker;
}

/**
 * Genera HTML para email de cancelación exitosa
 */
function getHTMLcancelacionExitosa(buker) {
    const htmlTemplate = HtmlService.createTemplateFromFile("cancelacionExitosa.html");
    htmlTemplate.buker = buker;
    const htmlBody = htmlTemplate.evaluate().getContent();
    return htmlBody;
}

/**
 * Genera HTML para email de cancelación de fila de espera
 */
function getHTMLcancelacionFilaEspera(buker) {
    // Reutiliza la misma plantilla de cancelación exitosa
    // Si quieres una plantilla específica, crea "cancelacionFilaEspera.html"
    const htmlTemplate = HtmlService.createTemplateFromFile("cancelacionExitosa.html");
    htmlTemplate.buker = buker;
    const htmlBody = htmlTemplate.evaluate().getContent();
    return htmlBody;
}
