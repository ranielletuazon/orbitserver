const admin = require("firebase-admin");

const serviceAccountJson = Buffer.from(process.env.FIREBASE_ADMINSDK, "base64").toString("utf8");
const serviceAccount = JSON.parse(serviceAccountJson);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://orbit-5c69d-default-rtdb.asia-southeast1.firebasedatabase.app",
});

const db = admin.firestore();
module.exports = { db, admin };
