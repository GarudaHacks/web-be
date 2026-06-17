# Environment

We have 3 different environments:
- production : uses `.env` + `.env/garuda-hacks-6-0` with command `firebase use default`
- development: uses `.env` + `.env/garuda-hacks-development` with command `firebase use staging`
- local: uses `.env` + `.env.local` with command `firebase use staging` which will override the staging env

# Deployment

To deploy staging to staging environment:

`firebase deploy --only functions --project staging`

Production:

`firebase deploy --only functions --project default`

## Prefilled Data

You have to fill in some data:
1. config
2. questions