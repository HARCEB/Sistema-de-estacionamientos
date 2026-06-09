/**
 * It takes a buker object and returns a string of HTML
 * @param buker - The name of the person who is trying to book the room.
 * @param razon - The specific reason why the reservation failed.
 * @returns The HTML code of the template.
 */
function getHTMLnoPuede(buker, razon) {
    const htmlTemplate = HtmlService.createTemplateFromFile(
        "noPuedeReservar.html"
    );
    htmlTemplate.buker = buker;
    htmlTemplate.razon = razon;
    const htmlBody = htmlTemplate.evaluate().getContent();
    return htmlBody;
}

/**
 * It sends an email to the user with the data from the form
 * @param DATA - The data object that you want to send.
 * @param razon - The specific reason why the reservation failed.
 */
function sendEmailNoPuede(DATA, razon) {
    const body = getData(DATA);
    const htmlBody = getHTMLnoPuede(body, razon);

    MailApp.sendEmail({
        to: body.email,
        replyTo: "estacionamientos@buk.cl",
        subject: "No se pudo completar tu reserva para " + body.date + ' (' + body.hour + ')' ,
        body: body,
        htmlBody: htmlBody,
    });
}
