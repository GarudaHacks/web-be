# Application

We uses our own in-house developed application flow. We implement this using `patch` where we don't care any of the question given, as long as it matches some `APPLICATION_STATE` then we will update it.

`APPLICATION_STATE` is the stage where we want to display each question. For example, first name and last name will be on `PROFILE` while emergency contact will be on `EMERGENCY_AND_CONSENT` state.

With this mechanism, we can actually implement a "saved progress" feature where we fetch from DB our latest feature. Although it's possible, by the time this docs written, our frontend implement the "saved progress" by using browser local storage.

In the end of the state, frontend will also call submit where it will change the `status`. `status` itself is used as the source of truth defining current user' status within the application process.

## Status Flow

`status` have these states:

```
not applicable/draft
        |
        |
        v
    submitted
        |
        |
        v
accepted/rejected
        |
        |
        v
confirmed rsvp/canceled
```

`not applicable` and `draft` implementation is a bit unverified as it was used or developed since 6.0.