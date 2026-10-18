# Authentication

Our authentication is using firebase session cookie and session refresh token. All is managed by firebase auth itself. Refer to `src/controllers/auth_controller.ts` for various auth implementation.

By high level, we support:
- Email and Password: `register`, `login`, and `requestPasswordReset`, and `verifyAccount` for email.
- Google: automatically register user if it's not present in DB, otherwise create new one.
- Discord: basically use the email and password login with uid `discord:<uid>` and use Discord OAuth2 to issue a valid session.

## Role Custom Claim

Mostly there are 4 distinct roles that each needs a different auth treatment or displaying the frontend. Although the implementation are not really uniform, but we implement it by using custom claim. Those are:
1. User role: newly created by default will have claim `role: User`
2. Mentor role: will have claim `role: mentor` and `mentor: true`
3. Usher role: will have claim `role: usher`. Usher is volunteer outside of GH whose role is solely to do hackers registration check-in.
4. Admin role: Commonly does not have any custom claim, but depends on the email `*@garudahacks.com`. It's not actually used in anything within this backend app.

## Discord Auth

Discord auth is tricky because firebase does not support it natively. That's why we use email/password implementation. To distinct it with real user who uses email/password, we set the uid with `discord:<uid>` where `uid` is just random generated uid. This also affect the doc id for that user in `users` collection.

By the time this docs is written, this is known to be buggy or seemed not reliable yet, because many edge case applies to this, especially related if user's want to connect with Discord that had already been used or connected to our app.

## Notes

For more details, it's better to read the codebase itself in `auth_controller.ts`.