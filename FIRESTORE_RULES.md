# Firestore Security Rules (fix "Database not accessible" / "Missing or insufficient permissions")

This app uses **Cloud Firestore** (not Realtime Database). Ensure **Firestore** is enabled in Firebase Console → Build → Firestore Database.

## Why am I seeing this? (check the "Reason" in the red error box)

| Reason (code)        | Cause | What to do |
|----------------------|--------|------------|
| **permission-denied** | Firestore rules block read on `Call_logs`. | Add rules below and **Publish**. Ensure collection name is exactly `Call_logs`. |
| **not-found**         | Collection `Call_logs` doesn’t exist or Firestore isn’t set up. | Firebase Console → **Firestore Database** → create database if needed, then create collection `Call_logs` (or fix the name). |
| **failed-precondition** | Firestore not enabled for this project. | Firebase Console → **Build** → **Firestore Database** → **Create database** (choose region, then use Rules below). |
| **unavailable**      | Network or Firestore service issue. | Check internet; try again later. |
| **unknown** / other  | Other error. | Open browser **Console** (F12) and look for `[Firestore] Error fetching Call_logs` to see the full error. |

The app only fetches data when the user is **signed in** (Email/Password). If you see **permission-denied**, rules are the usual fix.

## Fix in Firebase Console

1. Open [Firebase Console](https://console.firebase.google.com) → your project.
2. Go to **Firestore Database** → **Rules** tab.
3. Use one of the rule sets below.

### Option A: Allow read only for signed-in users (recommended)

Include both **Call_logs** (Call Analytics) and **whatsapp_webhooks** (WhatsApp Campaign Analytics):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /Call_logs/{docId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    match /whatsapp_webhooks/{docId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

- **read**: any signed-in user can read all documents in `Call_logs`.
- **write**: no one can create/update/delete from the client (you can keep this if you write from backend only).

### Option B: Allow read/write for signed-in users (if your app will write)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /Call_logs/{docId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Option C: Temporary test (insecure – do not use in production)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /Call_logs/{docId} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

4. Click **Publish**.

## Checklist

- [ ] Collection name in rules is exactly **`Call_logs`** (case-sensitive).
- [ ] User is signed in (Email/Password) before the dashboard loads.
- [ ] Firebase Auth has **Email/Password** sign-in method enabled.
- [ ] After changing rules, wait a few seconds and refresh the app.

If the error persists, open the browser **Console** (F12 → Console) and check the full error message and stack trace.
