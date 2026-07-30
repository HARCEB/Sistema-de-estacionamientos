function obtenerHojaPrincipal() {
    const sheetId = PropertiesService.getScriptProperties().getProperty("sheet_id");
    const HOJA = SpreadsheetApp.openById(sheetId);
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

/**
 * Retorna la lista de correos electrónicos de los administradores del sistema.
 * Si la hoja "ADMINS" no existe, la crea de forma automatizada e inserta al admin por defecto.
 * @returns {string[]} Lista de correos en minúsculas.
 */
function obtenerListaAdministradores() {
  try {
    const ss = obtenerHojaPrincipal();
    let sheetAdmins = ss.getSheetByName('ADMINS');
    
    // Si la hoja de administradores no existe (Self-Healing), la creamos de inmediato
    if (!sheetAdmins) {
      Logger.log("Creando hoja ADMINS de forma automática...");
      sheetAdmins = ss.insertSheet('ADMINS');
      // Escribir cabecera y el administrador principal por defecto
      sheetAdmins.getRange("A1").setValue("Email");
      sheetAdmins.getRange("A2").setValue("capaza@buk.pe");
      SpreadsheetApp.flush();
    }
    
    const displayValues = sheetAdmins.getDataRange().getDisplayValues();
    const listaAdmins = [];
    
    // Leer correos (saltar fila 1 de cabeceras)
    for (let i = 1; i < displayValues.length; i++) {
      const email = displayValues[i][0];
      if (email && email.toString().trim() !== "") {
        listaAdmins.push(email.toString().trim().toLowerCase());
      }
    }
    
    // Asegurar que al menos esté capaza@buk.pe en caso de que la hoja esté vacía por error
    if (listaAdmins.length === 0) {
      listaAdmins.push("capaza@buk.pe");
    }
    
    return listaAdmins;
  } catch (error) {
    Logger.log("Error al obtener lista de administradores: " + error);
    // Fallback de seguridad en caso de cualquier error crítico
    return ["capaza@buk.pe"];
  }
}

/**
 * Verifica si un correo corresponde a un administrador del sistema.
 * @param {string} email - Correo a verificar.
 * @returns {boolean} true si es administrador, false de lo contrario.
 */
function esUsuarioAdministrador(email) {
  if (!email) return false;
  const listaAdmins = obtenerListaAdministradores();
  return listaAdmins.includes(email.trim().toLowerCase());
}
