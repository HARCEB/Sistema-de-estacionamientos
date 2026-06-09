/**
 * It takes a buker object as input, and returns a string of HTML
 * @param buker - The name of the person who is on the waiting list.
 * @returns The HTML content of the template.
 */
function getHTMLlistaEspera(buker) {
    const htmlTemplate = HtmlService.createTemplateFromFile("listaEspera.html");
    htmlTemplate.buker = buker;
    const htmlBody = htmlTemplate.evaluate().getContent();
    return htmlBody;
}

/**
 * Prepara los datos para el email de lista de espera
 * @param DATA - Datos del usuario [ID, Email, Nombre, Fecha, Hora, Patente]
 * @returns Objeto con los datos formateados para el template
 */
function getDataListaEspera(DATA) {
    const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties().getProperties();
    const link_cancelar = SCRIPT_PROPERTIES["url"];
    const puesto_cola = getNumeroCola(DATA[0]);
    
    // Generar URL de cancelación con ID prellenado
    const urlCancelacionDirecta = generarUrlCancelacion(DATA[0]);
    
    const buker = {
        email: DATA[1],
        name: DATA[2],
        date: formattedDate(DATA[3]),
        hour: DATA[4],
        patente: DATA[5],
        link: link_cancelar,
        url_cancelar: urlCancelacionDirecta, // URL directa de cancelación con ID prellenado
        cola: puesto_cola,
    };
    return buker;
}

/**
 * It sends an email to the user with the data from the form
 * @param DATA - The data that you want to send to the email.
 */
function sendEmailListaEspera(DATA) {
    const body = getDataListaEspera(DATA);
    const htmlBody = getHTMLlistaEspera(body);

    MailApp.sendEmail({
        to: body.email,
        replyTo: "estacionamientos@buk.cl",
        subject: "Lista de Espera " + body.date + ' (' + body.hour + ')',
        body: body,
        htmlBody: htmlBody,
    });
}
