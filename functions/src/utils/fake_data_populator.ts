import { firestore } from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { faker } from "@faker-js/faker";
import {
  APPLICATION_STATES,
  Question,
  QUESTION_TYPE,
} from "../types/application_types";
import { FirestoreMentor, MentorshipAppointment } from "../models/mentorship";
import { dummy_mentors } from "../data/dummy/user";
import { dummy_mentorships } from "../data/dummy/mentorship";

/**
 * Logs a message with a specific prefix.
 * @param {string} message - The message to log.
 */
function log(message: string) {
  console.log(`FakeDataPopulator | ${message}`);
}

/**
 * A class that helps with populating a local Firestore database
 */
export class FakeDataPopulator {
  /**
   * The database to populate
   */
  firestoreDatabase: firestore.Firestore;

  /**
   * Creates an instance of FakeDataPopulator.
   * @param {firestore.Firestore} firestoreDatabase - The Firestore database to populate.
   */
  constructor(firestoreDatabase: firestore.Firestore) {
    this.firestoreDatabase = firestoreDatabase;
  }

  /**
   * Generates fake data and populates the Firestore database.
   */
  async generateFakeData() {
    log("generateFakeData");

    const generateDocument = await this.getGenerateDocument().get();

    if (!generateDocument.exists) {
      await this.createGenerateDocument();
      await this.generateUsers();

      await this.generateQuestions();
      await this.generateMentorshipAppointments();
      await this.generateMentors()
    }
  }

  /**
   * Generates fake user data and populates the Firestore database.
   * @private
   * @returns {Promise<void>} A promise that resolves when the user documents are created.
   */
  private async generateUsers(): Promise<void> {
    log("generateUsers");

    for (let i = 0; i < 10; i++) {
      const user = {
        email: faker.internet.email(),
        first_name: faker.person.fullName(),
        last_name: faker.person.lastName(),
        date_of_birth: faker.date.past(),
        education: "High School",
        school: faker.company.name(),
        grade: faker.number.int({ min: 9, max: 12 }),
        year: faker.date.future().getFullYear(),
        gender_identity: "Man",
        status: "not applicable",
        portfolio: faker.internet.url(),
        github: faker.internet.url(),
        linkedin: faker.internet.url(),
        admin: false,
        created_at: FieldValue.serverTimestamp(),
      };

      await this.createUserDocument(user);
    }
  }

  /**
   * Generate
   * @private
   */
  private async generateQuestions(): Promise<void> {
    log("generateQuestions");

    let q: Question;

    // string example
    q = {
      id: faker.string.uuid(),
      order: 1,
      state: APPLICATION_STATES.PROFILE,
      text: "Name",
      type: QUESTION_TYPE.STRING,
      validation: {
        required: true,
        pattern: "^[a-zA-Z\\s'-]+$",
      },
    };
    await this.createQuestionDocument(q);

    // number example
    q = {
      id: faker.string.uuid(),
      order: 2,
      state: APPLICATION_STATES.PROFILE,
      text: "Age",
      type: QUESTION_TYPE.NUMBER,
      validation: {
        required: true,
        minValue: 16,
        maxValue: 45,
        pattern: "^[0-9]+$",
      },
    };
    await this.createQuestionDocument(q);

    // date example
    q = {
      id: faker.string.uuid(),
      order: 3,
      state: APPLICATION_STATES.PROFILE,
      text: "Birthday",
      type: QUESTION_TYPE.DATE,
      validation: {
        required: true,
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
    };
    await this.createQuestionDocument(q);

    // dropdown example
    q = {
      id: faker.string.uuid(),
      order: 4,
      state: APPLICATION_STATES.PROFILE,
      text: "Education Level",
      type: QUESTION_TYPE.DROPDOWN,
      validation: {
        required: true,
        pattern: "^(Undergraduate|High School)$",
      },
      options: ["Undergraduate", "High School"],
    };
    await this.createQuestionDocument(q);

    // file example
    q = {
      id: faker.string.uuid(),
      order: 4,
      state: APPLICATION_STATES.PROFILE,
      text: "Profile Photo",
      type: QUESTION_TYPE.FILE,
      validation: {
        required: true,
        allowedTypes: "image/jpg,image/jpeg,image/png",
        maxSize: 5,
        pattern: "\\.(jpg|jpeg|png)$",
      },
    };
    await this.createQuestionDocument(q);

    // string example
    q = {
      id: faker.string.uuid(),
      order: 1,
      state: APPLICATION_STATES.INQUIRY,
      text: "What's your motivation in joining GarudaHacks?",
      type: QUESTION_TYPE.TEXTAREA,
      validation: {
        required: true,
        pattern: "^[\\w\\s\\.,!?-]+$",
      },
    };
    await this.createQuestionDocument(q);

    // string example
    q = {
      id: faker.string.uuid(),
      order: 1,
      state: APPLICATION_STATES.INQUIRY,
      text: "Do you have any limitation that we should be concern about?",
      type: QUESTION_TYPE.TEXTAREA,
      validation: {
        required: true,
        pattern: "^[\\w\\s\\.,!?-]+$",
      },
    };
    await this.createQuestionDocument(q);
  }

  /**
   * Generates mentorship appointments from the given dummy data.
   */
  private async generateMentorshipAppointments(): Promise<void> {
    log("generateMentorshipAppointments");

    dummy_mentorships.map(async (dM: MentorshipAppointment) => {
      await this.createMentorshipAppointmentDocument(dM)
    })
  }

  private async generateMentors(): Promise<void> {
    log("generateMentors")

    dummy_mentors.map(async (mentor: FirestoreMentor) => {
      await this.createMentorDocument(mentor)
    })
  }

  /**
   * Gets the document reference for the generate document.
   * @returns {firestore.DocumentReference} The document reference.
   */
  private getGenerateDocument(): firestore.DocumentReference {
    return this.firestoreDatabase.collection("data").doc("generate");
  }

  /**
   * Creates the generate document in the Firestore database.
   * @private
   * @returns {Promise<void>} A promise that resolves when the document is created.
   */
  private async createGenerateDocument(): Promise<void> {
    log("createGenerateDocument");
    await this.getGenerateDocument().set({});
  }

  /**
   * Creates a user document in the Firestore database.
   * @param {any} user - The user data to add.
   * @private
   * @returns {Promise<void>} A promise that resolves when the document is created.
   */
  private async createUserDocument(user: any) {
    await this.firestoreDatabase.collection("users").add(user);
  }

  /**
   *
   * @param q
   * @private
   */
  private async createQuestionDocument(q: Question): Promise<void> {
    await this.firestoreDatabase.collection("questions").add(q);
  }

  /**
   * Create a mentorship appointment.
   * @param mA mentorship appointment
   */
  private async createMentorshipAppointmentDocument(mA: MentorshipAppointment): Promise<void> {
    await this.firestoreDatabase.collection("mentorships").add(mA)
  }

  /**
   * Create a mentor in user collection.
   */
  private async createMentorDocument(mentor: FirestoreMentor): Promise<void> {
    await this.firestoreDatabase.collection("users").add(mentor)
  }
}
