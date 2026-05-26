function obtenerHojaPrincipal() {
    const SCRIPT_PROPERTIES =
        PropertiesService.getScriptProperties().getProperties();
    const HOJA = SpreadsheetApp.openById(SCRIPT_PROPERTIES["sheet_id"]);
    return HOJA;
}

/**
 * It searches for a value in a range of cells and returns the value of the cell in the same row but in
 * a different column
 * @param hoja - the sheet you want to search in
 * @param range - The range of cells to search.
 * @param indexCol - The column index of the value you want to return.
 * @param valueToSearch - The value you want to search for.
 * @returns An array of values from the column indexCol
 */
function findValues(hoja, range, indexCol, valueToSearch) {
    return hoja
        .getRange(range)
        .createTextFinder(valueToSearch)
        .findAll()
        .map(
            (data) => hoja.getRange(data.getRow(), indexCol).getValues()[0][0]
        );
}


/**
 * It searches for an unique value in a range of cells and returns the value of the cell in the same row but in
 * a different column
 * @param hoja - the sheet object
 * @param range - The range of the sheet to search in.
 * @param indexCol - The column index of the cell you want to get the value from.
 * @param value - The value to search for.
 * @returns An array of values from the column indexCol that match the value.
 */
function matchCell(hoja, range, indexCol, value) {
    return hoja
        .getRange(range)
        .createTextFinder(value)
        .matchEntireCell(true)
        .findAll()
        .map(
            (data) => hoja.getRange(data.getRow(), indexCol).getValues()[0][0]
        );
}

/**
 * It takes a sheet and a range, and returns an array of the values in the range, excluding empty cells
 * @param hoja - the sheet you want to get the data from
 * @param rango - The range of cells to be read.
 * @returns An array of values from the range.
 */
function valoresRango(hoja, rango) {
    return hoja.getRange(rango)
               .getValues()
               .filter((data) => data[0].length > 0)
               .map((data) => data[0]);
}

/**
 * It returns an array of row index numbers that match the value in the range.
 * @param hoja - the sheet you want to search
 * @param rango - The range of cells to search.
 * @param valor - The value you're looking for
 * @returns An array of row numbers.
 */
function getIndexMatch(hoja, rango, valor) {
    return hoja.getRange(rango).createTextFinder(valor)
    .matchEntireCell(true)
    .findAll()
    .map(data => data.getRow())
}
