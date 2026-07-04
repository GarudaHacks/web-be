export interface FirestoreMentor {
  id?: string;
  email: string;
  displayName: string;
  mentor: boolean;
  specialization: string;
  discordUsername: string;
  intro: string; // introduction given by mentor
  mentorTitle: string; // short title for mentor
  available?: number // to represent how many slots available
}

export interface MentorshipAppointment {
  id?: string;
  startTime: number;
  endTime: number;
  mentorId: string;
  hackerId?: string; // a hacker book for the whole team
  hackerName?: string;
  teamName: string;
  hackerDescription?: string; // desc given needed by hacker
  location: string;
  offlineLocation?: string; // to be filled if the location is offline
  mentorMarkAsDone: boolean;
  mentorMarkAsAfk: boolean; // mark if this team is AFK
  mentorNotes: string // to give this appointment a note
  hackerMarkAsDone: boolean;
  meetLink?: string; // Google Meet link, set when location is online
  calendarEventId?: string; // Google Calendar event backing the Meet link
}

export interface MentorshipAppointmentResponseAsMentor {
	id?: string;
  startTime: number;
  endTime: number;
  mentorId: string;
  hackerId?: string;
  hackerName?: string;
  hackerEmail?: string;
  teamName?: string;
  hackerDescription?: string; // desc given needed by hacker
  location: string; // offline or online
  offlineLocation?: string; // to be filled if the location is offline
  mentorMarkAsDone?: boolean;
  mentorMarkAsAfk?: boolean; // mark if this team is AFK
  mentorNotes?: string // to give this appointment a note
  meetLink?: string; // Google Meet link, set when location is online
  calendarEventId?: string; // Google Calendar event backing the Meet link
}

export interface MentorshipAppointmentResponseAsHacker {
	id?: string;
  startTime: number;
  endTime: number;
  mentorId: string;
  mentorName?: string;
  mentorTitle?: string;
  mentorSpecialization?: string;
  mentorEmail?: string;
  mentorDiscordUsername?: string;
  hackerId?: string;
  hackerName?: string;
  teamName?: string;
  hackerDescription?: string; // desc given needed by hacker
  location: string; // offline or online
  offlineLocation?: string; // to be filled if the location is offline
  meetLink?: string; // Google Meet link, set when location is online
}
