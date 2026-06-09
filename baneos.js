/**
 * It searches for a specific email in a spreadsheet and returns true if it finds it.
 * @param email - email of the user
 * @returns a boolean value.
 */
function verificarBan(email) {
    const spreadsheetSanciones = obtenerHojaPrincipal().getSheetByName('Sanciones');
    const busquedaSanciones = matchCell(spreadsheetSanciones, "A2:A", 1, email)
    if (busquedaSanciones.length > 0) return true
    return false
}
  
/**
 * It deletes all the rows in the sheet "Sanciones" that have the current date in column B.
 */
function terminarBaneos(){
    const spreadsheetSanciones = obtenerHojaPrincipal().getSheetByName('Sanciones');
    const fechaHoy = formattedDate(new Date())
    let baneosIndex = getIndexMatch(spreadsheetSanciones, "B2:B", fechaHoy)
    while (baneosIndex.length > 0){
      spreadsheetSanciones.deleteRows(baneosIndex[0])
      baneosIndex = getIndexMatch(spreadsheetSanciones, "B2:B", fechaHoy)
    }
}
