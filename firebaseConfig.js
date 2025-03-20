require("dotenv").config();

const admin = require("firebase-admin");
const serviceAccount = require("./orbit-5c69d-firebase-adminsdk-imdm8-f72fdfdbcc.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://orbit-5c69d-default-rtdb.asia-southeast1.firebasedatabase.app",
});

const db = admin.firestore();
module.exports = { db, admin };
