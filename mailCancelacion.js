/**
 * It sends an email to the user with the data of the parking lot
 * @param DATA - is the data from the spreadsheet
 * @param CUPO_ASIGNADO - This is the row of the spreadsheet that contains the data of the parking spot
 * that was assigned to the user.
 */
function sendEmailcupoCancelacion(DATA, CUPO_ASIGNADO) {
    const body = getData(DATA, CUPO_ASIGNADO);
    const htmlBody = getHTMLcancelar(body);

    MailApp.sendEmail({
        to: body.email,
        replyTo: "estacionamientos@buk.cl",
        subject: "Cancelación de estacionamiento " + body.date + ' (' + body.hour + ')',
        body: body,
        htmlBody: htmlBody,
    });
}

/**
 * It takes a buker object as an argument, and returns the HTML body of the cancelacionAdmin.html file,
 * with the buker object passed to the HTML file.
 * @param buker - The buker object that contains the data for the buker.
 * @returns The HTML content of the template.
 */
function getHTMLcancelar(buker) {
    const htmlTemplate = HtmlService.createTemplateFromFile(
        "cancelacionAdmin.html"
    );
    htmlTemplate.buker = buker;
    const htmlBody = htmlTemplate.evaluate().getContent();
    return htmlBody;
}
