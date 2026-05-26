/**
 * It sends an email to the user with the data of the reservation
 * @param DATA - is the data from the form
 * @param CUPO_ASIGNADO - The name of the sheet where the data is stored.
 */
function sendEmailcupoAsignado(DATA, CUPO_ASIGNADO) {
    const body = getData(DATA, CUPO_ASIGNADO);
    const htmlBody = getHTMLcupoAsignado(body);

    MailApp.sendEmail({
        to: body.email,
        replyTo: "estacionamientos@buk.cl",
        subject: 'Reserva estacionamiento ' + body.date + ' (' + body.hour + ')' + ' exitosa',
        body: body,
        htmlBody: htmlBody,
    });
}

/**
 * It takes a row of data from a Google Sheet and returns an object with the data formatted in a way
 * that's easy to use in a template
 * @param DATA - is an array of data that is returned from the database.
 * @param CUPO_ASIGNADO - The parking spot assigned to the user.
 * @returns an object with the following properties:
 * email, name, date, hour, patente, estacionamiento, url_cancelar, cola.
 */
function getData(DATA, CUPO_ASIGNADO) {
    const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties().getProperties();
    const link_cancelar = SCRIPT_PROPERTIES["url"];
    const puesto_cola = getNumeroCola(DATA[0]);
    
    // Generar URL de cancelación directa con ID prellenado
    const urlCancelacionDirecta = generarUrlCancelacion(DATA[0]);
    
    const buker = {
        email: DATA[1],
        name: DATA[2],
        date: formattedDate(DATA[3]),
        hour: DATA[4],
        patente: DATA[5],
        estacionamiento: CUPO_ASIGNADO,
        link: link_cancelar,
        urlCancelar: urlCancelacionDirecta, // NUEVA: URL directa de cancelación
        cola: puesto_cola,
    };
    return buker;
}

/**
 * It takes a buker object and returns the HTML content of the cupoAsignado.html file
 * @param buker - The buker object that contains the data to be displayed in the HTML template.
 * @returns The HTML content of the template.
 */
function getHTMLcupoAsignado(buker) {
    const htmlTemplate =
        HtmlService.createTemplateFromFile("cupoAsignado.html");
    htmlTemplate.buker = buker;
    const htmlBody = htmlTemplate.evaluate().getContent();
    return htmlBody;
}
