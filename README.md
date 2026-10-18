# Garuda Hacks Backend 🚀

The official backend service for Garuda Hacks 6.0-7.0.

## High-level Workflow

The main working directory of the backend will be in `functions`. While the outer part is mostly for firebase-related configs.

Most docs are written in `docs` subfolder. Some of it might not be really detailed, but it should give you the overall documentations of the app.

Majority of development were done within MacOS. Adjust accordingly if you find problem for OS incompability during development.

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

- **Storage**
  - Firebase Storage

## 🚀 Getting Started

### Installation

1. Clone the repository

```bash
git clone https://github.com/your-username/web-be.git
cd web-be
cd functions
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

Refer to `.env.example` for all environments used within the project. Search for any usage from your code editor if you are not sure what it is used for.

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
