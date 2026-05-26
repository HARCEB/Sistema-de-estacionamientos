function sendReminder() {
    const sheet = obtenerHojaPrincipal().getSheetByName("Estacionamientos_Asignados");
    const scriptProperties = PropertiesService.getScriptProperties().getProperties();
    const cancelLink = scriptProperties["url"];
    const replyEmail = scriptProperties["reply_email"];

    const today = new Date();
    const reminderDate = new Date(today);
    reminderDate.setDate(today.getDate() + 1); 
    
    const matchingRows = getIndexMatch(sheet, "D:D", formattedDate(reminderDate));

    for (let i = 0; i < matchingRows.length; i++) {
        const rowIndex = matchingRows[i];
        
        // 🚀 CORRECCIÓN 1: getDisplayValues() en lugar de getValues()
        const rowData = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];

        const body = {
            email: rowData[2],
            name: rowData[1],
            // 🚀 CORRECCIÓN 2: Quitamos formattedDate(), mandamos el texto directo
            date: rowData[3], 
            hour: rowData[4],
            patente: rowData[6],
            estacionamiento: rowData[5],
            link: cancelLink
        };

        sendEmailAssignedSpot(body, replyEmail);  
    }
}

function sendEmailAssignedSpot(body, replyEmail) {
    const htmlBody = getReminderHtml(body);

    MailApp.sendEmail({
        to: body.email,
        replyTo: replyEmail,
        subject: 'Recordatorio reserva estacionamiento ' + body.date + ' (' + body.hour + ')',
        body: JSON.stringify(body, null, 2), 
        htmlBody: htmlBody,
    });    
}

function getReminderHtml(data) {
    const htmlTemplate = HtmlService.createTemplateFromFile("reminderEmail.html");
    htmlTemplate.data = data;
    return htmlTemplate.evaluate().getContent();
}