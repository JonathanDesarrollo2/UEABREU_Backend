import Setting from "../database/models/settings";

let cachedSimulatedDate: Date | null = null;
let lastFetch = 0;

export async function getCurrentDate(): Promise<Date> {
  // Solo verificar la base de datos cada 5 segundos para no saturarla
  if (Date.now() - lastFetch > 5000) {
    const setting = await Setting.findOne({ where: { key: 'simulated_date' } });
    cachedSimulatedDate = setting ? new Date(setting.value + 'T00:00:00') : null;
    lastFetch = Date.now();
  }
  return cachedSimulatedDate || new Date();
}