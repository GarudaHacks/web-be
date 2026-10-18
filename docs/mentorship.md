# Mentorship

Mentorship is how we provide a way to connect hacker and mentors. Since portal is used for both role, this controller define many actions both as a hacker or mentor.

In general, the mentorship works by admin defining what available schdule the mentor has. Afterwards, hacker can book any of these defined schedule on a first-come first-server basis. Hacker can book up to 30 minutes before the session starts and 45 minutes for the cancelation.

A slot is defined under `mentorships` collection, where it has `mentorId` to define which mentor this doc belongs to. A `booked` mentorship slot is when `hackerId` is present and `isBooked` is `true`.

When hacker book a slot, mentor will receive email for booking. Beside that, we also support 2 modes which are online and offline mentor. The main difference is offline mentor will have `offlineLocation` which describes where hacker wants to meet the mentor in-person. Otherwise for online, a Google Meet link will be created, but you need to define the `GOOGLE_CALENDAR*` related env as define in `.example.env` file.

## Future Development Notes

By the time this docs is written, the default time slot is 15 minutes per slot. Some mentors gave feedback that it might be too short for a session. It might be best to increase the default number such as to 20 or 30 minutes.

The feedback is also to give mentor the hacker's discord username. This way, communication is not only hacker contact mentor first, but vice-versa as in condition like cancelation might apply, or inconsistent meetup location.