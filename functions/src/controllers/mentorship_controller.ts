import { db } from "../config/firebase"
import { FirestoreMentor, MentorshipAppointment } from "../models/mentorship";
import { Request, Response } from "express";
import { User } from "../models/user";
import { MentorshipConfig } from "../types/config";

export const getMentorshipConfig = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const mentorshipConfigSnapshot = await db.collection("config").doc("mentorshipConfig").get()
    const mentorshipConfigData = mentorshipConfigSnapshot.data()

    if (!mentorshipConfigSnapshot.exists || mentorshipConfigData === undefined) {
      res.status(400).json({
        status: 400,
        error: "Config not found"
      })
      return;
    }
    res.status(200).json({
      status: 200,
      data: mentorshipConfigData
    })
  } catch (error) {
    res.status(500).json({error: (error as Error).message})
  }
}

export const getMentor = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { mentorId } = req.params;
  try {
    /**
     * Validate request:
     * 1. Mentor id is not in params
     */
    if (!mentorId) {
      res.status(400).json({
        status: 400,
        error: "Mentor id is required"
      })
      return;
    }

    /**
     * Process request
     * 1. Find mentor in db
     */
    const mentorDoc = await db.collection("users").doc(mentorId).get()
    if (!mentorDoc.exists) {
      res.status(404).json({
        status: 404,
        error: "Cannot find mentor with the given mentor id"
      })
      return;
    }
    const mentorData = mentorDoc.data()

    if (mentorData) {
      const trimmedData: FirestoreMentor = {
        "id": mentorData.id,
        "email": mentorData.email,
        "name": mentorData.name,
        "intro": mentorData.intro,
        "specialization": mentorData.specialization,
        "mentor": mentorData.mentor,
        "discordUsername": mentorData.discordUsername
      }
      res.status(200).json({
        status: 200,
        data: trimmedData
      })
    } else {
      res.status(200).json({
        status: 200,
        data: {}
      })
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message })
  }
}

export const getMentors = async (
  req: Request,
  res: Response
): Promise<void> => {
  const allMentors: FirestoreMentor[] = [];

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
  const mentorshipAppointments: MentorshipAppointment[] = [];

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

    const mentorships: MentorshipAppointment[] = [];
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
    /**
     * Validate current user:
     * 1. User is not valid / not authenticated.
     * 2. Get current user from db
     */
    const uid = req.user?.uid;
    if (!uid || uid === undefined) {
      res.status(401).json({
        status: 401,
        error: "Cannot get current user uid"
      })
      return;
    }

    const { mentorshipAppointmentId, hackerDescription } = req.body

    // reject if no mentorshipAppointmentId
    if (mentorshipAppointmentId === undefined || !mentorshipAppointmentId) {
      res.status(400).json({
        status: 400,
        error: "mentorshipAppointmentId is required in body"
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
      return
    }

    const mentorshipData: MentorshipAppointment | undefined = mentorshipAppointmentSnap.data() as MentorshipAppointment
    if (mentorshipData.hackerId) {
      res.status(400).json({
        status: 400,
        error: "Mentorship slot is already booked"
      })
      return
    }

    /**
     * Book the mentorship slot
     * 1. Update the hackerId for the document
     */
    const updatedMentorshipAppointment = {
      hackerId: uid,
      hackerDescription: hackerDescription,
      ...mentorshipData
    }
    await mentorshipAppointmentDoc.update(updatedMentorshipAppointment)
    res.status(200).json({
      status: 200,
      data: "Successfuly booked mentorship slot"
    })
  } catch (error) {
    res.status(500).json({ error: (error as Error).message })
  }
}


/**
 * Get the list of my mentorship appointments.
 * If user is mentor, by default will return his appointment.
 */
export const getMyMentorshipAppointments = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    /**
     * Validate current user:
     * 1. User is not valid / not authenticated.
     * 2. Get current user from db
     */
    const uid = req.user?.uid;
    if (!uid || uid === undefined) {
      res.status(401).json({
        status: 401,
        error: "Cannot get current user uid"
      })
      return;
    }

    const currentUserDoc = await db.collection("users").doc(uid)
    const currentUserSnap = await currentUserDoc.get()
    if (!currentUserSnap.exists) {
      res.status(400).json({
        status: 400,
        error: "Cannot find user in the users collection"
      })
      return;
    }

    /**
     * Get user mentorship appointments:
     * 1. Check if user is mentor, then fetch his/her appointments
     * 2. Otherwise return appointments with current user id as hackerId
     */
    let mentorshipAppointments: MentorshipAppointment[] = []
    const currentUserData = currentUserSnap.data() as FirestoreMentor | User
    if (isMentor(currentUserData)) {
      const appointmentsAsMentor = await db.collection("mentorships")
        .where("mentorId", "==", uid)
        .get()
      mentorshipAppointments = appointmentsAsMentor.docs.map((appointment) => ({
        id: appointment.id,
        ...appointment.data()
      })) as MentorshipAppointment[];

      res.status(200).json({
        status: 200,
        data: mentorshipAppointments
      })
      return;
    }
    else {
      const appointmentsAsHacker = await db.collection("mentorships")
        .where("hackerId", "==", uid)
        .get()

      mentorshipAppointments = appointmentsAsHacker.docs.map((appointment) => ({
        id: appointment.id,
        ...appointment.data()
      })) as MentorshipAppointment[]
    }

    res.status(200).json({
      status: 200,
      data: mentorshipAppointments
    })
  } catch (error) {
    res.status(500).json({ error: (error as Error).message })
  }
}

/**
 * 
 * @param data 
 * @returns 
 */
function isMentor(data: FirestoreMentor | User): data is FirestoreMentor {
  return 'mentor' in data;
}