// src/controllers/admin-backfill-controller.ts
import { Request, Response } from 'express';
import { Op } from 'sequelize';
import sequelize from '../database/config';
import UserLogin from '../database/models/userlogin';
import Student from '../database/models/student';
import Representative from '../database/models/representative';
import Transaction, { TransactionType } from '../database/models/transaction';
import AuditLog from '../database/models/auditLog';
import { BillingService } from '../services/billingServices';
import { ErrorLog } from '../utility/ErrorLog';
import { getErrorLocation } from '../utility/callerinfo';
import { getCurrentDate } from '../utility/dateHelper';

export class AdminBackfillController {
  /**
   * Backfill: aplica SOLO la mensualidad del mes en curso a los estudiantes
   * que fueron activados sin pasar por BillingService y que aún no tienen
   * la FEE de este mes.
   *
   * Body:
   *   { mode: 'preview' | 'apply', password: string, studentIds?: string[] }
   *
   * - Si `studentIds` se omite → autodetecta afectados.
   * - Si `studentIds` se envía → solo aplica a esos (útil para ser muy específico).
   * - Requiere nivel 2 + contraseña del propio admin.
   */
  static backfillCurrentMonthFee = async (req: Request, res: Response) => {
    const adminId = req.tokenData?.id;
    const { mode, password, studentIds } = req.body as {
      mode?: 'preview' | 'apply';
      password?: string;
      studentIds?: string[];
    };

    if (!adminId) {
      return res.status(401).json({ result: false, content: [], error: ['No autenticado'] });
    }
    if (mode !== 'preview' && mode !== 'apply') {
      return res.status(400).json({ result: false, content: [], error: ['mode debe ser "preview" o "apply"'] });
    }
    if (!password || typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ result: false, content: [], error: ['Contraseña requerida'] });
    }
    if (studentIds !== undefined && (!Array.isArray(studentIds) || studentIds.some((x) => typeof x !== 'string'))) {
      return res.status(400).json({ result: false, content: [], error: ['studentIds debe ser un array de strings'] });
    }

    try {
      // ── 1. Autenticación por nivel 2 + password ─────────────────
      const admin = await UserLogin.findByPk(adminId);
      if (!admin) {
        return res.status(404).json({ result: false, content: [], error: ['Usuario no encontrado'] });
      }
      if (admin.nivel !== 2) {
        return res.status(403).json({ result: false, content: [], error: ['Solo el administrador nivel 2 puede ejecutar el backfill'] });
      }
      const ok = await admin.comparePassword(password);
      if (!ok) {
        return res.status(403).json({ result: false, content: [], error: ['Contraseña incorrecta'] });
      }

      // ── 2. Determinar fecha/descripción del mes en curso ────────
      const today = await getCurrentDate();
      const year = today.getFullYear();
      const month = today.getMonth();
      const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
      ];
      const currentMonthDesc = `Mensualidad ${monthNames[month]} ${year}`;
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 1);

      // ── 3. Identificar afectados ────────────────────────────────
      const ACTIVE_STATUSES = ['regular', 'repitiente', 'condicionado'];

      // Subquery: estudiantes que SÍ tienen la FEE del mes
      const withFee = await Transaction.findAll({
        attributes: ['studentId'],
        where: {
          type: TransactionType.FEE,
          description: currentMonthDesc,
          createdAt: { [Op.gte]: monthStart, [Op.lt]: monthEnd },
          studentId: { [Op.ne]: null },
        },
        raw: true,
      });
      const studentIdsWithFee = new Set(withFee.map((t: any) => t.studentId));

      // Query principal
      const candidatesWhere: any = {
        status: { [Op.in]: ACTIVE_STATUSES },
        currentGrade: {
          [Op.and]: [
            { [Op.ne]: null },
            { [Op.ne]: '' },
            { [Op.ne]: 'En asignar' },
          ],
        },
        section: {
          [Op.and]: [
            { [Op.ne]: null },
            { [Op.ne]: '' },
            { [Op.ne]: 'Pendiente' },
          ],
        },
      };

      // Si el admin pasó IDs manuales, respetamos esa lista
      if (studentIds && studentIds.length > 0) {
        candidatesWhere.id = { [Op.in]: studentIds };
      }

      const candidates = await Student.findAll({
        where: candidatesWhere,
        attributes: ['id', 'fullName', 'identityCard', 'currentGrade', 'section', 'status', 'balance', 'representativeId', 'exonerationPercent'],
        include: [
          { model: Representative, as: 'representative', attributes: ['id', 'fullName', 'identityCard'], required: false },
        ],
        order: [['fullName', 'ASC']],
      });

      // Filtrar los que ya tienen la FEE del mes
      const affected = candidates.filter((s: any) => !studentIdsWithFee.has(s.id));

      // ── 4. Preview ─────────────────────────────────────────────
      const preview = affected.map((s: any) => ({
        id: s.id,
        fullName: s.fullName,
        identityCard: s.identityCard,
        currentGrade: s.currentGrade,
        section: s.section,
        status: s.status,
        balanceUSD: Math.round((s.balance || 0) * 100) / 100,
        exonerationPercent: s.exonerationPercent || 0,
        representativeId: s.representativeId,
        representativeName: s.representative?.fullName || '—',
      }));

      if (mode === 'preview') {
        return res.json({
          result: true,
          content: {
            mode: 'preview',
            monthDescription: currentMonthDesc,
            totalAffected: affected.length,
            affected: preview,
          },
          error: [],
        });
      }

      // ── 5. Apply ────────────────────────────────────────────────
      const results: any[] = [];
      let appliedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      for (const s of affected) {
        const tx = await sequelize.transaction();
        try {
          const r = await BillingService.ensureCurrentMonthFee(
            s.id!,
            s.representativeId!,
            tx
          );
          if (r.applied) {
            await tx.commit();
            appliedCount++;
            results.push({
              studentId: s.id,
              fullName: s.fullName,
              applied: true,
              amountUSD: r.amountUSD,
            });
          } else {
            await tx.rollback();
            skippedCount++;
            results.push({
              studentId: s.id,
              fullName: s.fullName,
              applied: false,
              reason: r.reason,
            });
          }
        } catch (e: any) {
          await tx.rollback();
          errorCount++;
          results.push({
            studentId: s.id,
            fullName: s.fullName,
            applied: false,
            error: e?.message || 'unknown',
          });
        }
      }

      // ── 6. Auditoría ────────────────────────────────────────────
      await AuditLog.create({
        userId: admin.id!,
        action: 'BACKFILL_CURRENT_MONTH_FEE',
        details: {
          monthDescription: currentMonthDesc,
          totalCandidates: candidates.length,
          totalAffected: affected.length,
          appliedCount,
          skippedCount,
          errorCount,
          executedBy: {
            id: admin.id,
            userlogin: admin.userlogin,
            username: admin.username,
            nivel: admin.nivel,
          },
          results,
          timestamp: new Date().toISOString(),
        },
      });

      return res.json({
        result: true,
        content: {
          mode: 'apply',
          monthDescription: currentMonthDesc,
          totalCandidates: candidates.length,
          totalAffected: affected.length,
          appliedCount,
          skippedCount,
          errorCount,
          results,
        },
        error: [],
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'AdminBackfillController', getErrorLocation('backfillCurrentMonthFee'));
      return res.status(500).json({ result: false, content: [], error: [error.message] });
    }
  };
}