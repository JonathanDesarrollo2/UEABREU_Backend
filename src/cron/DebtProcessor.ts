// src/cron/debtScheduler.ts
import cron from 'node-cron';
import { BillingService } from '../services/billingServices';
export function startDebtScheduler() {
  // Ejecutar la mensualidad el día 1 de cada mes a las 00:01 hora de Venezuela
  cron.schedule('1 0 1 * *', async () => {
    await BillingService.applyMonthlyFee();
  }, {
    timezone: 'America/Caracas'
  });

  // La tasa publicada a las 18:00 queda como fecha valor del día siguiente.
  cron.schedule('0 18 * * *', async () => {
    try {
      await BillingService.refreshDailyBCVRate();
    } catch {
      // Un fallo temporal del banco no debe detener el servidor ni alterar
      // el historial existente; la siguiente ejecución reintenta la tasa.
    }
  }, { timezone: 'America/Caracas' });
}
