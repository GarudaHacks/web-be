import { db } from "../config/firebase"
import { FirestoreMentor, MentorshipAppointment, MentorshipAppointmentResponseAsHacker, MentorshipAppointmentResponseAsMentor } from "../models/mentorship";
import { Request, Response } from "express";
import { DateTime } from 'luxon';
import { CollectionReference, DocumentData, FieldPath, FieldValue } from "firebase-admin/firestore";
import { MentorshipConfig } from "../types/config";
import * as functions from "firebase-functions";
import nodemailer from "nodemailer";
import { epochToStringDate } from "../utils/date";


const CONFIG = "config";
const MENTORSHIP_CONIFG = "mentorshipConfig";
const MENTORSHIPS = "mentorships";
const MENTOR_ID = "mentorId";
const HACKER_ID = "hackerId";
const USERS = "users";
const START_TIME = "startTime";

const transporter = nodemailer.createTransport({
  host: "live.smtp.mailtrap.io",
  port: 587,
  auth: {
    user: process.env.MAILTRAP_USER,
    pass: process.env.MAILTRAP_PASS,
  },
});

interface MailOptions {
  from: string | { name: string; address: string };
  to: string;
  subject: string;
  html: string;
  text: string;
}

const createMentorshipCancelMailOptions = (
  mentorEmail: string,
  mentorName: string,
  teamName: string,
  hackerName: string,
  startDate: string,
  endDate: string,
  portalLink: string,
  duration: number
): MailOptions => ({
  from: {
    name: "Garuda Hacks",
    address: "no-reply@garudahacks.com"
  },
  to: mentorEmail,
  subject: `Team ${teamName} Just Canceled A Mentorship Session`,
  html: `
<!DOCTYPE html>
<html>

<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mentorship Booking Canceled</title>
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
</head>
<body
  style="font-family: Arial, sans-serif; line-height: 1.6; color: #fff; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #1a1a1a;">
  <div
    style="background-color: #2d2d2d; border-radius: 8px; padding: 30px; text-align: center; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    <h1 style="color: #fff; margin-bottom: 20px; font-size: 20px;">Hi, ${mentorName}</h1>
    <p style="color: #ff4000; margin-bottom: 25px;">The booking for team ${teamName} <strong>has been canceled</strong>.
    </p>
    <div style="border: 1px solid #718096; border-radius: 8px; color: #718096">
      <div>
        <h4>Team Name: ${teamName}</h4>
        <h4>Hacker Name: ${hackerName}</h4>
      </div>

      <div>
        <p>${startDate} - ${endDate} (${duration} minutes)</p>
      </div>

      <div>
        <a href="${portalLink}"
          style="background-color: #4299e1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; margin-bottom: 25px;">View
          In Portal</a>
      </div>
    </div>
    <div style="padding-top: 10px;">
      The cancelation is permissible up to 45 minutes before the scheduled time.
    </div>
  </div>
  <div style="text-align: center; margin-top: 20px; color: #718096; font-size: 12px;">
    <p>© ${new Date().getFullYear()} Garuda Hacks. All rights reserved.</p>
    <p style="margin-top: 10px;">
      <a href="https://garudahacks.com" style="color: #718096; text-decoration: none;">Visit our website</a> |
      <a href="mailto:hiba@garudahacks.com" style="color: #718096; text-decoration: none;">Contact Support</a>
    </p>
  </div>
</body>
</html>
`,
  text: `Team ${teamName} Just Canceled A Mentorship Session.`
})

const createMentorshipBookingMailOptions = (
  mentorEmail: string,
  mentorName: string,
  teamName: string,
  hackerName: string,
  startDate: string,
  endDate: string,
  portalLink: string,
  duration: number,
): MailOptions => ({
  from: {
    name: "Garuda Hacks",
    address: "no-reply@garudahacks.com"
  },
  to: mentorEmail,
  subject: `Team ${teamName} Just Booked A Mentorship Session`,
  html: `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Mentorship Booking</title>
      <meta name="color-scheme" content="dark">
      <meta name="supported-color-schemes" content="dark">
    </head>
    <body
      style="font-family: Arial, sans-serif; line-height: 1.6; color: #fff; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #1a1a1a;">
      <div
        style="background-color: #2d2d2d; border-radius: 8px; padding: 30px; text-align: center; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <h1 style="color: #fff; margin-bottom: 20px; font-size: 20px;">Hi, ${mentorName}<br></h1>
        <p style="color: #e2e8f0; margin-bottom: 25px;">A team just booked a mentorship session with you.</p>

        <div style="border: 1px solid #718096; border-radius: 8px;">
          <div>
            <h4>Team Name ${teamName}</h4>
            <h4>Hacker Name ${hackerName}</h4>
          </div>

          <div>
            <p>${startDate} - ${endDate} (${duration})</p>
          </div>

          <div>
            <p>Click here to view portal.</p>
            <a href="${portalLink}"
              style="background-color: #4299e1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; margin-bottom: 25px;">View
              In Portal</a>
          </div>
        </div>

      </div>
      <div style="text-align: center; margin-top: 20px; color: #718096; font-size: 12px;">
        <p>© ${new Date().getFullYear()} Garuda Hacks. All rights reserved.</p>
        <p style="margin-top: 10px;">
          <a href="https://garudahacks.com" style="color: #718096; text-decoration: none;">Visit our website</a> |
          <a href="mailto:hiba@garudahacks.com" style="color: #718096; text-decoration: none;">Contact Support</a>
        </p>
      </div>
    </body>
    </html>
  `,
  text: `Team ${teamName} Just Booked A Mentorship Session.`
})

const sendMentorshipBookingEmail = async (
  mentorEmail: string,
  mentorName: string,
  teamName: string,
  hackerName: string,
  startDate: string,
  endDate: string,
  portalLink: string,
  duration: number,
): Promise<void> => {
  const mailOptions = createMentorshipBookingMailOptions(mentorEmail, mentorName, teamName, hackerName, startDate, endDate, portalLink, duration)
  await transporter.sendMail(mailOptions)
  functions.logger.info("Booking email sent successfuly to:", mentorEmail)
  functions.logger.info("Booking email sent successfuly to:", mentorEmail)
}

const sendMentorshipCancelEmail = async (
  mentorEmail: string,
  mentorName: string,
  teamName: string,
  hackerName: string,
  startDate: string,
  endDate: string,
  portalLink: string,
  duration: number,
): Promise<void> => {
  const mailOptions = createMentorshipCancelMailOptions(mentorEmail, mentorName, teamName, hackerName, startDate, endDate, portalLink, duration)
  await transporter.sendMail(mailOptions)
  functions.logger.info("Cancel email sent successfuly to:", mentorEmail)
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

    const currentTimeSeconds = Math.floor(DateTime.now().setZone('Asia/Jakarta').toUnixInteger());
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

    return res.status(200).json({
      data: mentorships,
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
    const allMentors: {
      id?: string;
      email: string;
      name: string;
      mentor: boolean;
      specialization: string;
      discordUsername: string;
      intro: string; // introduction given by mentor

    }[] = [];

    await Promise.all(
      snapshot.docs.map(async (mentor) => {
        const mentorData = mentor.data();

        allMentors.push({
          id: mentor.id,
          email: mentorData.email,
          name: mentorData.name,
          mentor: mentorData.mentor,
          specialization: mentorData.specialization,
          discordUsername: mentorData.discordUsername,
          intro: mentorData.intro,
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

    return res.status(200).json({
      data: {
        id: data.id,
        email: data.email,
        name: data.name,
        mentor: data.mentor,
        specialization: data.specialization,
        discordUsername: data.discordUsername,
        intro: data.intro
      }
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

    // Check if mentorship is open
    const configSnapshot = await db.collection(CONFIG).doc(MENTORSHIP_CONIFG).get()
    const configData = configSnapshot.data()
    if (configData && !configData.isMentorshipOpen) {
      return res.status(400).json({ error: "Mentorship is currently closed" })
    }

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
    const currentTimeSeconds = Math.floor(DateTime.now().setZone('Asia/Jakarta').toUnixInteger());
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

      const thirtyMinsFromNow = Math.floor(DateTime.now().setZone('Asia/Jakarta').toUnixInteger()) + (30 * 60);

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

        await sendMentorshipBookingEmail(
          mentorData.email,
          mentorData.name,
          mentorship.teamName,
          mentorship.hackerName,
          `${epochToStringDate(mentorshipData.startTime)}`,
          `${epochToStringDate(mentorshipData.endTime)}`,
          "https://portal.garudahacks.com",
          (mentorshipData.endTime - mentorshipData.startTime) / 60
        )
        functions.logger.info(`Email sent successfully for mentor ${mentorData.email}:`)
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
    const fortyFiveMinsFromNow = Math.floor(DateTime.now().setZone('Asia/Jakarta').toUnixInteger()) + (45 * 60);
    if (mentorshipData.startTime < fortyFiveMinsFromNow) {
      return res.status(400).json({ error: "Mentorship cannot be canceled less than 45 minutes before schedule." })
    }


    // get mentor data
    const mentorSnapshot = await db.collection(USERS).doc(mentorshipData.mentorId).get()
    const mentorData = mentorSnapshot.data()

    if (mentorData && mentorshipData.teamName && mentorshipData.hackerName) {
      // sendEmail
      await sendMentorshipCancelEmail(
        mentorData.email,
        mentorData.name,
        mentorshipData.teamName,
        mentorshipData.hackerName,
        `${epochToStringDate(mentorshipData.startTime)}`,
        `${epochToStringDate(mentorshipData.endTime)}`,
        "https://portal.garudahacks.com",
        (mentorshipData.endTime - mentorshipData.startTime) / 60
      )
    }

    await db.collection(MENTORSHIPS).doc(id).update({
      hackerId: FieldValue.delete(),
      hackerName: FieldValue.delete(),
      teamName: FieldValue.delete(),
      hackerDescription: FieldValue.delete(),
      offlineLocation: FieldValue.delete(),
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

    const currentTimeSeconds = Math.floor(DateTime.now().setZone('Asia/Jakarta').toUnixInteger());
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

    return res.status(200).json({
      data: mentorships,
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