/**
 * config/firebase.js
 * ─────────────────────────────────────────────────────────────
 * Initializes the Firebase Admin SDK.
 *
 * TWO WAYS TO PROVIDE CREDENTIALS (in priority order):
 *
 * ── Option A: Environment Variable (RECOMMENDED for production/Hostinger) ──
 *   Set FIREBASE_SERVICE_ACCOUNT_JSON in your Hostinger .env panel.
 *   Value = the entire content of firebase-service-account.json as one line.
 *
 *   Example .env entry:
 *   FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"tobeque-app",...}
 *
 * ── Option B: Local File (for local development only) ──
 *   Place the file at: backend/config/firebase-service-account.json
 *   This file is gitignored and never pushed to GitHub.
 *
 * ⚠️  NEVER commit firebase-service-account.json to Git.
 * ─────────────────────────────────────────────────────────────
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let firebaseApp = null;
let messaging = null;

/**
 * Loads the service account object from either:
 * 1. FIREBASE_SERVICE_ACCOUNT_JSON env var (production)
 * 2. Local file at FIREBASE_SERVICE_ACCOUNT_PATH (local dev)
 */
const loadServiceAccount = () => {
  // ── Priority 1: JSON string from environment variable ──────────────────────
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (e) {
      console.error('[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON env var:', e.message);
      return null;
    }
  }

  // ── Priority 2: Local file (development) ───────────────────────────────────
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    ? path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
    : path.join(__dirname, 'firebase-service-account.json');

  if (!fs.existsSync(serviceAccountPath)) {
    console.warn(`\n⚠️  [Firebase] No credentials found.`);
    console.warn(`   Set FIREBASE_SERVICE_ACCOUNT_JSON in your Hostinger environment variables.`);
    console.warn(`   Or place firebase-service-account.json at: ${serviceAccountPath}\n`);
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  } catch (e) {
    console.error('[Firebase] Failed to read service account file:', e.message);
    return null;
  }
};

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

  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    console.warn('[Firebase] Push notifications are DISABLED — no credentials provided.');
    return;
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
    });

    messaging = admin.messaging(firebaseApp);
    console.log(`[Firebase] ✅ Admin SDK initialized for project: ${serviceAccount.project_id}`);
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
