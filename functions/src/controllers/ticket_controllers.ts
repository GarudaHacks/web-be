import { Request, Response } from "express";
import { db } from "../config/firebase";
import { Ticket, formatTicket } from "../models/ticket";

/**
 * Create a new ticket
 */
export const createTicket = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const data = req.body as Partial<Ticket>;

    if (!req.user || !req.user.uid) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const ticketRef = await db.collection("tickets").add({
      topic: data.topic || "",
      description: data.description || "",
      location: data.location || "",
      requestorId: req.user.uid,
      tags: Array.isArray(data.tags) ? data.tags : [],
      taken: false,
      resolved: false,
    });

    res.status(201).json({ success: true, id: ticketRef.id });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * Get all tickets
 */
export const getTickets = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const snapshot = await db
      .collection("tickets")
      .where("resolved", "==", false)
      .get();
    const tickets = snapshot.docs.map((doc) =>
      formatTicket({ id: doc.id, ...doc.data() })
    );
    res.status(200).json(tickets);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * Get a ticket by ID
 */
export const getTicketById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const doc = await db.collection("tickets").doc(id).get();

    if (!doc.exists) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    res.status(200).json(formatTicket({ id: doc.id, ...doc.data() }));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * Update a ticket
 */
export const updateTicket = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = req.body as Partial<Ticket>;

    await db.collection("tickets").doc(id).update(data);

    res.status(200).json({ success: true, message: "Ticket updated" });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * Delete a ticket
 */
export const deleteTicket = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    await db.collection("tickets").doc(id).delete();

    res.status(200).json({ success: true, message: "Ticket deleted" });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};
