export interface FirestoreMentor {
  id?: string;
  email: string;
  name: string;
  mentor: boolean;
  specialization: string;
  discordUsername: string;
  intro: string; // introduction given by mentor

  available?: number // to represent how many slots available
}

export interface MentorshipAppointment {
  id?: string;
  startTime: number;
  endTime: number;
  mentorId: string;
  hackerId?: string; // a hacker book for the whole team
  teamName: string;
  hackerDescription?: string; // desc given needed by hacker
  location: string;
  offlineLocation?: string; // to be filled if the location is offline
  mentorMarkAsDone: boolean;
  mentorMarkAsAfk: boolean; // mark if this team is AFK
  mentorNotes: string // to give this appointment a note
  hackerMarkAsDone: boolean;
}

export interface MentorshipAppointmentResponseAsMentor {
	id?: string;
  startTime: number;
  endTime: number;
  mentorId: string;
  hackerId?: string;
  hackerName?: string;
  teamName?: string;
  hackerDescription?: string; // desc given needed by hacker
  location: string; // offline or online
  offlineLocation?: string; // to be filled if the location is offline
  mentorMarkAsDone?: boolean;
  mentorMarkAsAfk?: boolean; // mark if this team is AFK
  mentorNotes?: string // to give this appointment a note
}

export interface MentorshipAppointmentResponseAsHacker {
	id?: string;
  startTime: number;
  endTime: number;
  mentorId: string;
  hackerId?: string;
  hackerName?: string;
  teamName?: string;
  hackerDescription?: string; // desc given needed by hacker
  location: string; // offline or online
  offlineLocation?: string; // to be filled if the location is offline
}
