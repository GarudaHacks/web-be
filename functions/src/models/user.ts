export interface User {
  id?: string; // linked to uid in firebase doc (not in the field)

  firstName: string;
  lastName: string;
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

export const formatUser = (data: Partial<User>): User => ({
  firstName: data.firstName || "",
  lastName: data.lastName || "",
  email: data.email || "",
  dateOfBirth: data.dateOfBirth || "",
  school: data.school || "",
  grade: data.grade || null,
  year: data.year || null,
  genderIdentity: data.genderIdentity || "",
  status: data.status || "not applicable",
  portfolio: data.portfolio || "",
  github: data.github || "",
  linkedin: data.linkedin || "",
  admin: data.admin || false,
});
