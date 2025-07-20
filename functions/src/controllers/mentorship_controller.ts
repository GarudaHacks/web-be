import { db } from "../config/firebase"
import { FirestoreMentor, MentorshipAppointment, MentorshipAppointmentResponseAsHacker } from "../models/mentorship";
import { Request, Response } from "express";
import { User } from "../models/user";
import { DateTime } from 'luxon';
import { CollectionReference, DocumentData } from "firebase-admin/firestore";
import { MentorshipConfig } from "../types/config";
import * as functions from "firebase-functions";

const MENTORSHIPS = "mentorships";
const MENTOR_ID = "mentorId";
const USERS = "users";
const START_TIME = "startTime";

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
    functions.logger.error(`Error when trying mentorGetMyMentorships: ${(error as Error).message}`)
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
    functions.logger.error(`Error when trying mentorGetMyMentorship: ${(error as Error).message}`)
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

    db.collection(MENTORSHIPS).doc(id);

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

    const allMentors: FirestoreMentor[] = [];
    let query = db.collection('users')
      .where("mentor", "==", true)

    if (limit) {
      const numericLimit = parseInt(limit as string, 10);
      if (!isNaN(numericLimit) && numericLimit > 0) {
        query = query.limit(numericLimit);
      }
    }

    const snapshot = await query.get()

    snapshot.docs.map((mentor) => {
      allMentors.push({
        id: mentor.id,
        ...mentor.data()
      } as FirestoreMentor)
    })
    return res.status(200).json({ data: allMentors })
  } catch (error: any) {
    functions.logger.error(`Error when trying hackerGetMentors: ${(error as Error).message}`)
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

    return res.status(200).json({ data: data })
  } catch (error) {
    functions.logger.error(`Error when trying hackerGetMentor: ${(error as Error).message}`)
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
}

export const hackerGetMentorSchedules = async (
  req: Request,
  res: Response
) => {
  try {
    const { mentorId, limit } = req.query

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
    })) as MentorshipAppointmentResponseAsHacker[];

    return res.status(200).json({ data: allSchedules });
  } catch (error) {
    functions.logger.error(`Error when trying hackerGetMentorSchedules: ${(error as Error).message}`)
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
      return res.status(404).json({error: "Cannot find mentorship"})
    }

    const mentorshipAppointmentResponseAsHacker: MentorshipAppointmentResponseAsHacker = {
      id: data.id,
      startTime: data.startTime,
      endTime: data.endTime,
      mentorId: data.mentorId,
      hackerId: data.hackerId
    }
    return res.status(200).json({data: mentorshipAppointmentResponseAsHacker})
  } catch (error) {
    functions.logger.error(`Error when trying hackerGetMentorSchedules: ${(error as Error).message}`)
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
}



// export const getMentor = async (
//   req: Request,
//   res: Response
// ): Promise<void> => {
//   const { mentorId } = req.params;
//   try {
//     /**
//      * Validate request:
//      * 1. Mentor id is not in params
//      */
//     if (!mentorId) {
//       res.status(400).json({
//         status: 400,
//         error: "Mentor id is required"
//       })
//       return;
//     }

//     /**
//      * Process request
//      * 1. Find mentor in db
//      */
//     const mentorDoc = await db.collection("users").doc(mentorId).get()
//     if (!mentorDoc.exists) {
//       res.status(404).json({
//         status: 404,
//         error: "Cannot find mentor with the given mentor id"
//       })
//       return;
//     }
//     const mentorData = mentorDoc.data()

//     if (mentorData) {
//       const trimmedData: FirestoreMentor = {
//         "id": mentorData.id,
//         "email": mentorData.email,
//         "name": mentorData.name,
//         "intro": mentorData.intro,
//         "specialization": mentorData.specialization,
//         "mentor": mentorData.mentor,
//         "discordUsername": mentorData.discordUsername
//       }
//       res.status(200).json({
//         status: 200,
//         data: trimmedData
//       })
//     } else {
//       res.status(200).json({
//         status: 200,
//         data: {}
//       })
//     }
//   } catch (error) {
//     res.status(500).json({ error: (error as Error).message })
//   }
// }

// /**
//  * Get all mentorship appointments.
//  * 
//  * To be used in admin.
//  * @param req 
//  * @param res 
//  */
// export const getMentorshipAppointments = async (
//   req: Request,
//   res: Response
// ): Promise<void> => {
//   const mentorshipAppointments: MentorshipAppointment[] = [];

//   try {
//     const snapshot = await db.collection('mentorships')
//       .where("mentor", "==", true)
//       .get()
//     snapshot.docs.map((mentor) => {
//       mentorshipAppointments.push({
//         id: mentor.id,
//         ...mentor.data()
//       } as MentorshipAppointment)
//     })
//     res.status(200).json({ mentorshipAppointments })
//   } catch (error) {
//     res.status(500).json({ error: (error as Error).message });
//   }
// }

// /**
//  * Get mentorship appointments by mentor id.
//  * 
//  * Use for:
//  * 1. Admin
//  * 2. Mentor in portal
//  * 3. Hacker in portal
//  * @param req 
//  * @param res 
//  * @returns 
//  */
// export const getMentorshipAppointmentsByMentorId = async (
//   req: Request,
//   res: Response
// ): Promise<void> => {
//   try {
//     const { mentorId } = req.params;
//     const doc = await db.collection("mentorships")
//       .where("mentorId", "==", mentorId)
//       .get();

//     if (doc.empty) {
//       res.status(404).json({ error: "Cannot find mentorships related with the mentor." });
//       return;
//     }

//     const mentorships: MentorshipAppointment[] = [];
//     doc.docs.map((mentorship) => {
//       mentorships.push({
//         id: mentorship.id,
//         ...mentorship.data()
//       } as MentorshipAppointment)
//     })

//     res.status(200).json(mentorships);
//   } catch (error) {
//     res.status(500).json({ error: (error as Error).message });
//   }
// };

// /**
//  * Book mentorship appointment. Use request cookie to get hacker uid.
//  * 
//  * Use for:
//  * 1. Hacker in portal
//  * @param req 
//  * @param res 
//  * @returns 
//  */
// export const bookAMentorshipAppointment = async (
//   req: Request,
//   res: Response
// ): Promise<void> => {
//   try {
//     /**
//      * Validate current user:
//      * 1. User is not valid / not authenticated.
//      * 2. Get current user from db
//      */
//     const uid = req.user?.uid;
//     if (!uid || uid === undefined) {
//       res.status(401).json({
//         status: 401,
//         error: "Cannot get current user uid"
//       })
//       return;
//     }

//     const { mentorshipAppointmentId, hackerDescription } = req.body

//     // reject if no mentorshipAppointmentId
//     if (mentorshipAppointmentId === undefined || !mentorshipAppointmentId) {
//       res.status(400).json({
//         status: 400,
//         error: "mentorshipAppointmentId is required in body"
//       })
//       return
//     }

//     /**
//      * Validation:
//      * 1. Reject if the mentorship appointment does not exist in db
//      * 2. Reject if the mentorship is already booked
//      */
//     const mentorshipAppointmentDoc = await db.collection("mentorships").doc(mentorshipAppointmentId)
//     const mentorshipAppointmentSnap = await mentorshipAppointmentDoc.get()
//     if (!mentorshipAppointmentSnap.exists) {
//       res.status(400).json({
//         status: 400,
//         error: "Mentorship appointment does not exist"
//       })
//       return
//     }

//     const mentorshipData: MentorshipAppointment | undefined = mentorshipAppointmentSnap.data() as MentorshipAppointment
//     if (mentorshipData.hackerId) {
//       res.status(400).json({
//         status: 400,
//         error: "Mentorship slot is already booked"
//       })
//       return
//     }

//     /**
//      * Book the mentorship slot
//      * 1. Update the hackerId for the document
//      */
//     const updatedMentorshipAppointment = {
//       hackerId: uid,
//       hackerDescription: hackerDescription,
//       ...mentorshipData
//     }
//     await mentorshipAppointmentDoc.update(updatedMentorshipAppointment)
//     res.status(200).json({
//       status: 200,
//       data: "Successfuly booked mentorship slot"
//     })
//   } catch (error) {
//     res.status(500).json({ error: (error as Error).message })
//   }
// }


// /**
//  * Get the list of my mentorship appointments.
//  * If user is mentor, by default will return his appointment.
//  * Use request cookie to get uid.
//  * 
//  * Use for:
//  * 1. Mentor in portal
//  * 2. Hacker in portal
//  * 
//  * @param req.query.upcomingOnly boolean : If or not only fetches upcoming only.
//  * @param req.query.recentOnly boolean : If or not only fetches recent only.
//  */

// export const getMyMentorshipAppointments = async (
//   req: Request,
//   res: Response
// ): Promise<void> => {
//   try {
//     // 1. Validate User
//     const uid = req.user?.uid;
//     if (!uid) {
//       res.status(401).json({ status: 401, error: "Cannot get current user uid" });
//       return;
//     }

//     const currentUserSnap = await db.collection("users").doc(uid).get();
//     if (!currentUserSnap.exists) {
//       res.status(400).json({ status: 400, error: "User not found" });
//       return;
//     }

//     const currentUserData = currentUserSnap.data() as FirestoreMentor | User;
//     const upcomingOnly = req.query.upcomingOnly === 'true';
//     const recentOnly = req.query.recentOnly === 'true';

//     // 2. Build Query Dynamically
//     let query = db.collection("mentorships");

//     if (isMentor(currentUserData)) {
//       query = query.where("mentorId", "==", uid) as CollectionReference<DocumentData>;
//     } else {
//       query = query.where("hackerId", "==", uid) as CollectionReference<DocumentData>;;
//     }

//     const currentTimeSeconds = Math.floor(DateTime.now().setZone('Asia/Jakarta').toUnixInteger());
//     if (upcomingOnly) {
//       query = query.where("startTime", ">=", currentTimeSeconds) as CollectionReference<DocumentData>;
//     } else if (recentOnly) {
//       query = query.where("startTime", "<=", currentTimeSeconds) as CollectionReference<DocumentData>;
//     }

//     // 3. Execute Query and Send Response
//     const snapshot = await query.orderBy("startTime", "asc").get();

//     const mentorshipAppointments = snapshot.docs.map((doc) => ({
//       id: doc.id,
//       ...doc.data(),
//     })) as MentorshipAppointment[];

//     res.status(200).json({
//       status: 200,
//       data: mentorshipAppointments,
//     });
//   } catch (error) {
//     res.status(500).json({ error: (error as Error).message });
//   }
// };

// /**
//  * 
//  * @param data 
//  * @returns 
//  */
// function isMentor(data: FirestoreMentor | User): data is FirestoreMentor {
//   return 'mentor' in data;
// }