export interface User {
  id?: string; // linked to uid in firebase doc (not in the field)

  displayName: string;
  first_name?: string;
  last_name?: string;
  email: string;
  dateOfBirth?: string;
  school?: string;
  grade?: number | null;
  year?: number | null;
  genderIdentity?: string;
  status?: string;
  portfolio?: string;
  github?: string;
  linkedin?: string;
  admin?: boolean;
}