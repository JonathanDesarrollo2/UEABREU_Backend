import cron from 'node-cron';
import { Op } from 'sequelize'; // ✅ Importamos Op directamente
import sequelize from '../database/config';
import Student from '../database/models/student';

const DEBT_AMOUNT = 100;
const PENALTY_AMOUNT = 20;

async function addDailyDebt() {
  try {
    const [affectedRows] = await Student.update(
      { balance: sequelize.literal(`balance - ${DEBT_AMOUNT}`) },
      { where: {} }
    );
    console.log(`[DEBT] Deuda diaria de ${DEBT_AMOUNT} Bs aplicada a todos los estudiantes (${affectedRows} afectados)`);
  } catch (error) {
    console.error('[DEBT] Error al aplicar deuda diaria:', error);
  }
}

async function applyPenalty() {
  try {
    const [affectedRows] = await Student.update(
      { balance: sequelize.literal(`balance - ${PENALTY_AMOUNT}`) },
      {
        where: {
          balance: { [Op.lt]: 0 } // ✅ Ahora funciona
        }
      }
    );
    console.log(`[PENALTY] Penalización de ${PENALTY_AMOUNT} Bs aplicada a ${affectedRows} estudiante(s) con deuda pendiente`);
  } catch (error) {
    console.error('[PENALTY] Error al aplicar penalización:', error);
  }
}

export function startDebtScheduler() {
  // Tarea diaria a las 00:00 (medianoche) – hora Venezuela
  cron.schedule('0 0 * * *', () => {
    console.log('[CRON] Ejecutando deuda diaria (medianoche)');
    addDailyDebt();
  }, {
    timezone: 'America/Caracas' // ✅ Zona horaria de Venezuela
  });

  // Tarea diaria a las 12:00 (mediodía) – hora Venezuela
  cron.schedule('0 11 * * *', () => {
    console.log('[CRON] Ejecutando penalización (mediodía)');
    applyPenalty();
  }, {
    timezone: 'America/Caracas'
  });

  console.log('✅ Planificador de deudas iniciado (hora Venezuela)');
}