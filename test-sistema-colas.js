/**
 * FUNCIONES DE PRUEBA PARA SISTEMA DE COLAS ON-DEMAND
 *
 * Estas funciones NO requieren parámetros - solo darles "play" en el editor
 */

/**
 * TEST 1: Prueba básica del sistema on-demand
 *
 * Ejecuta esto para probar que el sistema crea triggers on-demand correctamente
 */
function test_SistemaOnDemand() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║           TEST: Sistema On-Demand                            ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  // 1. Encolar una operación de prueba
  Logger.log("1️⃣ Encolando operación de prueba...");
  const testId = 'test-ondemand-' + Date.now();
  const resultado = encolarAsignacionCupo(testId, null, null, 'test_manual');

  if (resultado.success) {
    Logger.log(`✅ Operación encolada: ${resultado.requestId}`);
    Logger.log(`   Posición en cola: ${resultado.positionInQueue}\n`);
  } else {
    Logger.log(`❌ Error: ${resultado.error}\n`);
    return;
  }

  // 2. Verificar que se creó trigger on-demand
  Logger.log("2️⃣ Verificando trigger on-demand...");
  const tieneTriger = existeTriggerProcesamientoPendiente();

  if (tieneTriger) {
    Logger.log("✅ Trigger on-demand creado correctamente");
    Logger.log("   Se ejecutará en ~3 minutos\n");
  } else {
    Logger.log("⚠️ No se encontró trigger on-demand");
    Logger.log("   Esto podría ser normal si ya existía uno\n");
  }

  // 3. Ver estado actual
  Logger.log("3️⃣ Estado de la cola:");
  verEstadoCola();

  Logger.log("\n💡 Siguiente paso:");
  Logger.log("   • Espera 3 minutos");
  Logger.log("   • Ejecuta: test_VerificarProcesamiento()");
  Logger.log("   • Para forzar procesamiento ahora: procesarColaAhora()\n");
}

/**
 * TEST 2: Verificar que el procesamiento ocurrió
 *
 * Ejecuta esto DESPUÉS de esperar 3 minutos (o después de procesarColaAhora)
 */
function test_VerificarProcesamiento() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║        TEST: Verificar Procesamiento                         ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  // 1. Verificar que la cola está vacía
  Logger.log("1️⃣ Estado de la cola:");
  const estado = verEstadoCola();

  if (estado.size === 0) {
    Logger.log("\n✅ Cola vacía - Las operaciones fueron procesadas");
  } else {
    Logger.log(`\n⚠️ Aún hay ${estado.size} operación(es) en cola`);
    Logger.log("   Espera más tiempo o ejecuta: procesarColaAhora()");
  }

  // 2. Verificar que no hay triggers on-demand pendientes
  Logger.log("\n2️⃣ Triggers on-demand:");
  const tieneTriger = existeTriggerProcesamientoPendiente();

  if (!tieneTriger) {
    Logger.log("✅ No hay triggers pendientes - Se auto-eliminaron correctamente");
  } else {
    Logger.log("⚠️ Aún hay trigger pendiente - Está por ejecutarse");
  }

  Logger.log("\n3️⃣ Ver últimas ejecuciones:");
  Logger.log("   Ve a: Ver → Ejecuciones (en el menú superior)");
  Logger.log("   Busca: procesarColaPrincipal");
  Logger.log("   Deberías ver una ejecución exitosa reciente\n");
}

/**
 * TEST 3: Ver estado completo del sistema
 */
function test_DiagnosticoCompleto() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║           DIAGNÓSTICO COMPLETO                               ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  diagnosticoCompletoCola();
}

/**
 * TEST 4: Simular múltiples usuarios (prueba de concurrencia)
 */
function test_MultiplesUsuarios() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║        TEST: Múltiples Usuarios Concurrentes                ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  Logger.log("Simulando 5 usuarios enviando formularios...\n");

  // Simular 5 operaciones en rápida sucesión
  for (let i = 1; i <= 5; i++) {
    const testId = `test-user${i}-${Date.now()}`;
    const resultado = encolarAsignacionCupo(testId, null, null, `usuario_${i}`);

    if (resultado.success) {
      Logger.log(`✅ Usuario ${i}: Encolado en posición ${resultado.positionInQueue}`);
    } else {
      Logger.log(`❌ Usuario ${i}: Error - ${resultado.error}`);
    }
  }

  Logger.log("\n📊 Estado de la cola:");
  verEstadoCola();

  Logger.log("\n💡 Resultado esperado:");
  Logger.log("   • Solo se creó 1 trigger on-demand (no 5)");
  Logger.log("   • Las 5 operaciones serán procesadas por ese único trigger");
  Logger.log("   • Orden FIFO garantizado (Usuario 1 → 2 → 3 → 4 → 5)");
  Logger.log("\n   Para procesar ahora: procesarColaAhora()\n");
}

/**
 * UTILIDAD: Procesar cola inmediatamente (sin esperar 3 min)
 */
function test_ProcesarInmediato() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║        PROCESANDO COLA INMEDIATAMENTE                        ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  procesarColaAhora();

  Logger.log("\n💡 Para verificar resultado:");
  Logger.log("   Ejecuta: test_VerificarProcesamiento()\n");
}

/**
 * UTILIDAD: Limpiar todo (resetear para nuevas pruebas)
 */
function test_LimpiarSistema() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║           ⚠️  LIMPIANDO SISTEMA DE PRUEBAS                  ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  // 1. Vaciar cola
  Logger.log("1️⃣ Vaciando cola...");
  const resultadoCola = vaciarCola();
  Logger.log(`   Eliminadas: ${resultadoCola.operacionesEliminadas} operación(es)\n`);

  // 2. Limpiar triggers on-demand
  Logger.log("2️⃣ Limpiando triggers on-demand...");
  const eliminados = limpiarTriggersProcesamientoCompletados();
  Logger.log(`   Eliminados: ${eliminados} trigger(s)\n`);

  Logger.log("✅ Sistema limpio - Listo para nuevas pruebas\n");
}

/**
 * INFORMACIÓN: Ver cómo usar estas funciones
 */
function test_ComoUsar() {
  Logger.log("╔══════════════════════════════════════════════════════════════╗");
  Logger.log("║           CÓMO USAR LAS FUNCIONES DE PRUEBA                  ║");
  Logger.log("╚══════════════════════════════════════════════════════════════╝\n");

  Logger.log("📋 SECUENCIA RECOMENDADA:\n");

  Logger.log("1️⃣ test_SistemaOnDemand()");
  Logger.log("   → Encola operación y crea trigger on-demand\n");

  Logger.log("2️⃣ Esperar 3 minutos (o ejecutar test_ProcesarInmediato)\n");

  Logger.log("3️⃣ test_VerificarProcesamiento()");
  Logger.log("   → Verifica que todo se procesó correctamente\n");

  Logger.log("4️⃣ test_MultiplesUsuarios()");
  Logger.log("   → Prueba concurrencia (5 usuarios simultáneos)\n");

  Logger.log("5️⃣ test_LimpiarSistema()");
  Logger.log("   → Limpia para empezar de nuevo\n");

  Logger.log("═══════════════════════════════════════════════════════════════\n");
  Logger.log("🔍 FUNCIONES DE DIAGNÓSTICO:\n");

  Logger.log("• test_DiagnosticoCompleto() - Estado completo del sistema");
  Logger.log("• verEstadoCola() - Ver cola actual");
  Logger.log("• verTriggersDelSistemaCola() - Ver triggers instalados\n");

  Logger.log("═══════════════════════════════════════════════════════════════\n");
  Logger.log("Para ejecutar: Selecciona la función y dale click en ▶ (play)\n");
}
