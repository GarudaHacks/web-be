import {Request} from "express";

export enum APPLICATION_STATUS {
  NOT_APPLICABLE = "not applicable",
  DRAFT = "draft",
  SUBMITTED = "submitted",
  WAITLISTED = "waitlisted",
  REJECTED = "rejected",
  ACCEPTED = "accepted"
}

/**
 * State for part to show in the web UI of GH Portal.
 */
export enum APPLICATION_STATES {
  PROFILE = "PROFILE",
  INQUIRY = "INQUIRY",
  ADDITIONAL_QUESTION = "ADDITIONAL_QUESTION",
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

export type ValidationTypeMap = {
  [QUESTION_TYPE.STRING]: StringValidation;
  [QUESTION_TYPE.TEXTAREA]: StringValidation; // textarea use string validation
  [QUESTION_TYPE.NUMBER]: NumberValidation;
  [QUESTION_TYPE.DATE]: DatetimeValidation;
  [QUESTION_TYPE.DROPDOWN]: DropdownValidation;
  [QUESTION_TYPE.FILE]: FileValidation;
};

export interface Question {
  id?: string;
  order: number;
  state: APPLICATION_STATES;
  text: string;
  type: QUESTION_TYPE;
  validation: ValidationTypeMap[Question["type"]];

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