# Environment

We have 3 different environments:
- production : uses `.env` + `.env/garuda-hacks-6-0` with command `firebase use default`
- development: uses `.env` + `.env/garuda-hacks-development` with command `firebase use staging`
- local: uses `.env` + `.env.local` with command `firebase use staging` which will override the staging env

# Deployment

Deployment must be done through terminal using the firebase cli. As of 7.0, there is no a github action or automated script to do this. This means, you need to correctly use the environment so that you may not accidentally push not tested feature live into production, especially during the app is started to get active.


To deploy staging to staging environment:

`firebase deploy --only functions --project staging`

Production:

`firebase deploy --only functions --project default`

## Prefilled Data

You have to fill in some data in order for portal to work:
1. config: Contains important related configuration, such as open-close date for registration, mentoring, etc. This value must be updated in database. Keep `applicationsOpen` to false in production to prevent user to be able to do a registration outside of the desired timeline
2. questions: Contains the questions list for the application. Be aware that the questions are present in database for **validation** purpose in the backend-level. In the frontend, there is also `questions.ts` that functions as a static fetch question for fast rendering. Although initial design was to make the questions dynamic from database, it might not be preferred for performance purposes.