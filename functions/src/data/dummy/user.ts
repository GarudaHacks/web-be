import { FirestoreMentor } from "../../models/mentorship";
import { User } from "../../models/user";

export const dummy_mentors: FirestoreMentor[] = [
  {
    "id": "-OVQFbrn-Ct6u6SSB47I",
    mentor: true,
    "email": "dummy@mentor.com",
    "name": "Lorem Ipsum",
    "specialization": "backend,frontend",
    "discordUsername": "lole",
    "intro": "Hello fwens"
  },
  {
    "id": "-OVQFrFPecnWerr4SwXn",
    mentor: true,
    "email": "dummy2@mentor.com",
    "name": "John Pork",
    "specialization": "product manager,designer",
    "discordUsername": "hehei",
    "intro": "Hi guuyss"
  }
]

export const dummy_hackers: User[] = [
  {
    "id": "-OVQHbXAlQiM5NQHrTe1",
    "email": "hacker@gmail.com",
    "firstName": "Hacker",
    "lastName": "Last",
  }
]