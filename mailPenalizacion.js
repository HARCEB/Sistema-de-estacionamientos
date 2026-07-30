/**
 * Envía un correo electrónico notificando que el usuario ha sido penalizado
 * @param {string} email - Correo del usuario
 * @param {string} nombre - Nombre del usuario
 * @param {string} fechaLiberacion - Fecha en que finaliza la sanción
 */
function sendEmailPenalizacion(email, nombre, fechaLiberacion) {
  try {
    const buker = {
      name: nombre || "Buker",
      email: email,
      dateLiberacion: fechaLiberacion
    };
    
    const htmlTemplate = HtmlService.createTemplateFromFile("mailPenalizacionTemplate");
    htmlTemplate.buker = buker;
    const htmlBody = htmlTemplate.evaluate().getContent();
    
    MailApp.sendEmail({
      to: email,
      replyTo: "estacionamientos@buk.cl",
      subject: "Notificación de Penalización - Estacionamientos Buk",
      body: "Tu cuenta ha sido penalizada por inasistencia. No podrás reservar estacionamientos por 14 días.",
      htmlBody: htmlBody
    });
    Logger.log("Email de penalización enviado a: " + email);
  } catch (error) {
    Logger.log("ERROR en sendEmailPenalizacion: " + error);
    throw error;
  }
}
