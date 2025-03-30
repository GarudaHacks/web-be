import { Request, Response, NextFunction } from "express";
import { mapKeys, camelCase, snakeCase, isObject, isArray } from "lodash";

// Convert request body keys from snake_case to camelCase
export const convertRequestToCamelCase = (
  req: Request,
  _: Response,
  next: NextFunction
) => {
  req.body = mapKeys(req.body, (_, key) => camelCase(key));
  next();
};

// Convert response keys from camelCase to snake_case
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const convertResponseToSnakeCase = (obj: any): any => {
  if (isArray(obj)) {
    return obj.map(convertResponseToSnakeCase);
  } else if (isObject(obj)) {
    return mapKeys(obj, (_, key) => snakeCase(key));
  }
  return obj;
};
