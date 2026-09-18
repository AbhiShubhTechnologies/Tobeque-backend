/**
 * config/firebase.js
 * ─────────────────────────────────────────────────────────────
 * Initializes the Firebase Admin SDK using a service account.
 *
 * SETUP STEPS (once you have the credentials):
 * 1. Go to: Firebase Console → Project Settings → Service Accounts
 * 2. Click "Generate new private key" → download the JSON file
 * 3. Rename the file to: firebase-service-account.json
 * 4. Place it in: backend/config/firebase-service-account.json
 * 5. Add to .env:
 *       FIREBASE_PROJECT_ID=your_project_id
 *       FIREBASE_SERVICE_ACCOUNT_PATH=./config/firebase-service-account.json
 *
 * ⚠️  NEVER commit firebase-service-account.json to Git.
 *     It is already listed in .gitignore via this implementation.
 * ─────────────────────────────────────────────────────────────
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let firebaseApp = null;
let messaging = null;

/**
 * Initializes Firebase Admin SDK (idempotent — safe to call multiple times).
 * Call this once during server startup.
 */
const initializeFirebase = () => {
  // Already initialized
  if (admin.apps.length > 0) {
    firebaseApp = admin.apps[0];
    messaging = admin.messaging(firebaseApp);
    return;
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    ? path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
    : path.join(__dirname, 'firebase-service-account.json');

  if (!fs.existsSync(serviceAccountPath)) {
    console.warn(
      `\n⚠️  [Firebase] Service account file not found at: ${serviceAccountPath}`
    );
    console.warn(
      '   Push notifications will NOT work until you add the service account JSON.'
    );
    console.warn(
      '   See backend/config/firebase.js for setup instructions.\n'
    );
    return;
  }

  try {
    const serviceAccount = JSON.parse(
      fs.readFileSync(serviceAccountPath, 'utf8')
    );

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
    });

    messaging = admin.messaging(firebaseApp);
    console.log(
      `[Firebase] Admin SDK initialized successfully for project: ${serviceAccount.project_id}`
    );
  } catch (err) {
    console.error('[Firebase] Failed to initialize Admin SDK:', err.message);
  }
};

/**
 * Returns the Firebase Messaging instance.
 * Returns null if Firebase is not configured yet.
 */
const getMessaging = () => messaging;

/**
 * Returns true if Firebase Admin SDK is properly initialized.
 */
const isFirebaseReady = () => !!messaging;

module.exports = { initializeFirebase, getMessaging, isFirebaseReady };
