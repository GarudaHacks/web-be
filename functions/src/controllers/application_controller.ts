import { Request, Response } from "express";
import { admin, db } from "../config/firebase";
import validator from "validator";
import Busboy from "busboy";
import {
  APPLICATION_STATES,
  APPLICATION_STATUS,
  DatetimeValidation,
  DropdownValidation,
  ExtendedRequest,
  FileData,
  FileInfo,
  FileValidation,
  NumberValidation,
  Question,
  QUESTION_TYPE,
  StringValidation,
} from "../types/application_types";
import { getUidFromSessionCookie } from "../utils/jwt";
import * as functions from "firebase-functions";

const bucket = admin.storage().bucket();

// upload file
const USER_UPLOAD_PATH = `users/uploads/`;
const STORAGE_BASE_LINK = `https://storage.googleapis.com/${bucket.name}/`;

const VALID_STATES = Object.values(APPLICATION_STATES);

/**
 * Patch application of a hacker. This method use 3 different
 * collections namely `users` to link users' profile,
 * `applications` to link users' application, and `questions`
 * to link questions that must be answered by users.
 *
 * There are 3 states in hacker application page where hackers will
 * go through: 1) `PROFILE`, 2) `INQUIRY`, and 3) `ADDITIONAL_QUESTION`.
 * For each state, a different set of questions will be presented.
 * This endpoint will patch users' data based on those states, as well
 * as giving proper validation responses. In DB, questions will have
 * this state field to determine which section they will be shown within.
 *
 * For example, `PROFILE` state will expect field `firstName` and
 * `lastName` in the request (from `questions` collection in DB).
 * This field will be validated accordingly and ignore any other
 * additional fields that is included in the request.
 */
export const patchApplication = async (
  req: Request,
  res: Response
): Promise<void> => {
  let errors = [];
  try {
    const UID = await getUidFromSessionCookie(req);
    if (!UID) {
      res.status(400).json({
        status: 400,
        error: "Invalid authentication token",
      });
      return;
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      res.status(400).json({
        status: 400,
        error: "Expected body",
      });
      return;
    }

    errors = validateApplicationState(req);
    if (errors.length > 0) {
      res.status(400).json({
        status: 400,
        error: "Validation failed",
        details: errors,
      });
      return;
    }

    errors = await validateApplicationResponse(req, UID);
    if (errors.length > 0) {
      res.status(400).json({
        status: 400,
        error: "Validation failed",
        details: errors,
      });
      return;
    }

    const dataToSave = await constructDataToSave(req);
    await saveData(dataToSave, req.body.state, UID);

    res.status(201).json({
      status: 201,
      success: true,
      data: dataToSave,
    });
  } catch (error) {
    const e = error as Error;
    res.status(500).json({ status: 500, error: e.message });
  }
};

// eslint-disable-next-line require-jsdoc
async function saveData(
  dataToSave: Record<string, string>,
  state: APPLICATION_STATES,
  uid: string
) {
  try {
    // if currently in PROFILE state, then upsert data to `users` collection.
    if (state === APPLICATION_STATES.PROFILE) {
      const userRef = db.collection("users").doc(uid);
      const userDoc = await userRef.get();

      const data: Record<string, string> = {
        ...dataToSave,
        userId: uid,
        updatedAt: new Date().toISOString(),
      };

      if (!userDoc.exists) {
        data.createdAt = new Date().toISOString();
      }

      await userRef.set(data, { merge: true });
    }

    // upsert other data in `application` section.
    else {
      const docRef = db.collection("applications").doc(uid);
      const doc = await docRef.get();

      const data: Record<string, string> = {
        ...dataToSave,
        userId: uid,
        updatedAt: new Date().toISOString(),
      };

      if (!doc.exists) {
        data.createdAt = new Date().toISOString();
      }

      await docRef.set(data, { merge: true });
    }
  } catch (error) {
    console.error("Error saving application:", error);
    throw new Error("Failed to save application");
  }
}

/**
 * Construct data to be saved in a proper format.
 * This method change file name into a proper firebase storage link format.
 */
async function constructDataToSave(
  req: Request
): Promise<Record<string, string>> {
  const UID = await getUidFromSessionCookie(req);

  const questions: Question[] = await findQuestionsByState(req.body.state);
  const dataToSave: Record<string, string> = {};
  for (const question of questions) {
    if (question.id === undefined || question.id === null) continue;
    const fieldValue = req.body[question.id];
    // rewrite file path
    if (question.type === QUESTION_TYPE.FILE && !(fieldValue === undefined || fieldValue === "" || fieldValue === null)) {
      dataToSave[
        question.id
      ] = `${STORAGE_BASE_LINK}${USER_UPLOAD_PATH}${UID}_${
        question.id
      }.${req.body[question.id].split(".").pop()}`;
    } else {
      dataToSave[question.id] = fieldValue;
    }
  }
  return dataToSave;
}

// eslint-disable-next-line require-jsdoc
function validateApplicationState(req: Request) {
  const errors = [];
  if (!("state" in req.body)) {
    errors.push({
      field_id: `state`,
      message: `Required field state`,
    });
  } else if (!VALID_STATES.includes(req.body.state)) {
    errors.push({
      field_id: `state`,
      message: `Invalid state ${
        req.body.state
      }. Must be one of ${VALID_STATES.join(", ")}`,
    });
  }
  return errors;
}

// eslint-disable-next-line require-jsdoc
async function findQuestionsByState(
  state: APPLICATION_STATES
): Promise<Question[]> {
  const snapshot = await db
    .collection("questions")
    .where("state", "==", state)
    .get();
  const questions = snapshot.docs.map(
    (doc) =>
      ({
        id: doc.id,
        ...doc.data(),
      } as Question)
  );
  return questions;
}

// eslint-disable-next-line require-jsdoc
async function validateApplicationResponse(req: Request, uid: string) {
  const errors = [];
  const state = req.body.state;
  const questions = await findQuestionsByState(state);

  for (const question of questions) {
    if (question.id === undefined || question.id === null) {
      errors.push({
        field_id: `id`,
        message: `Required field id`,
      });
      continue;
    }

    const fieldValue = req.body[question.id];

    if (fieldValue === undefined && fieldValue === "") {
      continue;
    }

    let fieldErrors;
    switch (question.type) {
    case QUESTION_TYPE.STRING:
      fieldErrors = validateStringValue(fieldValue, question);
      break;
    case QUESTION_TYPE.TEXTAREA:
      fieldErrors = validateStringValue(fieldValue, question);
      break;
    case QUESTION_TYPE.NUMBER:
      fieldErrors = validateNumberValue(fieldValue, question);
      break;
    case QUESTION_TYPE.DATE:
      fieldErrors = validateDatetimeValue(fieldValue, question);
      break;
    case QUESTION_TYPE.DROPDOWN:
      fieldErrors = validateDropdownValue(fieldValue, question);
      break;
    case QUESTION_TYPE.FILE:
      fieldErrors = await validateFileUploaded(fieldValue, question, uid);
      break;
    default:
      fieldErrors = [
        `Unsupported type for field ${question.id}: ${typeof fieldValue}`,
      ];
    }

    errors.push(...fieldErrors);
  }
  return errors;
}

/**
 * Validate file upload.
 * Checking is done by matching the originalName in the uploaded metadata
 * if match, we confirm that file is uploaded already.
 */
async function validateFileUploaded(
  fieldValue: string | any,
  question: Question,
  uid: string
) {
  const errors: { field_id: string; message: string; }[] = [];

  const validation = question.validation as FileValidation;


  // skip validation if not required and value is empty
  if (
    validation.required !== true &&
    (fieldValue === undefined || fieldValue === "" || fieldValue === null)
  ) {
    return errors;
  }

  // required
  if (
    validation.required === true &&
    (fieldValue === undefined || fieldValue === "" || fieldValue === null)
  ) {
    errors.push({
      field_id: `${question.id}`,
      message: `This field is required`,
    });
    return errors;
  }

  try {
    // check in firebase storage
    const fileName = `${uid}_${question.id}.${fieldValue.split(".").pop()}`;
    const fullFilename = `${USER_UPLOAD_PATH}${fileName}`;
    const fileUpload = bucket.file(fullFilename);

    const [exists] = await fileUpload.exists();
    if (!exists) {
      errors.push({
        field_id: `${question.id}`,
        message: `File not found or hasn't been uploaded`,
      });
      return errors;
    }

    const [metadata] = await fileUpload.getMetadata();
    if (!metadata.metadata || metadata.metadata.originalName !== fieldValue) {
      errors.push({
        field_id: `${question.id}`,
        message: `Invalid file metadata`,
      });
    }
  } catch (error) {
    errors.push({
      field_id: `${question.id}`,
      message: `Error checking file`,
    });
  }

  return errors;
}

// eslint-disable-next-line require-jsdoc
function validateDropdownValue(fieldValue: string | any, question: Question) {
  const errors: { field_id: string; message: string; }[] = [];

  const validation = question.validation as DropdownValidation;

  // skip validation if not required and value is empty
  if (
    validation.required !== true &&
    (fieldValue === undefined || fieldValue === "" || fieldValue === null)
  ) {
    return errors;
  }

  // required
  if (
    validation.required === true &&
    (fieldValue === undefined || fieldValue === "" || fieldValue === null)
  ) {
    errors.push({
      field_id: `${question.id}`,
      message: `This field is required`,
    });
    return errors;
  }

  // check valid value
  const options = question.options;
  if (options && !options.includes(fieldValue)) {
    errors.push({
      field_id: `${question.id}`,
      message: `Invalid value. Must be one of ${options.join(", ")}`,
    });
  }
  return errors;
}

// eslint-disable-next-line require-jsdoc
function validateDatetimeValue(fieldValue: string, question: Question) {
  const errors: { field_id: string; message: string; }[] = [];

  const validation = question.validation as DatetimeValidation;

  // skip validation if not required and value is empty
  if (
    validation.required !== true &&
    (fieldValue === undefined || fieldValue === "" || fieldValue === null)
  ) {
    return errors;
  }

  // required
  if (
    validation.required === true &&
    (fieldValue === undefined || fieldValue === "" || fieldValue === null)
  ) {
    errors.push({
      field_id: `${question.id}`,
      message: `This field is required`,
    });
    return errors;
  }

  // check valid date
  if (!validator.isISO8601(fieldValue)) {
    errors.push({
      field_id: `${question.id}`,
      message: `Date must be in ISO8601 string format`,
    });
  }
  return errors;
}

// eslint-disable-next-line require-jsdoc
function validateNumberValue(fieldValue: number | any, question: Question) {
  const errors: { field_id: string; message: string; }[] = [];

  const validation = question.validation as NumberValidation;

  // skip validation if not required and value is empty
  if (
    validation.required !== true &&
    (fieldValue === undefined || fieldValue === "" || fieldValue === null)
  ) {
    return errors;
  }

  // required
  if (
    validation.required === true &&
    (fieldValue === undefined || fieldValue === "" || fieldValue === null)
  ) {
    errors.push({
      field_id: `${question.id}`,
      message: `This field is required`,
    });
    return errors;
  }

  // check type
  if (typeof fieldValue !== "number") {
    errors.push({
      field_id: `${question.id}`,
      message: `Must be type of number`,
    });
    return errors;
  }

  // check value
  if (validation.minValue && fieldValue < validation.minValue) {
    errors.push({
      field_id: `${question.id}`,
      message: `Must be more than or equal to ${validation.minValue}`,
    });
  }
  if (validation.maxValue && fieldValue > validation.maxValue) {
    errors.push({
      field_id: `${question.id}`,
      message: `Must be less than or equal to ${validation.maxValue}`,
    });
  }

  return errors;
}

/**
 * Validate string value. Also works for textarea.
 */
function validateStringValue(fieldValue: string | any, question: Question) {
  const errors: { field_id: string; message: string; }[] = [];

  const validation = question.validation as StringValidation;

  // skip validation if not required and value is empty
  if (
    validation.required !== true &&
    (fieldValue === undefined || fieldValue === "" || fieldValue === null)
  ) {
    return errors;
  }

  // required
  if (
    validation.required === true &&
    (fieldValue === undefined || fieldValue === "" || fieldValue === null)
  ) {
    errors.push({
      field_id: `${question.id}`,
      message: `This field is required`,
    });
    return errors;
  }

  // check type
  if (typeof fieldValue !== "string") {
    errors.push({
      field_id: `${question.id}`,
      message: `Must be type of string`,
    });
    return errors;
  }

  /**
   * Counts the number of words in a given text string.
   * @param {string} text - The text to count words from
   * @returns {number} The number of words in the text
   */
  function countWords(text: string): number {
    if (!text || text.trim() === "") return 0;
    return text.trim().split(/\s+/).length;
  }

  // check length
  if (validation.minLength && countWords(fieldValue) < validation.minLength) {
    errors.push({
      field_id: `${question.id}`,
      message: `Must be at least ${validation.minLength} word(s)`,
    });
  } else if (validation.maxLength && countWords(fieldValue) > validation.maxLength) {
    errors.push({
      field_id: `${question.id}`,
      message: `Must be less than ${validation.maxLength} word(s)`,
    });
  }

  // check regex pattern
  // if (validation.pattern) {
  //   try {
  //     const regex = new RegExp(validation.pattern);
  //     if (!regex.test(fieldValue)) {
  //       errors.push({
  //         field_id: `${question.id}`,
  //         message: `Value does not match the required pattern`,
  //       });
  //     }
  //   } catch (regexError) {
  //     errors.push({
  //       field_id: `${question.id}`,
  //       message: `Invalid validation pattern configured`,
  //     });
  //   }
  // }
  
  return errors;
}

/**
 * Upload file to firebase storage. Require authentication and question id to be passed.
 * This endpoint intended to be called immediately in form after choosing a file.
 * If the question id is not found or mismatch file type, throw error. Also handle
 * file size constraint throwing `413` error.
 *
 * Filename stored as `<uid>_<questionId>.<fileFormat>`.
 *
 * Param:
 * - `file`: file to be uploaded
 * - `questionId`: question id to be linked to the file
 */
export const uploadFile = async (
  req: ExtendedRequest,
  res: Response
): Promise<void> => {
  if (!req.headers["content-type"]) {
    res.status(400).json({
      status: 400,
      error: "Missing content-type header",
    });
    return;
  }

  const UID = await getUidFromSessionCookie(req);
  if (!UID) {
    res.status(400).json({
      status: 400,
      error: "Invalid authentication token",
    });
    return;
  }

  const questionId: string | undefined = req.query.questionId?.toString();
  if (!questionId) {
    res.status(400).json({
      status: 400,
      error: "Validation failed",
      details: [
        {
          field_id: `questionId`,
          message: `This field is required`,
        },
      ],
    });
    return;
  }

  const question: Question = <Question>await findQuestionById(questionId);
  if (!question) {
    res.status(400).json({
      error: "Validation failed",
      details: [
        {
          field_id: `${questionId}`,
          message: `No such question`,
        },
      ],
    });
    return;
  }

  const validation = question.validation as FileValidation;

  const MAX_FILE_SIZE = validation.maxSize || 1; // size constraint, default to 1MB
  const busboy = Busboy({
    headers: req.headers,
    limits: {
      fileSize: MAX_FILE_SIZE * 1024 * 1024,
    },
  });

  let fileData: FileData | null = null;
  let fileSizeExceeded = false;

  try {
    await new Promise((resolve, reject) => {
      busboy
        .once("close", resolve)
        .once("error", reject)
        .on(
          "file",
          (fieldname: string, file: NodeJS.ReadableStream, info: FileInfo) => {
            // const {filename, encoding, mimeType} = info;
            const { filename, mimeType } = info;

            if (
              !validation.allowedTypes ||
              !validation.allowedTypes.includes(mimeType)
            ) {
              file.resume(); // discard the file
              return;
            }

            const chunks: Buffer[] = [];
            file.on("data", (chunk: Buffer) => {
              if (!fileSizeExceeded) {
                // only collect chunks if size limit not exceeded
                chunks.push(chunk);
              }
            });

            // handle file size limit
            file.on("limit", () => {
              fileSizeExceeded = true;
              res.writeHead(413, {
                Connection: "close",
                "Content-Type": "application/json",
              });
              res.end(
                JSON.stringify({
                  error: "File too large",
                  details: [
                    {
                      field_id: questionId,
                      message: `File size exceeds maximum limit of ${
                        MAX_FILE_SIZE / (1024 * 1024)
                      }MB`,
                    },
                  ],
                })
              );
            });

            file.on("end", () => {
              if (!fileSizeExceeded) {
                const newfileData: FileData = {
                  buffer: Buffer.concat(chunks as unknown as Uint8Array[]),
                  originalname: filename,
                  mimetype: mimeType,
                  fieldname: fieldname,
                };
                fileData = newfileData;
              }
            });
          }
        );

      // feed busboy with the request data
      if (req.rawBody) {
        busboy.end(req.rawBody);
      } else {
        // if rawBody is not available, read from the request stream
        req.pipe(busboy);
      }
    });

    // exit early if file size was exceeded
    if (fileSizeExceeded) {
      return;
    }

    if (!fileData) {
      res.status(400).json({
        status: 400,
        error: "Failed to upload",
        details: [
          {
            field_id: `${questionId}`,
            message: `This field is required or unsupported file type`,
          },
        ],
      });
      return;
    }

    const safeFileData = fileData as {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      fieldname: string;
    };

    // upload file to firebase
    const fileName = `${USER_UPLOAD_PATH}${UID}_${
      question.id
    }.${safeFileData.originalname.split(".").pop()}`;
    const fileUpload = bucket.file(fileName);

    // check if file exists and delete it
    const [exists] = await fileUpload.exists();
    if (exists) {
      await fileUpload.delete();
    }

    const stream = fileUpload.createWriteStream({
      metadata: {
        contentType: safeFileData.mimetype,
        metadata: {
          uploadedBy: UID,
          questionId: question.id,
          uploadedAt: new Date().toISOString(),
          originalName: safeFileData.originalname,
        },
      },
    });

    const uploadPromise = new Promise((resolve, reject) => {
      stream.on("error", reject);
      stream.on("finish", async () => {
        try {
          await fileUpload.makePublic();
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
          resolve(publicUrl);
        } catch (err) {
          reject(err);
        }
      });
    });

    stream.end(safeFileData.buffer);

    const publicUrl = await uploadPromise;
    res.status(201).json({
      status: 201,
      message: "File uploaded successfully",
      data: {
        url: publicUrl,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ status: 500, error: "Internal server error" });
  }
};

// eslint-disable-next-line require-jsdoc
async function findQuestionById(questionId: string) {
  try {
    const docRef = await db.collection("questions").doc(questionId).get();
    if (!docRef.exists) {
      return null;
    }
    return {
      id: docRef.id,
      ...docRef.data(),
    };
  } catch (error) {
    console.error("Error fetching question:", error);
    return null;
  }
}

export const getApplicationQuestions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const state: string | undefined = req.query.state?.toString();
    if (!state) {
      res.status(400).json({
        status: 400,
        error: "Bad request",
        details: [
          {
            field_id: `state`,
            message: `This field is required`,
          },
        ],
      });
      return;
    }

    if (!VALID_STATES.includes(state as APPLICATION_STATES)) {
      res.status(400).json({
        status: 400,
        error: "Bad request",
        details: [
          {
            field_id: "state",
            message: `This field is required. Must be one of ${VALID_STATES.join(
              ", "
            )}`,
          },
        ],
      });
      return;
    }

    const questions = await findQuestionsByState(state as APPLICATION_STATES);

    res.status(200).json({
      status: 200,
      data: questions,
    });
  } catch (error) {
    const e = error as Error;
    res.status(500).json({ error: e.message });
  }
};

export const getApplicationQuestion = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const questionId: string | undefined = req.query.questionId?.toString();
    if (!questionId) {
      res.status(400).json({
        status: 400,
        error: "Bad request",
        details: [
          {
            field_id: `questionId`,
            message: `This field is required`,
          },
        ],
      });
      return;
    }

    const question = await findQuestionById(questionId);

    if (!question) {
      res.status(404).json({
        status: 404,
        error: "Not found",
        details: [
          {
            field_id: `${questionId}`,
            message: `Cannot find such question`,
          },
        ],
      });
      return;
    }

    res.status(200).json({
      status: 200,
      data: question,
    });
  } catch (error) {
    const e = error as Error;
    res.status(500).json({ error: e.message });
  }
};

export const getApplicationStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const UID = await getUidFromSessionCookie(req);
    if (!UID) {
      res.status(400).json({
        status: 400,
        error: "Invalid authentication token",
      });
      return;
    }

    const docRef = await db.collection("users").doc(UID).get();
    if (!docRef.exists) {
      res.status(404).json({
        status: 404,
        error: "Not found",
        message: `Cannot find this user`,
      });
    }

    const data = docRef.data();

    if (!data) {
      res.status(404).json({
        status: 404,
        error: "Not found",
        message: `Cannot find application status for this user`,
      });
      return;
    }

    res.status(200).json({
      status: 200,
      data: data.status,
    });
  } catch (error) {
    const e = error as Error;
    res.status(500).json({
      status: 500,
      error: e.message,
    });
  }
};

export const setApplicationStatusToSubmitted = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const UID = await getUidFromSessionCookie(req);

    if (!UID) {
      res.status(400).json({
        status: 400,
        error: "Invalid authentication token",
      });
      return;
    }

    const userRef = db.collection("users").doc(UID);

    const data: Record<string, string> = {
      status: APPLICATION_STATUS.SUBMITTED,
      updatedAt: new Date().toISOString(),
    };

    await userRef.set(data, { merge: true });

    res.status(201).json({
      status: 201,
      success: true,
    });
  } catch (err) {
    functions.logger.error("Error updating application status:", err);
    res.status(500).json({
      status: 500,
      error: "Internal Server Error",
    });
  }
};
