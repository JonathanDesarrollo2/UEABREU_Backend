import Setting from "../database/models/settings";

export async function getCurrentDate(): Promise<Date> {
  // 1. Si existe la variable de entorno SIMULATED_DATE (usada por el simulador), usarla
  const envDate = process.env.SIMULATED_DATE;
  if (envDate) {
    return new Date(envDate + 'T00:00:00');
  }

  // 2. Si no, consultar en la tabla settings (por si hay fecha simulada persistida)
  try {
    const setting = await Setting.findOne({ where: { key: 'simulated_date' } });
    if (setting && setting.value) {
      return new Date(setting.value + 'T00:00:00');
    }
  } catch (error) {
    console.error('Error obteniendo fecha simulada desde Settings:', error);
  }

  // 3. Finalmente, fecha real
  return new Date();
}