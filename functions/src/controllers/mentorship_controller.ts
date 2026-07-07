import { db } from "../config/firebase"
import { FirestoreMentor, MentorshipAppointment, MentorshipAppointmentResponseAsHacker, MentorshipAppointmentResponseAsMentor } from "../models/mentorship";
import { User } from "../models/user";
import { Request, Response } from "express";
import { DateTime } from 'luxon';
import { CollectionReference, DocumentData, FieldPath, FieldValue } from "firebase-admin/firestore";
import { MentorshipConfig } from "../types/config";
import * as functions from "firebase-functions";
import { epochRangeToScheduleDisplay } from "../utils/date";
import { sendMentorshipBookedEmail, sendMentorshipCanceledEmail, sendMentorshipBookedEmailHacker, sendMentorshipCanceledEmailHacker } from "../utils/email_sender";
import { createMentorshipMeetEvent, cancelMentorshipMeetEvent } from "../utils/google_calendar";


const CONFIG = "config";
const MENTORSHIP_CONIFG = "mentorshipConfig";
const MENTORSHIPS = "mentorships";
const MENTOR_ID = "mentorId";
const HACKER_ID = "hackerId";
const USERS = "users";
const START_TIME = "startTime";
const PORTAL_LINK = "https://portal.garudahacks.com";

/**
 * Correctly format mentorship location.
 */
function formatMentorshipLocation(location: string, offlineLocation?: string): string {
  return location === "online" ? "Online" : (offlineLocation || "Offline");
}

/**
 * Get mentorship config.
 */
export const getMentorshipConfig = async (
  req: Request,
  res: Response
) => {
  try {
    const mentorshipConfigSnapshot = await db.collection("config").doc("mentorshipConfig").get()
    const mentorshipConfigData = mentorshipConfigSnapshot.data() as MentorshipConfig

    if (!mentorshipConfigSnapshot.exists || mentorshipConfigData === undefined) {
      return res.status(400).json({
        status: 400,
        error: "Config not found"
      })
    }
    return res.status(200).json({
      data: mentorshipConfigData
    })
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message })
  }
}


/** ******************
 * MENTOR ENDPOINTS *
 ********************/
export const mentorGetMyMentorships = async (
  req: Request,
  res: Response
) => {
  try {
    const uid = req.user?.uid
    if (!uid) {
      return res.status(401).send('Unauthorized: User ID not found.');
    }

    // available query params
    const {
      limit,
      upcomingOnly,
      recentOnly,
      isBooked,
      isAvailable,
    } = req.query;

    let query: CollectionReference | DocumentData = db.collection(MENTORSHIPS);

    query = query.where(MENTOR_ID, "==", uid);

    const currentTimeSeconds = DateTime.now().toUnixInteger();
    if (upcomingOnly === 'true') {
      query = query.where(START_TIME, ">=", currentTimeSeconds);
    } else if (recentOnly === 'true') {
      query = query.where(START_TIME, "<=", currentTimeSeconds);
    }

    if (limit) {
      const numericLimit = parseInt(limit as string, 10);
      if (!isNaN(numericLimit) && numericLimit > 0) {
        query = query.limit(numericLimit);
      }
    }

    const snapshot = await query.orderBy("startTime", "asc").get();

    let mentorships = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    })) as MentorshipAppointment[];

    if (isBooked === 'true') {
      mentorships = mentorships.filter(m => m.hackerId != null);
    } else if (isAvailable === 'true') {
      mentorships = mentorships.filter(m => m.hackerId == null);
    }

    const hackerIds = Array.from(new Set(mentorships.map((m) => m.hackerId).filter((id): id is string => !!id)));
    const hackerById = new Map<string, User>();
    if (hackerIds.length > 0) {
      const hackerDocs = await db.getAll(...hackerIds.map((id) => db.collection(USERS).doc(id)));
      hackerDocs.forEach((doc) => {
        if (doc.exists) {
          hackerById.set(doc.id, doc.data() as User);
        }
      });
    }

    const response: MentorshipAppointmentResponseAsMentor[] = mentorships.map((m) => {
      const hacker = m.hackerId ? hackerById.get(m.hackerId) : undefined;
      return {
        id: m.id,
        startTime: m.startTime,
        endTime: m.endTime,
        mentorId: m.mentorId,
        hackerId: m.hackerId,
        hackerName: m.hackerName,
        hackerEmail: hacker?.email,
        teamName: m.teamName,
        hackerDescription: m.hackerDescription,
        location: m.location,
        offlineLocation: m.offlineLocation,
        mentorMarkAsDone: m.mentorMarkAsDone,
        mentorMarkAsAfk: m.mentorMarkAsAfk,
        mentorNotes: m.mentorNotes,
        meetLink: m.meetLink,
        calendarEventId: m.calendarEventId,
      };
    });

    return res.status(200).json({
      data: response,
    });
  } catch (error) {
    functions.logger.error(`Error when trying mentorGetMyMentorships: ${(error as Error).message} `)
    return res.status(500).json({ error: (error as Error).message })
  }
}

export const mentorGetMyMentorship = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params

    // 1. Validate id is in param
    if (!id) {
      res.status(400).json({
        error: "id is required"
      })
    }

    // 2. Get a mentroship appointment
    const snapshot = await db.collection(MENTORSHIPS).doc(id).get()
    if (!snapshot.exists) {
      return res.status(400).json({
        error: "Cannot find mentorship"
      })
    }

    return res.status(200).json({
      data: snapshot.data()
    })
  } catch (error) {
    functions.logger.error(`Error when trying mentorGetMyMentorship: ${(error as Error).message} `)
    return res.status(500).json({ error: (error as Error).message })
  }
}

/**
 * Updates a mentorship
 * @param req.mentorNotes
 * @param req.mentorMarkAsDone
 * @param req.mentorMarkAsAfk
 * @param res 
 * @returns 
 */
export const mentorPutMyMentorship = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params

    // 1. Validate id is in param
    if (!id) {
      return res.status(400).json({
        error: "id is required"
      })
    }

    const {
      mentorNotes,
      mentorMarkAsDone,
      mentorMarkAsAfk
    } = req.body

    const payload: { [key: string]: any } = {};
    if (mentorNotes !== undefined) {
      payload.mentorNotes = mentorNotes;
    }
    if (mentorMarkAsDone !== undefined) {
      payload.mentorMarkAsDone = mentorMarkAsDone;
    }
    if (mentorMarkAsAfk !== undefined) {
      payload.mentorMarkAsAfk = mentorMarkAsAfk;
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No fields to update were provided." });
    }

    await db.collection(MENTORSHIPS).doc(id).update({
      mentorNotes: mentorNotes,
      mentorMarkAsDone: mentorMarkAsDone,
      mentorMarkAsAfk: mentorMarkAsAfk
    })

    return res.status(200).json({
      message: "Success updated"
    });
  } catch (error: any) {
    if (error.code === 5) {
      return res.status(404).json({ error: "Mentorship with that ID was not found." });
    }
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
}


/** ******************
 * HACKER ENDPOINTS *
 ********************/
interface MentorPublic {
  id: string
  mentor: boolean
  email: string
  discordUsername: string
  displayName: string
  intro: string
  mentorTitle: string
  specialization: string
}
export const hackerGetMentors = async (
  req: Request,
  res: Response
) => {
  try {
    const { limit } = req.query

    let query = db.collection('users')
      .where("mentor", "==", true)

    if (limit) {
      const numericLimit = parseInt(limit as string, 10);
      if (!isNaN(numericLimit) && numericLimit > 0) {
        query = query.limit(numericLimit);
      }
    }

    const snapshot = await query.get()
    const allMentors: MentorPublic[] = [];

    await Promise.all(
      snapshot.docs.map(async (mentor) => {
        const mentorData = mentor.data();

        allMentors.push({
          id: mentor.id,
          email: mentorData.email,
          displayName: mentorData.displayName,
          mentor: mentorData.mentor,
          specialization: mentorData.specialization,
          discordUsername: mentorData.discordUsername,
          intro: mentorData.intro,
          mentorTitle: mentorData.mentorTitle
        });

      })
    );
    return res.status(200).json({ data: allMentors })
  } catch (error: any) {
    functions.logger.error(`Error when trying hackerGetMentors: ${(error as Error).message} `)
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
}

export const hackerGetMentor = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;

    // 1. Validate id
    const snapshot = await db.collection(USERS).doc(id).get()
    if (!snapshot.exists) {
      return res.status(400).json({
        error: "Cannot find mentor"
      })
    }

    const data = snapshot.data()

    if (!data) {
      return res.status(400).json({
        error: "Cannot find mentor"
      })
    }

    const mentorData: MentorPublic = {
      id: data.id,
      email: data.email,
      displayName: data.displayName,
      mentor: data.mentor,
      specialization: data.specialization,
      discordUsername: data.discordUsername,
      intro: data.intro,
      mentorTitle: data.mentorTitle
    }

    return res.status(200).json({
      data: mentorData
    })
  } catch (error) {
    functions.logger.error(`Error when trying hackerGetMentor: ${(error as Error).message} `)
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
}

export const hackerGetMentorSchedules = async (
  req: Request,
  res: Response
) => {
  try {
    const { mentorId, limit } = req.query
    res.setHeader('Cache-Control', 'no-store'); // Disable caching
    res.setHeader('Content-Type', 'application/json');
    if (!mentorId) {
      return res.status(400).json({ error: "mentorId is required as argument" })
    }

    let query = db.collection(MENTORSHIPS)
      .where(MENTOR_ID, "==", mentorId)

    if (limit) {
      const numericLimit = parseInt(limit as string, 10);
      if (!isNaN(numericLimit) && numericLimit > 0) {
        query = query.limit(numericLimit);
      }
    }

    const snapshot = await query.get()

    const allSchedules = snapshot.docs.map((doc) => ({
      id: doc.id,
      startTime: doc.data().startTime,
      endTime: doc.data().endTime,
      mentorId: doc.data().mentorId,
      hackerId: doc.data().hackerId,
      location: doc.data().location,
    })) as MentorshipAppointmentResponseAsHacker[];

    return res.status(200).json({ data: allSchedules });
  } catch (error) {
    functions.logger.error(`Error when trying hackerGetMentorSchedules: ${(error as Error).message} `)
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
}

export const hackerGetMentorSchedule = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params

    // 1. Validate id is in param
    if (!id) {
      return res.status(400).json({
        error: "id is required"
      })
    }

    const snapshot = await db.collection(MENTORSHIPS).doc(id).get()
    const data = snapshot.data()
    if (!snapshot.exists || !data) {
      return res.status(404).json({ error: "Cannot find mentorship" })
    }

    const mentorshipAppointmentResponseAsHacker: MentorshipAppointmentResponseAsHacker = {
      id: data.id,
      startTime: data.startTime,
      endTime: data.endTime,
      mentorId: data.mentorId,
      hackerId: data.hackerId,
      location: data.location,
    }
    return res.status(200).json({ data: mentorshipAppointmentResponseAsHacker })
  } catch (error) {
    functions.logger.error(`Error when trying hackerGetMentorSchedules: ${(error as Error).message} `)
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
}

interface BookMentorshipRequest {
  id: string;
  hackerName: string;
  teamName: string;
  hackerDescription: string;
  offlineLocation?: string;
}

export const hackerBookMentorships = async (
  req: Request,
  res: Response
) => {
  const MAX_CONCURRENT_BOOKINGS = 2
  try {
    const uid = req.user?.uid
    if (!uid) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    // Check if mentorship is open
    const configSnapshot = await db.collection(CONFIG).doc(MENTORSHIP_CONIFG).get()
    const configData = configSnapshot.data()
    if (configData && !configData.isMentorshipOpen) {
      return res.status(400).json({ error: "Mentorship is currently closed" })
    }

    const { mentorships }: { mentorships: BookMentorshipRequest[] } = req.body;

    if (!mentorships || !Array.isArray(mentorships) || mentorships.length === 0) {
      return res.status(400).json({ error: 'Mentorships must be a non-empty array.' });
    }

    if (mentorships.length > MAX_CONCURRENT_BOOKINGS) {
      return res.status(400).json({ error: `Cannot book more than ${MAX_CONCURRENT_BOOKINGS} slots at a time.` });
    }

    for (const mentorship of mentorships) {
      if (!mentorship.id || !mentorship.hackerName || !mentorship.teamName || !mentorship.hackerDescription) {
        return res.status(400).json({ error: 'Each mentorship must include id, hackerId, hackerName, teamName, and hackerDescription.' });
      }
    }

    const mentorshipsCollection = db.collection(MENTORSHIPS);
    const currentTimeSeconds = DateTime.now().toUnixInteger();
    const existingBookingsQuery = mentorshipsCollection
      .where(HACKER_ID, '==', uid)
      .where(START_TIME, '>', currentTimeSeconds);

    const existingBookingsSnapshot = await existingBookingsQuery.get();

    if (existingBookingsSnapshot.size + mentorships.length > MAX_CONCURRENT_BOOKINGS) {
      return res.status(400).json({ error: `This request would exceed the maximum of ${MAX_CONCURRENT_BOOKINGS} active bookings.` });
    }

    await db.runTransaction(async (transaction) => {
      const mentorshipIds = mentorships.map((m) => m.id);

      const requestedMentorshipsRef = mentorshipsCollection.where(FieldPath.documentId(), 'in', mentorshipIds);
      const requestedMentorshipsSnapshot = await transaction.get(requestedMentorshipsRef);

      if (requestedMentorshipsSnapshot.size !== mentorships.length) {
        throw new Error("One or more mentorship slots could not be found.");
      }

      const thirtyMinsFromNow = DateTime.now().toUnixInteger() + (30 * 60);

      for (const doc of requestedMentorshipsSnapshot.docs) {
        const data = doc.data();

        if (data.hackerId) {
          throw new Error(`Mentorship slot ${doc.id} is already booked.`);
        }

        if (data.startTime < thirtyMinsFromNow) {
          throw new Error(`Mentorship slot ${doc.id} is starting too soon to book.`);
        }
      }

      for (const mentorshipRequest of mentorships) {
        const docRef = mentorshipsCollection.doc(mentorshipRequest.id);
        transaction.update(docRef, {
          hackerId: uid,
          hackerName: mentorshipRequest.hackerName,
          teamName: mentorshipRequest.teamName,
          hackerDescription: mentorshipRequest.hackerDescription,
          offlineLocation: mentorshipRequest.offlineLocation || null,
        });
      }
    });

    const hackerSnap = await db.collection(USERS).doc(uid).get()
    const hackerData = hackerSnap.data()

    for (const mentorship of mentorships) {
      try {
        const mentorshipSnap = await db.collection(MENTORSHIPS).doc(mentorship.id).get()
        if (!mentorshipSnap.exists) {
          functions.logger.error("Mentorship document not found:", mentorship.id)
          continue
        }

        const mentorshipData = mentorshipSnap.data() as MentorshipAppointment

        if (!mentorshipData.mentorId) {
          functions.logger.error("No mentor ID in mentorship data")
          continue
        }

        const mentorSnap = await db.collection(USERS).doc(mentorshipData.mentorId).get()
        if (!mentorSnap.exists) {
          functions.logger.error("Mentor not found:", mentorshipData.id)
          continue
        }

        const mentorData = mentorSnap.data() as FirestoreMentor

        let meetLink: string | undefined
        if (mentorshipData.location === "online") {
          const attendeeEmails = [mentorData.email, hackerData?.email].filter((e): e is string => !!e)
          const meetEvent = await createMentorshipMeetEvent({
            summary: `Garuda Hacks Mentorship: ${mentorship.teamName} x ${mentorData.displayName}`,
            description: mentorship.hackerDescription,
            startEpochSeconds: mentorshipData.startTime,
            endEpochSeconds: mentorshipData.endTime,
            attendeeEmails,
          })
          if (meetEvent) {
            meetLink = meetEvent.meetLink
            await db.collection(MENTORSHIPS).doc(mentorship.id).update({
              meetLink: meetEvent.meetLink,
              calendarEventId: meetEvent.eventId,
            })
          }
        }

        const schedule = epochRangeToScheduleDisplay(mentorshipData.startTime, mentorshipData.endTime)
        const duration = (mentorshipData.endTime - mentorshipData.startTime) / 60
        const locationDisplay = formatMentorshipLocation(mentorshipData.location, mentorshipData.offlineLocation || mentorship.offlineLocation)
        await sendMentorshipBookedEmail(mentorData.email, {
          mentorName: mentorData.displayName,
          teamName: mentorship.teamName,
          hackerName: mentorship.hackerName,
          location: locationDisplay,
          scheduleWib: schedule.wib,
          scheduleUtc: schedule.utc,
          schedulePacific: schedule.pacific,
          pacificLabel: schedule.pacificLabel,
          duration,
          portalLink: PORTAL_LINK,
          meetLink,
        })
        functions.logger.info(`Email sent successfully for mentor ${mentorData.email}:`)

        if (hackerData?.email) {
          await sendMentorshipBookedEmailHacker(hackerData.email, {
            mentorName: mentorData.displayName,
            teamName: mentorship.teamName,
            hackerName: mentorship.hackerName,
            location: locationDisplay,
            scheduleWib: schedule.wib,
            scheduleUtc: schedule.utc,
            schedulePacific: schedule.pacific,
            pacificLabel: schedule.pacificLabel,
            duration,
            portalLink: PORTAL_LINK,
            meetLink,
          })
          functions.logger.info(`Confirmation email sent successfully for hacker ${hackerData.email}:`)
        }
      } catch (error) {
        functions.logger.error(`Error when trying to send email for mentorship ${mentorship.id}: ${(error as Error).message}`)
      }
    }

    return res.status(200).json({ success: true, message: 'Mentorships booked successfully.' });
  } catch (error) {
    const err = error as Error

    if (err.message.includes('mentorship slots could not be found')) {
      return res.status(400).json({ error: "Mentorship slot(s) could not be found" })
    } else if (err.message.includes('already booked')) {
      return res.status(400).json({ error: "Mentorship slot(s) are already booked" })
    } else if (err.message.includes('too soon to book')) {
      return res.status(400).json({ error: "Cannot book less than 30 mins before the mentoring schedule. Please choose another mentorship slot!" })
    }

    functions.logger.error(`Error when trying hackerBookMentorships: ${(error as Error).message} `)
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
}

export const hackerCancelMentorship = async (
  req: Request, res: Response
) => {
  try {
    const uid = req.user?.uid
    if (!uid) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: "id must be in the argument" })
    }

    // Validate
    // 1. If mentorship does not exist
    // 2. If mentorship does not belong to the hacker
    const mentorshipSnapshot = await db.collection(MENTORSHIPS).doc(id).get()
    const mentorshipData = mentorshipSnapshot.data() as MentorshipAppointmentResponseAsMentor
    if (!mentorshipSnapshot.exists || !mentorshipData) {
      return res.status(404).json({ error: "Cannot find mentorship with the given id" })
    }

    if (mentorshipData.hackerId !== uid) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    // handle if booking is aleady 45 mins away
    const fortyFiveMinsFromNow = DateTime.now().toUnixInteger() + (45 * 60);
    if (mentorshipData.startTime < fortyFiveMinsFromNow) {
      return res.status(400).json({ error: "Mentorship cannot be canceled less than 45 minutes before schedule." })
    }


    // get mentor and hacker data
    const [mentorSnapshot, hackerSnapshot] = await Promise.all([
      db.collection(USERS).doc(mentorshipData.mentorId).get(),
      db.collection(USERS).doc(uid).get(),
    ])
    const mentorData = mentorSnapshot.data() as FirestoreMentor
    const hackerData = hackerSnapshot.data()

    if (mentorData && mentorshipData.teamName && mentorshipData.hackerName) {
      // sendEmail
      const schedule = epochRangeToScheduleDisplay(mentorshipData.startTime, mentorshipData.endTime)
      const duration = (mentorshipData.endTime - mentorshipData.startTime) / 60
      const locationDisplay = formatMentorshipLocation(mentorshipData.location, mentorshipData.offlineLocation)
      await sendMentorshipCanceledEmail(mentorData.email, {
        mentorName: mentorData.displayName,
        teamName: mentorshipData.teamName,
        hackerName: mentorshipData.hackerName,
        location: locationDisplay,
        scheduleWib: schedule.wib,
        scheduleUtc: schedule.utc,
        schedulePacific: schedule.pacific,
        pacificLabel: schedule.pacificLabel,
        duration,
        portalLink: PORTAL_LINK,
      })

      if (hackerData?.email) {
        await sendMentorshipCanceledEmailHacker(hackerData.email, {
          mentorName: mentorData.displayName,
          teamName: mentorshipData.teamName,
          hackerName: mentorshipData.hackerName,
          location: locationDisplay,
          scheduleWib: schedule.wib,
          scheduleUtc: schedule.utc,
          schedulePacific: schedule.pacific,
          pacificLabel: schedule.pacificLabel,
          duration,
          portalLink: PORTAL_LINK,
        })
      }
    }

    if (mentorshipData.calendarEventId) {
      await cancelMentorshipMeetEvent(mentorshipData.calendarEventId)
    }

    await db.collection(MENTORSHIPS).doc(id).update({
      hackerId: FieldValue.delete(),
      hackerName: FieldValue.delete(),
      teamName: FieldValue.delete(),
      hackerDescription: FieldValue.delete(),
      offlineLocation: FieldValue.delete(),
      meetLink: FieldValue.delete(),
      calendarEventId: FieldValue.delete(),
    })

    return res.status(200).json({ message: "Mentorship has been canceled." })
  } catch (error) {
    functions.logger.error(`Error when trying hackerCancelMentorship: ${(error as Error).message} `)
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
}


export const hackerGetMyMentorships = async (
  req: Request, res: Response
) => {
  try {
    const uid = req.user?.uid
    if (!uid) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    // available query params
    const {
      upcomingOnly,
      recentOnly
    } = req.query;

    let query: CollectionReference | DocumentData = db.collection(MENTORSHIPS);

    query = query.where(HACKER_ID, "==", uid);

    const currentTimeSeconds = DateTime.now().toUnixInteger();
    if (upcomingOnly === 'true') {
      query = query.where(START_TIME, ">=", currentTimeSeconds);
    } else if (recentOnly === 'true') {
      query = query.where(START_TIME, "<=", currentTimeSeconds);
    }

    const snapshot = await query.orderBy(START_TIME, "asc").get();

    const mentorships = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    })) as MentorshipAppointment[];

    const mentorIds = Array.from(new Set(mentorships.map((m) => m.mentorId).filter(Boolean)));
    const mentorById = new Map<string, FirestoreMentor>();
    if (mentorIds.length > 0) {
      const mentorDocs = await db.getAll(...mentorIds.map((id) => db.collection(USERS).doc(id)));
      mentorDocs.forEach((doc) => {
        if (doc.exists) {
          mentorById.set(doc.id, doc.data() as FirestoreMentor);
        }
      });
    }

    const response: MentorshipAppointmentResponseAsHacker[] = mentorships.map((m) => {
      const mentor = mentorById.get(m.mentorId);
      return {
        id: m.id,
        startTime: m.startTime,
        endTime: m.endTime,
        mentorId: m.mentorId,
        mentorName: mentor?.displayName,
        mentorSpecialization: mentor?.specialization,
        mentorEmail: mentor?.email,
        mentorDiscordUsername: mentor?.discordUsername,
        mentorTitle: mentor?.mentorTitle,
        hackerId: m.hackerId,
        hackerName: m.hackerName,
        teamName: m.teamName,
        hackerDescription: m.hackerDescription,
        location: m.location,
        offlineLocation: m.offlineLocation,
        meetLink: m.meetLink,
      };
    });

    return res.status(200).json({
      data: response,
    });
  } catch (error) {
    functions.logger.error(`Error when trying hackerGetMyMentorships: ${(error as Error).message} `)
    return res.status(500).json({ error: (error as Error).message })
  }
}

export const hackerGetMyMentorship = async (
  req: Request, res: Response
) => {
  try {
    const uid = req.user?.uid
    if (!uid) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    const { id } = req.params
    if (!id) {
      return res.status(400).json({ error: "id is required as argument" })
    }

    const snapshot = await db.collection(MENTORSHIPS).doc(id).get()
    const data = snapshot.data()
    if (!snapshot.exists || !data) {
      return res.status(404).json({ error: "Cannot find mentorship" })
    }

    if (data.mentorId !== uid) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    return res.status(200).json({ data: data })
  } catch (error) {
    functions.logger.error(`Error when trying hackerGetMyMentorship: ${(error as Error).message} `)
    return res.status(500).json({ error: (error as Error).message })
  }
}

/**
 * Get available slots from mentor.
 * @param req 
 * @param res 
 * @returns 
 */
export const hackerGetAvailableMentorSchedules = async (
  req: Request,
  res: Response
) => {
  try {
    const { mentorId, limit } = req.query
    res.setHeader('Cache-Control', 'no-store'); // Disable caching
    res.setHeader('Content-Type', 'application/json');
    if (!mentorId) {
      return res.status(400).json({ error: "mentorId is required as argument" })
    }

    let query = db.collection(MENTORSHIPS)
      .where(MENTOR_ID, "==", mentorId)
      .where(HACKER_ID, "!=", null)

    if (limit) {
      const numericLimit = parseInt(limit as string, 10);
      if (!isNaN(numericLimit) && numericLimit > 0) {
        query = query.limit(numericLimit);
      }
    }

    const snapshot = await query.get()

    const allSchedules = snapshot.docs.map((doc) => ({
      id: doc.id,
      startTime: doc.data().startTime,
      endTime: doc.data().endTime,
      mentorId: doc.data().mentorId,
      hackerId: doc.data().hackerId,
      location: doc.data().location,
    })) as MentorshipAppointmentResponseAsHacker[];

    return res.status(200).json({ data: allSchedules });
  } catch (error) {
    functions.logger.error(`Error when trying hackerGetMentorSchedules: ${(error as Error).message} `)
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
}