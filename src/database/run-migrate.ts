// src/database/run-migrate.ts
import { migrator } from './migrator';

async function runMigrations() {
  try {
    const pendingMigrations = await migrator.pending();
    if (pendingMigrations.length === 0) {
      console.log('✅ No hay migraciones pendientes.');
      return;
    }

    console.log('📦 Ejecutando migraciones pendientes:');
    pendingMigrations.forEach((m) => console.log(`- ${m.name}`));

    await migrator.up();
    console.log('✅ Todas las migraciones ejecutadas exitosamente.');
    
  } catch (error) {
    console.error('❌ Error en migraciones:', error);
    process.exit(1);
  }
}

// Si se ejecuta directamente desde la línea de comandos
if (require.main === module) {
  runMigrations();
}

export default runMigrations;