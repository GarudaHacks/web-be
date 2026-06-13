export interface AuthResponse {
  uid: string
  email: string
  displayName: string
  emailVerified: boolean
  role: string // if not mentor=true or admin=true
  status: string // application status
  discord_uid?: string
}

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
  discord_uid?: string;
}