import { Timestamp } from "firebase-admin/firestore";

export interface MentorshipConfig {
    isMentorshipOpen: boolean; // whether or not participant can start to book mentorship slots
    mentorshipStartDate: Timestamp;
    mentorshipEndDate: Timestamp;
}