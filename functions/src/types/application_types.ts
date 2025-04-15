import {Request} from "express";

/**
 * State for part to show in the web UI of GH Portal.
 */
export enum APPLICATION_STATES {
  INTRO,
  PROFILE,
  INQUIRY,
  ADDITIONAL_QUESTION,
  SUBMITTED,
}

export enum QUESTION_TYPE {
  NUMBER = "number",
  STRING = "string",
  TEXTAREA = "textarea",
  DATE = "datetime",
  DROPDOWN = "dropdown",
  FILE = "file"
}

export interface StringValidation {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}

export interface NumberValidation {
  required?: boolean;
  minValue?: number;
  maxValue?: number;
}

export interface DatetimeValidation {
  required?: boolean;
}

export interface DropdownValidation {
  required?: boolean;
  options?: string[];
}

export interface FileValidation {
  required?: boolean;
  allowedTypes: string; // comma separated types e.g. image/jpeg,application/pdf
  maxSize: number; // in MB
}

export type ValidationType = {
  [QUESTION_TYPE.STRING]: StringValidation;
  [QUESTION_TYPE.TEXTAREA]: StringValidation; // textarea use string validation
  [QUESTION_TYPE.NUMBER]: NumberValidation;
  [QUESTION_TYPE.DATE]: DatetimeValidation;
  [QUESTION_TYPE.DROPDOWN]: DropdownValidation;
  [QUESTION_TYPE.FILE]: FileValidation;
};

export interface Question {
  id: string;
  order: number;
  state: APPLICATION_STATES;
  text: string;
  type: QUESTION_TYPE;
  validation: ValidationType;

  options?: string[]; // for dropdown only
}

export interface FileInfo {
  filename: string;
  encoding: string;
  mimeType: string;
}

export interface FileData {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  fieldname: string;
}

export interface ExtendedRequest extends Request {
  rawBody?: Buffer;
}