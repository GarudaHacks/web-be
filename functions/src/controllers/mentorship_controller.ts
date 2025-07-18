import { db } from "../config/firebase"
import { FirestoreMentor, MentorshipAppointment } from "../models/mentorship";
import { Request, Response } from "express";

export const getMentors = async (
  req: Request,
  res: Response
): Promise<void> => {
  let allMentors: FirestoreMentor[] = [];

  try {
    const snapshot = await db.collection('users')
      .where("mentor", "==", true)
      .get()
    snapshot.docs.map((mentor) => {
      allMentors.push({
        id: mentor.id,
        ...mentor.data()
      } as FirestoreMentor)
    })
    res.status(200).json({ allMentors })
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export const getMentorshipAppointments = async (
  req: Request,
  res: Response
): Promise<void> => {
  let mentorshipAppointments: MentorshipAppointment[] = [];

  try {
    const snapshot = await db.collection('mentorships')
      .where("mentor", "==", true)
      .get()
    snapshot.docs.map((mentor) => {
      mentorshipAppointments.push({
        id: mentor.id,
        ...mentor.data()
      } as MentorshipAppointment)
    })
    res.status(200).json({ mentorshipAppointments })
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export const getMentorshipAppointmentsByMentorId = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { mentorId } = req.params;
    const doc = await db.collection("mentorships")
      .where("mentor", "==", true)
      .where("mentorId", "==", mentorId)
      .get();

    if (!doc.empty) {
      res.status(404).json({ error: "Cannot find mentorships related with the mentor." });
      return;
    }

    let mentorships: MentorshipAppointment[] = [];
    doc.docs.map((mentorship) => {
      mentorships.push({
        id: mentorship.id,
        ...mentorship.data()
      } as MentorshipAppointment)
    })

    res.status(200).json(mentorships);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};