### Overview

An Express API for the Garudahacks admin and portal apps deployed as a Cloud function.

### Setup

1. To access the firebase project, you will need the service account key (which can be found in the Notion under env). Download as JSON and place in the root path.
2. To test your function, run `firebase emulators:start`.
3. To deploy the function, run `firebase deploy --only functions`.
