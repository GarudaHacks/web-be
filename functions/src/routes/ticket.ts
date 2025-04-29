import express, {Request, Response} from "express";
import {createTicket, deleteTicket, getTicketById, getTickets, updateTicket,} from "../controllers/ticket_controllers";

const router = express.Router();

router.get("/", (req: Request, res: Response) => getTickets(req, res));
router.get("/:id", (req: Request, res: Response) => getTicketById(req, res));
router.post("/", (req: Request, res: Response) => createTicket(req, res));
router.put("/:id", (req: Request, res: Response) => updateTicket(req, res));
router.delete("/:id", (req: Request, res: Response) => deleteTicket(req, res));

export default router;
