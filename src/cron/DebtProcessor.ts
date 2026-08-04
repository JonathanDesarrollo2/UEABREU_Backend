// src/cron/debtScheduler.ts
import cron from 'node-cron';
import { BillingService } from '../services/billingServices';
export function startDebtScheduler() {
  // Ejecutar la mensualidad el día 1 de cada mes a las 00:01 hora de Venezuela
  cron.schedule('1 0 1 * *', async () => {
    console.log('[CRON] Aplicando mensualidades mensuales...');
    await BillingService.applyMonthlyFee();
  }, {
    timezone: 'America/Caracas'
  });

  console.log('✅ Planificador de mensualidades iniciado (hora Venezuela)');
}