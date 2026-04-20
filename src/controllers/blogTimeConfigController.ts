// src/controllers/BlockTimeConfigController.ts
import type { Request, Response } from "express";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import sequelize from "../database/config";
import { Op } from "sequelize";
import BlockTimeConfig from "../database/models/blogTimeConfig";

// Valores por defecto (los mismos que usas actualmente)
const DEFAULT_BLOCK_TIMES = [
  { blockNumber: 1, startTime: '07:00', endTime: '07:40' },
  { blockNumber: 2, startTime: '07:40', endTime: '08:20' },
  { blockNumber: 3, startTime: '08:20', endTime: '09:00' },
  { blockNumber: 4, startTime: '09:00', endTime: '09:40' },
  { blockNumber: 5, startTime: '09:40', endTime: '10:00' }, // receso
  { blockNumber: 6, startTime: '10:00', endTime: '10:40' },
  { blockNumber: 7, startTime: '10:40', endTime: '11:20' },
  { blockNumber: 8, startTime: '11:20', endTime: '12:00' },
  { blockNumber: 9, startTime: '12:20', endTime: '12:40' },
];

export class BlockTimeConfigController {

  /**
   * Obtener configuración de bloques para un grado y sección.
   * Si no existe, devuelve los valores por defecto.
   */
  static getBlockTimes = async (req: Request, res: Response) => {
    try {
      const { grade, section } = req.query;
      
      if (!grade || !section) {
        return res.status(400).json({
          result: false,
          content: [],
          error: ['Grado y sección son requeridos']
        });
      }

      const configs = await BlockTimeConfig.findAll({
        where: {
          grade: grade as string,
          section: section as string,
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
        // Devolver valores por defecto
        blocks = DEFAULT_BLOCK_TIMES.map(b => ({
          ...b,
          isActive: true
        }));
      }

      res.status(200).json({
        result: true,
        content: {
          grade,
          section,
          blocks
        },
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

  /**
   * Guardar o actualizar la configuración de bloques para un grado y sección.
   * Recibe un array de bloques con sus tiempos.
   */
  static saveBlockTimes = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { grade, section, blocks } = req.body;

      if (!grade || !section || !Array.isArray(blocks)) {
        await transaction.rollback();
        return res.status(400).json({
          result: false,
          content: [],
          error: ['Grado, sección y array de bloques son requeridos']
        });
      }

      // Validar que cada bloque tenga blockNumber, startTime, endTime
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

      // Eliminar configuraciones existentes para ese grado y sección
      await BlockTimeConfig.destroy({
        where: { grade, section },
        transaction
      });

      // Crear las nuevas configuraciones
      const newConfigs = blocks.map(block => ({
        grade,
        section,
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
          grade,
          section,
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

  /**
   * Restablecer a valores por defecto para un grado y sección
   */
  static resetToDefault = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { grade, section } = req.body;

      if (!grade || !section) {
        await transaction.rollback();
        return res.status(400).json({
          result: false,
          content: [],
          error: ['Grado y sección son requeridos']
        });
      }

      // Eliminar configuraciones existentes
      await BlockTimeConfig.destroy({
        where: { grade, section },
        transaction
      });

      // Insertar valores por defecto
      const defaultConfigs = DEFAULT_BLOCK_TIMES.map(block => ({
        grade,
        section,
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
          grade,
          section
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

  /**
   * Obtener todas las configuraciones (para administración)
   */
  static getAllConfigs = async (req: Request, res: Response) => {
    try {
      const configs = await BlockTimeConfig.findAll({
        order: [
          ['grade', 'ASC'],
          ['section', 'ASC'],
          ['blockNumber', 'ASC']
        ]
      });

      // Agrupar por grado y sección
      const grouped: any = {};
      configs.forEach(c => {
        const key = `${c.grade}-${c.section}`;
        if (!grouped[key]) {
          grouped[key] = {
            grade: c.grade,
            section: c.section,
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