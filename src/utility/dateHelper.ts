// src/utility/dateHelper.ts
import Setting from '../database/models/settings';

export const getCurrentDate = async (): Promise<Date> => {
  // Si la simulación no está habilitada, fecha real
  if (process.env.ENABLE_SIMULATION !== 'true') {
    return new Date();
  }

  // 1. Intentar variable de entorno (por si se estableció en la sesión)
  const envDate = process.env.SIMULATED_DATE;
  if (envDate) {
    const parsed = new Date(envDate + 'T00:00:00');
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // 2. Intentar persistencia en BD
  try {
    const setting = await Setting.findOne({ where: { key: 'simulated_date' } });
    if (setting && setting.value) {
      const parsed = new Date(setting.value + 'T00:00:00');
      if (!isNaN(parsed.getTime())) return parsed;
    }
  } catch (error) {
    console.error('Error al obtener fecha simulada desde Settings:', error);
  }

  return new Date();
};