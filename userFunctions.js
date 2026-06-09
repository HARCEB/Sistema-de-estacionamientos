function obtenerHoraDeId(id){
    const spreadsheetEstacionamientos = obtenerHojaPrincipal().getSheetByName('Estacionamientos_Asignados');
    const hora = spreadsheetEstacionamientos.getRange("A2:A").createTextFinder(id).findAll().map(data => spreadsheetEstacionamientos.getRange(data.getRow(), 5).getValue())
    return hora[0]
  }
  
  function obtenerCupoDeId(id){
    const spreadsheetEstacionamientos = obtenerHojaPrincipal().getSheetByName('Estacionamientos_Asignados');
    const cupo = spreadsheetEstacionamientos.getRange("A2:A").createTextFinder(id).findAll().map(data => spreadsheetEstacionamientos.getRange(data.getRow(), 6).getValue())
    return cupo[0].toUpperCase()
  }
  
  function obtenerNombreDeId(id){
    const spreadsheetEstacionamientos = obtenerHojaPrincipal().getSheetByName('Estacionamientos_Asignados');
    const nombre = spreadsheetEstacionamientos.getRange("A2:A").createTextFinder(id).findAll().map(data => spreadsheetEstacionamientos.getRange(data.getRow(), 2).getValue())
    return nombre[0]
  }
  
  function obtenerMailDeId(id){
    const spreadsheetEstacionamientos = obtenerHojaPrincipal().getSheetByName('Estacionamientos_Asignados');
    const mail = spreadsheetEstacionamientos.getRange("A2:A").createTextFinder(id).findAll().map(data => spreadsheetEstacionamientos.getRange(data.getRow(), 3).getValue())
    return mail[0]
  }
  