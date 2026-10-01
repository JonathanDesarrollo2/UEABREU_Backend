import { Router } from "express";
import { SimulationController } from "../../controllers/SimulationControllers";

const SimulationRouter = Router();

// ✅ Solo registrar rutas si la simulación está habilitada (desarrollo)
if (process.env.ENABLE_SIMULATION === 'true') {
  SimulationRouter.get('/simulation/date', SimulationController.getSimulatedDate);
  SimulationRouter.post('/simulation/date', SimulationController.setSimulatedDate);
  SimulationRouter.delete('/simulation/date', SimulationController.resetSimulatedDate);
  SimulationRouter.post('/simulation/apply-monthly-fees', SimulationController.applyMonthlyFees);
  SimulationRouter.post('/reset-all', SimulationController.resetEverything);
}

export default SimulationRouter;