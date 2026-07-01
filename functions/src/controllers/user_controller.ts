import { Request, Response } from "express";
import { auth, db } from "../config/firebase";
import { signCheckIn } from "../utils/checkin_signature";

/**
 * Fetch all users
 */
export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const snapshot = await db.collection("users").get();
    const users = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const getCurrentUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ id: userDoc.id, ...userDoc.data() });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * Delete the account for logged in user. Cleans up the collection
 * `users` and `applications`.
 */
export const deleteAccount = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userDoc = db.collection("users").doc(userId);
    const applicationDoc = db.collection("applications").doc(userId);

    const applicationSnapshot = await applicationDoc.get();

    const deletes: Promise<unknown>[] = [userDoc.delete()];
    if (applicationSnapshot.exists) {
      deletes.push(applicationDoc.delete());
    }

    await Promise.all(deletes);
    await auth.deleteUser(userId);

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * Get a string representation of a team formation.
 */
function getTeamFormationFromUser(teamFormation: string) {
  if (teamFormation === "Yes, I already have a team") return "Team"
  else if (teamFormation === "No, I will be joining Garuda Hacks solo") return "Solo"
  else return "Speed Dating"
}
/**
 * Get a better string representation of nationality.
 */
function getNationality(nationality: string) {
  return nationality.includes("Indonesia") ? "Indonesian" : "International"
}
/**
 * Formats a stored date of birth as dd/mm/yyyy.
 *
 * Historical data is inconsistent: the applicant's browser saved the birthday
 * as `localMidnight.toISOString()`, so the stored instant is offset from the
 * intended calendar date by whatever timezone that browser was in (e.g. a
 * UTC+8 user's "6 Dec 2003" is stored as 2003-12-05T16:00:00.000Z). No single
 * fixed timezone can correct every row. Because every value represents local
 * midnight, the intended calendar date is always the UTC day nearest to the
 * stored instant — adding 12h and reading the date in UTC recovers it for any
 * offset within ±12h. Newer plain "yyyy-MM-dd" values parse to UTC midnight and
 * are unaffected by the shift.
 */
function formatDateOfBirth(dateOfBirth?: string): string | undefined {
  if (!dateOfBirth) return undefined
  const shifted = new Date(new Date(dateOfBirth).getTime() + 12 * 60 * 60 * 1000)
  if (isNaN(shifted.getTime())) return undefined
  return shifted.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  })
}

export const getBoardingPassInfo = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const applicationSnap = await db.collection("applications").doc(req.user!.uid).get()
    const applicationData = applicationSnap.data()
    const userSnap = await db.collection("users").doc(req.user!.uid).get()
    const userData = userSnap.data()

    const firstName = userData?.firstName ?? ""
    const lastName = userData?.lastName ?? ""
    const confirmedRsvpAt = userData?.confirmedRsvpAt.toDate().toISOString()

    res.status(200).json({
      firstName,
      lastName,
      acceptedAt: userData?.acceptedAt.toDate().toISOString(),
      confirmedRsvpAt,
      // Sign over the SAME confirmedRsvpAt for checkin QR scanner
      qrSignature: signCheckIn(req.user!.uid, firstName, lastName, confirmedRsvpAt),
      teamFormation: `${getTeamFormationFromUser(applicationData?.teamFormation)}`,
      teamName: applicationData?.teamName,
      dateOfBirth: formatDateOfBirth(userData?.dateOfBirth),
      nationality: getNationality(userData?.nationality),
      gender: userData?.genderIdentity,
      affiliation: userData?.occupationPlace,
      email: userData?.email,
      phone: userData?.phone
    })
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}