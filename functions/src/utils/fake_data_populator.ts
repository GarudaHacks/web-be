import { firestore } from "firebase-admin";
import { faker } from "@faker-js/faker";

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
        id: faker.string.uuid(),
        email: faker.internet.email(),
        first_name: faker.person.fullName(),
        last_name: faker.person.lastName(),
        date_of_birth: faker.date.past(),
        education: "High School",
        school: faker.company.name(),
        grade: faker.number.int({ min: 9, max: 12 }),
        year: faker.date.future().getFullYear(),
        gender_identity: "Man",
        status: "Accepted",
        portfolio: faker.internet.url(),
        github: faker.internet.url(),
        linkedin: faker.internet.url(),
        admin: false,
      };

      await this.createUserDocument(user);
    }
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
}
