const { db, admin } = require("../config/firebase");
const validator = require("validator");
const Busboy = require('busboy');
const bucket = admin.storage().bucket();

const AUTH_USER = "ryan";

// upload file
const USER_UPLOAD_PATH = `users/uploads/`;
const STORAGE_BASE_LINK = `https://storage.googleapis.com/${bucket.name}/`


const APPLICATION_STATES = [
  "PROFILE",
  "INQUIRY",
  "ADDITIONAL_QUESTION",
];


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
 *
 * Further example and documentation can be found in `docs/`.
 */
exports.patchApplication = async (req, res) => {
  let errors = [];
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).send({
        error: "Expected body",
      });
    }

    errors = validateApplicationState(req);
    if (errors.length > 0) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors,
      });
    }

    errors = await validateApplicationResponse(req);
    if (errors.length > 0) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors,
      });
    }

    const state = req.body.state;

    const dataToSave = await constructDataToSave(req);
    console.log("Data to save", dataToSave)
    await saveData(dataToSave);

    res.json({ success: true, data: dataToSave });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

async function saveData(dataToSave) {
  try {
    const docRef = db.collection('applications').doc(AUTH_USER);
    const doc = await docRef.get();
    
    const data = {
      ...dataToSave,
      updatedAt: new Date().toISOString(),
    };

    if (!doc.exists) {
      data.createdAt = new Date().toISOString();
    }

    await docRef.set(data, { merge: true });
  } catch (error) {
    console.error('Error saving application:', error);
    throw new Error('Failed to save application');
  }
}

async function constructDataToSave(req) {
  const questions = await findQuestionsByState(req.body.state);
  const dataToSave = {}
  for (const question of questions) {
    const fieldValue = req.body[question.id];
    if (question.type === "file") {
      dataToSave[question.id] = `${STORAGE_BASE_LINK}${USER_UPLOAD_PATH}${AUTH_USER}_${QUESTION_ID}.${req.body[question.id].split('.').pop()}`;
    } else {
      dataToSave[question.id] = fieldValue;
    }
  }
  return dataToSave;
}

function validateApplicationState(req) {
  const errors = [];
  if (!("state" in req.body)) {
    errors.push({
      field_id: `state`,
      message: `Missing required field: state`,
    });
  } else if (!APPLICATION_STATES.includes(req.body.state)) {
    errors.push({
      field_id: `state`,
      message: `Invalid state: ${req.body.state}. Must be one of ${APPLICATION_STATES.join(", ")}`,
    });
  }
  return errors;
}

async function findQuestionsByState(state) {
  const snapshot = await db.collection("questions")
    .where("state", "==", state)
    .get();
  const questions = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  return questions;
}

async function validateApplicationResponse(req) {
  const errors = [];
  const state = req.body.state;
  const questions = await findQuestionsByState(state);
  for (const question of questions) {
    const fieldValue = req.body[question.id];

    if (fieldValue === undefined && fieldValue === "") {
      continue;
    }

    let fieldErrors;
    switch (question.type) {
      case "string":
        fieldErrors = validateStringValue(fieldValue, question);
        break;
      case "textarea":
        fieldErrors = validateStringValue(fieldValue, question);
        break;
      case "number":
        fieldErrors = validateNumberValue(fieldValue, question);
        break;
      case "datetime":
        fieldErrors = validateDatetimeValue(fieldValue, question);
        break;
      case "dropdown":
        fieldErrors = validateDropdownValue(fieldValue, question);
        break;
      case "file":
        fieldErrors = await validateFileUploaded(fieldValue, question)
        break;
      default:
        fieldErrors = [`Unsupported type for field ${question.id}: ${typeof fieldValue}`];
    }

    errors.push(...fieldErrors);
  }
  return errors;
}

/**
 * Validate file upload.
 * Checking is done by matching the originalName in the uploaded metadata
 * if match, we confirm that file is uploaded already.
 * 
 * Further example and documentation can be found in `docs/`.
 */
async function validateFileUploaded(fieldValue, question) {
  const errors = [];
  // required
  if (question.validation["required"] === true && (fieldValue === undefined || fieldValue === "" || fieldValue === null)) {
    errors.push({
      field_id: `${question.id}`,
      message: `Missing required field: ${question.id}`,
    });
    return errors;
  }

  try {
    // check in firebase storage
    const fileName = `${AUTH_USER}_${QUESTION_ID}.${fieldValue.split('.').pop()}`;
    const fullFilename = `${USER_UPLOAD_PATH}${fileName}`
    const fileUpload = bucket.file(fullFilename);

    const [exists] = await fileUpload.exists();
    if (!exists) {
      errors.push({
        field_id: `${question.id}`,
        message: `File not found or hasn't been uploaded: ${question.id}`,
      });
      return errors;
    }

    const [metadata] = await fileUpload.getMetadata();
    if (!metadata.metadata || metadata.metadata.originalName !== fieldValue) {
      errors.push({
        field_id: `${question.id}`,
        message: `Invalid file metadata for: ${question.id}`,
      });
    }
  } catch (error) {
    errors.push({
      field_id: `${question.id}`,
      message: `Error checking file: ${error.message}`,
    });
  }

  return errors;
}

function validateDropdownValue(fieldValue, question) {
  const errors = [];
  // required
  if (question.validation["required"] === true && (fieldValue === undefined || fieldValue === "" || fieldValue === null)) {
    errors.push({
      field_id: `${question.id}`,
      message: `Missing required field: ${question.id}`,
    });
    return errors;
  }

  // check valid value
  const options = question.options;
  if (options && !options.includes(fieldValue)) {
    errors.push({
      field_id: `${question.id}`,
      message: `Invalid value: ${fieldValue}. Must be one of ${options.join(", ")}`,
    });
  }
  return errors;
}

function validateDatetimeValue(fieldValue, question) {
  const errors = [];
  // required
  if (question.validation["required"] === true && (fieldValue === undefined || fieldValue === "" || fieldValue === null)) {
    errors.push({
      field_id: `${question.id}`,
      message: `Missing required field: ${question.id}`,
    });
    return errors;
  }

  // check valid date
  if (!validator.isISO8601(fieldValue)) {
    errors.push({
      field_id: `${question.id}`,
      message: `Date must be in ISO8601 string format: ${fieldValue}`,
    });
  }
  return errors;
}

function validateNumberValue(fieldValue, question) {
  const errors = [];
  // required
  if (question.validation["required"] === true && (fieldValue === undefined || fieldValue === "" || fieldValue === null)) {
    errors.push({
      field_id: `${question.id}`,
      message: `Missing required field: ${question.id}`,
    });
    return errors;
  }

  // check type
  if (typeof fieldValue !== "number") {
    errors.push({
      field_id: `${question.id}`,
      message: `Must be type of number: ${fieldValue}`,
    });
    return errors;
  }

  // check value
  if (question.validation.minValue &&
    fieldValue < question.validation.minValue) {
    errors.push({
      field_id: `${question.id}`,
      message: `Number value must be more than equals ${question.validation.minValue}: ${fieldValue}`,
    });
  } else if (question.validation.maxValue && fieldValue > question.validation.maxValue) {
    errors.push({
      field_id: `${question.id}`,
      message: `Number value must be less than equals ${question.validation.maxValue}: ${fieldValue}`,
    });
  }
  return errors;
}

/**
 * Validate string value. Also works for textarea.
 */
function validateStringValue(fieldValue, question) {
  const errors = [];
  // required
  if (question.validation["required"] === true && (fieldValue === undefined || fieldValue === "" || fieldValue === null)) {
    errors.push({
      field_id: `${question.id}`,
      message: `Missing required field: ${question.id}`,
    });
    return errors;
  }

  // check type
  if (typeof fieldValue !== "string") {
    errors.push({
      field_id: `${question.id}`,
      message: `Must be type of string: ${fieldValue}`,
    });
    return errors;
  }

  // check length
  if (question.validation.minLength &&
    fieldValue.length < question.validation.minLength) {
    errors.push({
      field_id: `${question.id}`,
      message: `Must be at least ${question.validation.minLength} character(s): ${fieldValue}`,
    });
  } else if (question.validation.maxLength && fieldValue.length > question.validation.maxLength) {
    errors.push({
      field_id: `${question.id}`,
      message: `Must be less than ${question.validation.maxLength} character(s): ${fieldValue}`,
    });
  }
  // other string validation if needed
  // ...
  return errors;
}


const QUESTION_ID = "file"

/**
 * Upload file to firebase storage. Require authentication and question id to be passed.
 * This endpoint intended to be called immediately in form after choosing a file.
 * If the question id is not found or mismatch file type, throw error. Also handle
 * file size constraint throwing `413` error.
 * 
 * Param:
 * - `file`: file to be uploaded
 * - `questionId`: question id to be linked to the file
 */
exports.uploadFile = async (req, res) => {
  if (!req.headers['content-type']) {
    return res.status(400).json({ error: 'Missing content-type header' });
  }

  const questionId = req.query.questionId;
  if (!questionId) {
    return res.status(400).json({
      error: 'Validation failed',
      details: [
        {
          field_id: `questionId`,
          message: `Missing required field: questionId`,
        }
      ]
    });
  }

  const question = await findQuestionById(questionId);
  console.log("Q", question)
  if (!question) {
    return res.status(400)
      .json({
        error: 'Validation failed',
        details: [
          {
            field_id: `${questionId}`,
            message: `No such question: ${questionId}`,
          }
        ]
      });
  }

  const MAX_FILE_SIZE = question.validation.maxSize || 1; // size constraint, default to 1MB
  const busboy = Busboy({
    headers: req.headers,
    limits: {
      fileSize: MAX_FILE_SIZE * 1024 * 1024,
    }
  });

  let fileData = null;
  let fileSizeExceeded = false;

  try {
    await new Promise((resolve, reject) => {
      busboy.once('close', resolve)
        .once('error', reject)
        .on('file', (fieldname, file, info) => {
          const { filename, encoding, mimeType } = info;

          if (!question.validation.allowedTypes || !question.validation.allowedTypes.includes(mimeType)) {
            file.resume(); // discard the file
            return;
          }

          const chunks = [];
          file.on('data', (chunk) => {
            if (!fileSizeExceeded) { // only collect chunks if size limit not exceeded
              chunks.push(chunk);
            }
          });

          // handle file size limit
          file.on('limit', function () {
            fileSizeExceeded = true;
            res.writeHead(413, { 'Connection': 'close', 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'File too large',
              details: [{
                field_id: req.questionId,
                message: `File size exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
              }]
            }));
          });

          file.on('end', () => {
            if (!fileSizeExceeded) {
              fileData = {
                buffer: Buffer.concat(chunks),
                originalname: filename,
                mimetype: mimeType,
                fieldname: fieldname
              };
            }
          });
        });

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
      return res.status(400)
        .json({
          error: 'Failed to upload',
          details: [
            {
              field_id: `${questionId}`,
              message: `Missing required field or unsupported file type: ${questionId}`,
            }
          ]
        });
    }

    // upload file to firebase
    const fileName = `${USER_UPLOAD_PATH}${AUTH_USER}_${QUESTION_ID}.${fileData.originalname.split('.').pop()}`;
    const fileUpload = bucket.file(fileName);

    // check if file exists and delete it
    const [exists] = await fileUpload.exists();
    if (exists) {
      await fileUpload.delete();
    }

    const stream = fileUpload.createWriteStream({
      metadata: {
        contentType: fileData.mimetype,
        metadata: {
          uploadedBy: AUTH_USER,
          questionId: QUESTION_ID,
          uploadedAt: new Date().toISOString(),
          originalName: fileData.originalname,
        }
      },
    });

    const uploadPromise = new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.on('finish', async () => {
        try {
          await fileUpload.makePublic();
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
          resolve(publicUrl);
        } catch (err) {
          reject(err);
        }
      });
    });

    stream.end(fileData.buffer);

    const publicUrl = await uploadPromise;
    res.status(200).json({ message: 'File uploaded successfully', url: publicUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function findQuestionById(questionId) {
  try {
    const docRef = await db.collection("questions").doc(questionId).get();
    if (!docRef.exists) {
      return null;
    }
    return {
      id: docRef.id,
      ...docRef.data()
    };
  } catch (error) {
    console.error("Error fetching question:", error);
    return null;
  }
}
