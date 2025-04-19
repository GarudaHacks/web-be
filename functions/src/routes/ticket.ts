import express, { Request, Response } from "express";
import {
  getTickets,
  createTicket,
  getTicketById,
  updateTicket,
  deleteTicket,
} from "../controllers/ticket_controllers";
import { validateFirebaseIdToken } from "../middlewares/auth_middleware";

const router = express.Router();

router.use(validateFirebaseIdToken);

router.get("/", (req: Request, res: Response) => getTickets(req, res));
router.get("/:id", (req: Request, res: Response) => getTicketById(req, res));
router.post("/", (req: Request, res: Response) => createTicket(req, res));
router.put("/:id", (req: Request, res: Response) => updateTicket(req, res));
router.delete("/:id", (req: Request, res: Response) => deleteTicket(req, res));

export default router;
