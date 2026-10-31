import cron from 'node-cron';
import { BillingService } from '../services/billingServices';
import ExchangeRate from '../database/models/exchangeRate';

export function startDebtScheduler() {
  // 1. Ejecutar la mensualidad el día 1 de cada mes a las 00:01 hora de Venezuela
  cron.schedule('1 0 1 * *', async () => {
    await BillingService.applyMonthlyFee();
  }, {
    timezone: 'America/Caracas'
  });

  // 2. La tasa publicada a las 19:00 queda como fecha valor del día siguiente.
  cron.schedule('0 19 * * *', async () => {
    try {
      await BillingService.refreshDailyBCVRate();
      console.log('✅ [Cron 19:00] Tasa BCV para el día siguiente actualizada.');
    } catch (e: any) {
      console.error('❌ [Cron 19:00] Error al obtener tasa BCV para mañana:', e.message);
    }
  }, { timezone: 'America/Caracas' });

  // ⏱️ NUEVO: 3. Aplicar recargo por pronto pago (todos los días a las 00:05)
  // Como la función internamente verifica si ya pasó el día 10, se puede
  // ejecutar todos los días sin problema. Si es día 11, 12, etc., aplicará.
  cron.schedule('5 0 * * *', async () => {
    try {
      await BillingService.applyProntoPagoRecargo();
    } catch (e: any) {
      console.error('❌ [Cron 00:05] Error al aplicar recargo por pronto pago:', e.message);
    }
  }, { timezone: 'America/Caracas' });

  // 4. ⏱️ AUTO-RETRY: Bucle de seguridad cada 2 minutos.
  // Si el servidor reinició, si hubo un corte de red, o si el cron de las 19:00 falló,
  // esto se asegura de que la tasa del DÍA DE HOY exista en la Base de Datos.
  setInterval(async () => {
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
      const rateExists = await ExchangeRate.findOne({ where: { effectiveDate: today } });
      
      if (!rateExists) {
        console.log(`🔄 [Auto-Retry] No hay tasa registrada para hoy (${today}). Consultando al banco...`);
        const rate = await BillingService.getCurrentBCVRate();
        console.log(`✅ [Auto-Retry] Tasa obtenida y guardada exitosamente: ${rate} Bs/USD`);
      }
    } catch (e: any) {
      console.error(`⚠️ [Auto-Retry] Falló el intento de obtener la tasa del banco: ${e.message}`);
    }
  }, 120000); // Se ejecuta cada 2 minutos (120,000 ms)
}