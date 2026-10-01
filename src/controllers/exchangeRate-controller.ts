// src/controllers/exchangeRate-controller.ts
import type { Request, Response } from "express";
import ExchangeRate from "../database/models/exchangeRate";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import { Op } from "sequelize";

export class ExchangeRateController {
  /**
   * GET /month?year=YYYY&month=MM
   * Devuelve todas las tasas registradas en el mes indicado.
   */
  static getRatesByMonth = async (req: Request, res: Response) => {
    try {
      const year = Number(req.query.year);
      const month = Number(req.query.month);

      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({
          result: false,
          content: [],
          error: ["Año o mes inválido"],
        });
      }

      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month, 0));
      const start = startDate.toISOString().slice(0, 10);
      const end = endDate.toISOString().slice(0, 10);

      const rates = await ExchangeRate.findAll({
        where: {
          effectiveDate: {
            [Op.gte]: start,
            [Op.lte]: end,
          },
        },
        order: [["effectiveDate", "ASC"]],
      });

      return res.status(200).json({
        result: true,
        content: rates.map((r) => ({
          id: r.id,
          effectiveDate: r.effectiveDate,
          rate: Number(r.rate),
          fetchedAt: r.fetchedAt,
          source: r.source,
        })),
        error: [],
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, "Server", getErrorLocation("getRatesByMonth"));
      return res.status(500).json({
        result: false,
        content: [],
        error: ["Error al obtener las tasas del mes"],
      });
    }
  };

  /**
   * POST /
   * Crea una tasa manual para una fecha valor. Falla si ya existe.
   */
  static createRate = async (req: Request, res: Response) => {
    try {
      const { effectiveDate, rate } = req.body;

      // Validación de formato YYYY-MM-DD
      if (typeof effectiveDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
        return res.status(400).json({
          result: false,
          content: [],
          error: ["La fecha debe tener el formato YYYY-MM-DD"],
        });
      }

      const parsedRate = Number(rate);
      if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
        return res.status(400).json({
          result: false,
          content: [],
          error: ["La tasa debe ser un número mayor a 0"],
        });
      }

      const existing = await ExchangeRate.findOne({ where: { effectiveDate } });
      if (existing) {
        return res.status(409).json({
          result: false,
          content: [],
          error: ["Ya existe una tasa registrada para esa fecha"],
        });
      }

      const created = await ExchangeRate.create({
        effectiveDate,
        rate: parsedRate,
        fetchedAt: new Date(),
        source: "manual",
      });

      return res.status(201).json({
        result: true,
        content: {
          id: created.id,
          effectiveDate: created.effectiveDate,
          rate: Number(created.rate),
          fetchedAt: created.fetchedAt,
          source: created.source,
        },
        error: [],
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, "Server", getErrorLocation("createRate"));
      return res.status(500).json({
        result: false,
        content: [],
        error: ["Error al crear la tasa"],
      });
    }
  };

  /**
   * PUT /:id
   * Actualiza ÚNICAMENTE el campo `rate`.
   */
  static updateRate = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rate } = req.body;

      const parsedRate = Number(rate);
      if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
        return res.status(400).json({
          result: false,
          content: [],
          error: ["La tasa debe ser un número mayor a 0"],
        });
      }

      const record = await ExchangeRate.findByPk(id);
      if (!record) {
        return res.status(404).json({
          result: false,
          content: [],
          error: ["Tasa no encontrada"],
        });
      }

      await record.update({ rate: parsedRate });

      return res.status(200).json({
        result: true,
        content: {
          id: record.id,
          effectiveDate: record.effectiveDate,
          rate: Number(record.rate),
          fetchedAt: record.fetchedAt,
          source: record.source,
        },
        error: [],
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, "Server", getErrorLocation("updateRate"));
      return res.status(500).json({
        result: false,
        content: [],
        error: ["Error al actualizar la tasa"],
      });
    }
  };
}