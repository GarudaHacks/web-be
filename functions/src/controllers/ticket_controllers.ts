import { Request, Response } from "express";
import { db } from "../config/firebase";
import { Ticket, formatTicket } from "../models/ticket";

const isMentorOrAdmin = (user: Request["user"]): boolean =>
  user?.mentor === true || user?.admin === true;

const canModifyTicket = (
  user: Request["user"],
  ticket: Partial<Ticket>
): boolean =>
  !!user?.uid && (user.uid === ticket.requestorId || isMentorOrAdmin(user));

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

    if (!req.user || !req.user.uid) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const ticketDoc = db.collection("tickets").doc(id);
    const ticketSnap = await ticketDoc.get();
    if (!ticketSnap.exists) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const ticket = ticketSnap.data() as Partial<Ticket>;
    if (!canModifyTicket(req.user, ticket)) {
      res.status(403).json({ error: "Forbidden: Insufficient permissions" });
      return;
    }

    const updates: Partial<Ticket> = {};
    if (typeof data.topic === "string") updates.topic = data.topic;
    if (typeof data.description === "string") {
      updates.description = data.description;
    }
    if (typeof data.location === "string") updates.location = data.location;
    if (Array.isArray(data.tags)) updates.tags = data.tags;
    if (typeof data.resolved === "boolean") updates.resolved = data.resolved;
    // Only mentors/admins can mark a ticket as taken
    if (typeof data.taken === "boolean" && isMentorOrAdmin(req.user)) {
      updates.taken = data.taken;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    await ticketDoc.update(updates);

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

    if (!req.user || !req.user.uid) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const ticketDoc = db.collection("tickets").doc(id);
    const ticketSnap = await ticketDoc.get();
    if (!ticketSnap.exists) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const ticket = ticketSnap.data() as Partial<Ticket>;
    if (!canModifyTicket(req.user, ticket)) {
      res.status(403).json({ error: "Forbidden: Insufficient permissions" });
      return;
    }

    await ticketDoc.delete();

    res.status(200).json({ success: true, message: "Ticket deleted" });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};
