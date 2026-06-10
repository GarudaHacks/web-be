# Model

## 2025 - GH 6.0

### User
- email: str
- userId: str
- status: str
- displayName: str
- first_name: str
- last_name: str
- preferredName: str
- date_of_birth: str
- gender_identity: str
- github: str
- linkedin: str
- portfolio: str
- education: str
- school: str
- team: str
- year: str
- createdAt: str
- updatedAt: str
- acceptedAt: str


### Stay
- email: str
- userId: str
- displayName: str
- first_name: str
- last_name: str
- preferredName: str
- date_of_birth: str
- gender_identity: str
- github: str
- linkedin: str
- portfolio: str
- education: str
- school: str
- team: str
- year: str
- createdAt: str
- updatedAt: str
- acceptedAt: str

### To be migrated to -> 6.0

- status: str
- github: str
- linkedin: str
- portfolio: str
- education: str
- school: str
- team: str
- year: str
- createdAt: str (migrated but don't delete for the old one)
- updatedAt: str
- acceptedAt: str

### Additional for Mentor

#### To be migrated to -> 6.0

- discordUsername: str
- firstTimePassword: str
- intro: str
- mentor: bool
- specialization: str



### Application

- userId: str
- accommodations: str
- bigProblem: str
- blood_type: str
- code_of_conduct: str
- desiredRoles: str
- dietary_restrictions: str
- emergency_contact_name: str
- emergency_contact_phone: str
- emergency_contact_relationship: str
- evaluationNotes: str
- garudaHacksAttendance: str
- hackathonCount: str
- interestingProject: str
- liability_waiver: str
- list_teammates: str
- lookingForTeammates: str
- medical_consent: str
- medical_info: str
- motivation: str
- referralSource: str
- resume: str
- score: int64
- createdAt: str
- updatedAt: str


### To be migrated to -> 6.0

- accommodations: str
- bigProblem: str
- blood_type: str
- code_of_conduct: str
- desiredRoles: str
- dietary_restrictions: str
- emergency_contact_name: str
- emergency_contact_phone: str
- emergency_contact_relationship: str
- evaluationNotes: str
- garudaHacksAttendance: str
- hackathonCount: str
- interestingProject: str
- liability_waiver: str
- list_teammates: str
- lookingForTeammates: str
- medical_consent: str
- medical_info: str
- motivation: str
- referralSource: str
- resume: str
- score: int64
- createdAt: str
- updatedAt: str


## Backup Script

Backup is possible up to 7 days prior to now.

```shell
gcloud firestore import \
  gs://garuda-hacks-6-0.appspot.com/2026-06-10T16:32:53_10213 \
  --collection-ids=users \
  --project=garuda-hacks-6-0
```