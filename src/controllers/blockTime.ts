// src/controllers/BlockTimeConfigController.ts
import type { Request, Response } from "express";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import sequelize from "../database/config";
import BlockTimeConfig from "../database/models/blockTimeConfig";

const DEFAULT_BLOCK_TIMES = [
  { blockNumber: 1, startTime: '07:00', endTime: '07:40' },
  { blockNumber: 2, startTime: '07:40', endTime: '08:20' },
  { blockNumber: 3, startTime: '08:20', endTime: '09:00' },
  { blockNumber: 4, startTime: '09:00', endTime: '09:40' },
  { blockNumber: 5, startTime: '09:40', endTime: '10:00' },
  { blockNumber: 6, startTime: '10:00', endTime: '10:40' },
  { blockNumber: 7, startTime: '10:40', endTime: '11:20' },
  { blockNumber: 8, startTime: '11:20', endTime: '12:00' },
  { blockNumber: 9, startTime: '12:20', endTime: '12:40' },
];

export class BlockTimeConfigController {

  static getBlockTimes = async (req: Request, res: Response) => {
    try {
      const { grade, section, day } = req.query;
      if (!grade || !section || !day) {
        return res.status(400).json({
          result: false,
          content: [],
          error: ['Grado, sección y día son requeridos']
        });
      }

      const configs = await BlockTimeConfig.findAll({
        where: {
          grade: grade as string,
          section: section as string,
          day: day as string,
          isActive: true
        },
        order: [['blockNumber', 'ASC']]
      });

      let blocks;
      if (configs.length > 0) {
        blocks = configs.map(c => ({
          blockNumber: c.blockNumber,
          startTime: c.startTime,
          endTime: c.endTime,
          isActive: c.isActive
        }));
      } else {
        blocks = DEFAULT_BLOCK_TIMES.map(b => ({ ...b, isActive: true }));
      }

      res.status(200).json({
        result: true,
        content: { grade, section, day, blocks },
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getBlockTimes"));
      res.status(500).json({
        result: false,
        content: [],
        error: ['Error al obtener configuración de bloques']
      });
    }
  };
  static saveBlockTimes = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    try {
      const { grade, section, day, blocks } = req.body;

      if (!grade || !section || !day || !Array.isArray(blocks)) {
        await transaction.rollback();
        return res.status(400).json({
          result: false,
          content: [],
          error: ['Grado, sección, día y array de bloques son requeridos']
        });
      }

      // Validar cada bloque
      for (const block of blocks) {
        if (!block.blockNumber || !block.startTime || !block.endTime) {
          await transaction.rollback();
          return res.status(400).json({
            result: false,
            content: [],
            error: ['Cada bloque debe tener blockNumber, startTime y endTime']
          });
        }
      }

      // Eliminar configuraciones existentes para ese grado, sección y día
      await BlockTimeConfig.destroy({
        where: { grade, section, day },
        transaction
      });

      // Crear nuevas configuraciones incluyendo el día
      const newConfigs = blocks.map(block => ({
        grade,
        section,
        day,   // ← AGREGADO
        blockNumber: block.blockNumber,
        startTime: block.startTime,
        endTime: block.endTime,
        isActive: block.isActive !== undefined ? block.isActive : true
      }));

      await BlockTimeConfig.bulkCreate(newConfigs, { transaction });
      await transaction.commit();

      res.status(200).json({
        result: true,
        content: {
          message: 'Configuración de bloques guardada exitosamente',
          grade, section, day,
          blocksCount: blocks.length
        },
        error: []
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("saveBlockTimes"));
      res.status(500).json({
        result: false,
        content: [],
        error: [`Error al guardar configuración: ${error.message}`]
      });
    }
  };

  static resetToDefault = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    try {
      const { grade, section, day } = req.body;

      if (!grade || !section || !day) {
        await transaction.rollback();
        return res.status(400).json({
          result: false,
          content: [],
          error: ['Grado, sección y día son requeridos']
        });
      }

      // Eliminar configuraciones existentes
      await BlockTimeConfig.destroy({
        where: { grade, section, day },
        transaction
      });

      // Insertar valores por defecto incluyendo el día
      const defaultConfigs = DEFAULT_BLOCK_TIMES.map(block => ({
        grade,
        section,
        day,   // ← AGREGADO
        blockNumber: block.blockNumber,
        startTime: block.startTime,
        endTime: block.endTime,
        isActive: true
      }));

      await BlockTimeConfig.bulkCreate(defaultConfigs, { transaction });
      await transaction.commit();

      res.status(200).json({
        result: true,
        content: {
          message: 'Configuración restablecida a valores por defecto',
          grade, section, day
        },
        error: []
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("resetToDefault"));
      res.status(500).json({
        result: false,
        content: [],
        error: [`Error al restablecer: ${error.message}`]
      });
    }
  };

  static getAllConfigs = async (req: Request, res: Response) => {
    try {
      const configs = await BlockTimeConfig.findAll({
        order: [['grade', 'ASC'], ['section', 'ASC'], ['day', 'ASC'], ['blockNumber', 'ASC']]
      });

      // Agrupar por grado, sección y día
      const grouped: any = {};
      configs.forEach(c => {
        const key = `${c.grade}-${c.section}-${c.day}`;
        if (!grouped[key]) {
          grouped[key] = {
            grade: c.grade,
            section: c.section,
            day: c.day,
            blocks: []
          };
        }
        grouped[key].blocks.push({
          blockNumber: c.blockNumber,
          startTime: c.startTime,
          endTime: c.endTime,
          isActive: c.isActive
        });
      });

      res.status(200).json({
        result: true,
        content: Object.values(grouped),
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getAllConfigs"));
      res.status(500).json({
        result: false,
        content: [],
        error: ['Error al obtener configuraciones']
      });
    }
  };
}