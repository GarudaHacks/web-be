export interface FirestoreMentor {
  id?: string;
  email: string;
  name: string;
  mentor: boolean;
  specialization: string;
  discordUsername: string;
  intro: string; // introduction given by mentor
}

export interface MentorshipAppointment {
  id?: string; // linked to doc uid in firebase, not field
  startTime: number;
  endTime: number;
  mentorId: string;
  hackerId?: string; // a hacker book for the whole team
  hackerDescription?: string; // desc given needed by hacker
  location: string;
  teamName?: string;
}
