# Garuda Hacks Backend 🚀

The official backend service for Garuda Hacks 6.0, providing robust and scalable APIs for the hackathon platform. Built with Firebase Cloud Functions and TypeScript to ensure reliability and maintainability.

## 🛠️ Tech Stack

- **Backend**

  - Firebase Cloud Functions
  - TypeScript
  - Node.js
  - Express.js
  - Firebase Admin SDK

- **Database**

  - Firebase Firestore

- **Authentication**

  - Firebase Authentication

- **Deployment**
  - Firebase Hosting
  - Firebase Cloud Functions

## 🚀 Getting Started

### Prerequisites

- Node.js (v20 or higher)
- npm or yarn
- Firebase CLI (`npm install -g firebase-tools`)
- Firebase account

### Installation

1. Clone the repository

```bash
git clone https://github.com/your-username/web-be.git
cd web-be
```

2. Install dependencies

```bash
npm install
```

3. Set up environment variables

```bash
cp .env.example .env
```

Fill in your Firebase configuration in `.env`:

```bash
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email

# Other Configuration
NODE_ENV=development
```

4. Start development server

```bash
npm run serve
```

### Building for Production

```bash
npm run build
```

## 📁 Project Structure

```
web-be/
├── src/
│   ├── functions/    # Cloud Functions
│   │   ├── auth/     # Authentication related functions
│   │   ├── users/    # User management functions
│   │   └── utils/    # Utility functions
│   ├── config/       # Configuration files
│   ├── types/        # TypeScript type definitions
│   └── utils/        # Helper functions
├── tests/            # Test files
└── firebase.json     # Firebase configuration
```

## 🔧 Configuration

### Environment Variables

Required environment variables:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`
- `NODE_ENV`

## Matchmaking Caveats and Development Notes

1. Match cards are intentionally minimal (`firstName`, `lastName`, `school`) because the current user profile does not include richer dating fields or photo support.
2. Discord handle exposure for matched hackers is deferred; hacker documents do not currently store `discordUsername`.
3. Only the second swiper sees an immediate match response. The first swiper sees new matches on the next `GET /match/matches` fetch because notifications are deferred.
4. Eligibility is snapshotted by opt-in (`matchEnabled`). If a user's RSVP status changes later, they remain in the matchmaking pool by design.
5. Opt-in is irreversible for this MVP. There is no opt-out, undo swipe, or unmatch flow.
6. Deck generation reads all opted-in users plus the caller's prior swipes. This is acceptable for the expected ~500 participant scale.
7. Reporting is frontend-only for now (mailto to organizers). There is no backend reports collection in this phase.
8. Incoming likes are intentionally deferred, but the schema is designed to support it later via `swipes` queries on `targetId` and `direction`.
9. There is no automated test suite in this repository. Validate behavior with Firebase emulators (`cd functions && npm run serve`).
10. `config/matchConfig` is a required runtime document. In local development it can be seeded by `FakeDataPopulator`; production/staging must create and maintain it manually.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Make your changes following our commit conventions:

   ```bash
   # Format
   <type>(<scope>): <description>

   # Examples
   feat(auth): add user authentication middleware
   fix(api): resolve CORS configuration
   docs(readme): update deployment steps
   style(code): improve error handling
   refactor(functions): optimize database queries
   test(auth): add authentication tests
   chore(deps): update dependencies
   ```

   Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
   Scope: optional, indicates the module affected

4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Firebase](https://firebase.google.com/)
- [TypeScript](https://www.typescriptlang.org/)
- [Node.js](https://nodejs.org/)
- [Express.js](https://expressjs.com/)

---

Made with ❤️ by the Garuda Hacks Team
