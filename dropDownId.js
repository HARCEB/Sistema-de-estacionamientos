/**
 * It gets the list of IDs from the "Fila_Espera" sheet, and then sets the data validation for the "ID"
 * cell in the "ADMIN" sheet to be the list of IDs
 */
function updateIdList() {
    const hojaFilaEspera = obtenerHojaPrincipal().getSheetByName("Fila_Espera");
    const hojaAdmin = obtenerHojaPrincipal().getSheetByName("ADMIN");

    const idList = hojaFilaEspera
        .getRange("A2:A")
        .getValues()
        .filter((row) => row.some((x) => !!x));
    const validation = SpreadsheetApp.newDataValidation()
        .requireValueInList(idList)
        .build();
    hojaAdmin.getRange("C11").setDataValidation(validation);
}
