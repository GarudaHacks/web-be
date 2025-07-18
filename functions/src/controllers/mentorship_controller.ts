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
      .where("mentorId", "==", mentorId)
      .get();

    if (doc.empty) {
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

export const bookAMentorshipAppointment = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { mentorshipAppointmentId, hackerId } = req.body

    // reject if no mentorshipAppointmentId
    if (mentorshipAppointmentId === undefined || !mentorshipAppointmentId) {
      res.status(400).json({
        status: 400,
        error: "mentorshipAppointmentId is required in body"
      })
      return
    }

    // reject if no hackerId
    if (hackerId === undefined || !hackerId) {
      res.status(400).json({
        status: 400,
        error: "hackerId is required in body"
      })
      return
    }

    /**
     * Validation:
     * 1. Reject if the mentorship appointment does not exist in db
     * 2. Reject if the mentorship is already booked
     */
    const mentorshipAppointmentDoc = await db.collection("mentorships").doc(mentorshipAppointmentId)
    const mentorshipAppointmentSnap = await mentorshipAppointmentDoc.get()
    if (!mentorshipAppointmentSnap.exists) {
      res.status(400).json({
        status: 400,
        error: "Mentorship appointment does not exist"
      })
    }

    const mentorshipData: MentorshipAppointment | undefined = mentorshipAppointmentSnap.data() as MentorshipAppointment
    if (mentorshipData.hackerId) {
      res.status(400).json({
        status: 400,
        error: "Mentorship slot is already booked"
      })
    }

    /**
     * Book the mentorship slot
     * 1. Update the hackerId for the document
     */
    const updatedMentorshipAppointment = {
      hackerId: hackerId,
      ...mentorshipData
    }  
    await mentorshipAppointmentDoc.update(updatedMentorshipAppointment)
    res.status(200).json({
      status: 200,
      data: "Successfuly booked mentorship slot"
    })
  } catch (error) {
    res.status(500).json({error: (error as Error).message})
  }
}