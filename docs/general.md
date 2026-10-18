# General Docs

This application is used for many of Garuda Hacks' applications, mainly portal and the mobile app. The main purpose is to combine all complex logic into a separate app for easier development and reusability across all apps.

By the time this document is written, this app serves some of these features:
1. `Authentication`: support `email password`, `google`, and `discord`.
2. `Apllication`: support endpoints for be used for application.
3. `Mentorship`: book and manage endpoints for `hackers` and `mentors`.
4. `Match`: for online speed dating feature for the mobile app.
5. `User`: for user's related data like manage account, or later in d-day such as the boarding pass and find-my table.

There might be additional readings you can find in the same folder as this docs. Please refer to them.

## Data Migration

User's data are stored in the very top level of the Firestore document. User's data from 6.0 were moved into subcollection within itself, so you may encounter a collection field `6.0` in some users.

It is recommended to do the same to `7.0` data. This way, future data will not be confused of the up to date data. Be mindful that the migration almost surely breaks the current user flow, so make sure to show a idle screen with no interactivity for user to update their application data. This might not applied to data such as first and last name, email, userId, and connected account as it will break user's flow.

The same case is applied for mobile app. Prevent user from logging in to mobile app if possible.

## Security

As a service provider, there is no exception to be a safe and secure application. As of `7.0`, there are some security layer implemented to the application. Common cases is to update package version regularly whenever possible.

For the backend application, this applies for authenticated and authorized access. The public endpoints we currently have are only the auth endpoints, while other endpoints are private and need to have role-based access determined, whether in the code or within `firestore.rules`. This also applied for firebase storage / object storage. Evaluate security regularly or as you maintain this app.

Another important consideration is to add logging and timestamp for every action that changes data. In `7.0` this practice is started to be implemented heavily compared to `6.0`. Such feature will save you as a part of organization to keep the acountability or audit in case something bad happened.

## Consent Screen

Google has consent screen which displays our app name. Currently it's named as `Garuda Hacks 7.0`. But you would want to change it to `8.0` when the main landing website is ready as it's required by Google to update it.

## Email

Many of our features require email. In 7.0 we use Amazon SES for emailing (register, application, reminder, certificate). As of 7.0, we use [Ryan's](heryan@garudahacks.com) account. Please contact him to move ownership if possible, or otherwise to unassign the domain. It is recommended to use Tech and Hack director's account. Moreover, most of the email were sent using html template defined in `functions/src/templates`. Please also change when as you need, including for the support email or updated info.