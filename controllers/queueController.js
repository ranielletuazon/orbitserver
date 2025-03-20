import { io } from "../server.js";
import { db } from "../firebaseConfig.js"; 

let userQueue = []; // Store users waiting for a match

// Get queue (for debugging)
export const getQueue = (req, res) => {
  res.json(userQueue);
};

export const handleUserDisconnect = async (userId) => {
  userQueue = userQueue.filter((user) => user.userId !== userId);
  console.log(`User ${userId} removed from queue. Current Queue:`, userQueue);
  io.emit("queueUpdated", userQueue);

  try {
    const roomsRef = db.collection("userRooms");
    const roomsSnapshot = await roomsRef.get();

    for (const doc of roomsSnapshot.docs) {
      const roomData = doc.data();
      if (roomData.members.includes(userId)) {
        // Remove user from room
        const updatedMembers = roomData.members.filter((member) => member !== userId);

        if (updatedMembers.length === 0) {
          // If no members left, delete the room
          await roomsRef.doc(doc.id).delete();
          console.log(`Room ${doc.id} deleted (No members left)`);
        } else {
          // Otherwise, update the room without the user
          await roomsRef.doc(doc.id).update({ members: updatedMembers });
          console.log(`User ${userId} removed from room ${doc.id}`);
        }
      }
    }
  } catch (error) {
    console.error("Error updating rooms:", error);
  }
};

// Add user to queue and check for match
export const joinQueue = (req, res) => {
  const { userId, game } = req.body;

  if (!userId || !game) {
    return res.status(400).json({ error: "Missing userId or gameId" });
  }

  const userExists = userQueue.some((user) => user.userId === userId);
  if (userExists) {
    return res.status(400).json({ error: "User is already in the queue" });
  }

  // Add user to queue
  userQueue.push({ userId, game });
  console.log(`User ${userId} added to queue for game ${game}`);
  console.log("Updated Queue:", userQueue);

  // Check for a match
  checkForMatch();

  res.json({ message: "User added to queue", queue: userQueue });
};

// Match two users with the same game
const checkForMatch = async () => {
  const gameGroups = {};

  // Group users by game
  userQueue.forEach((user) => {
    if (!gameGroups[user.game]) {
      gameGroups[user.game] = [];
    }
    gameGroups[user.game].push(user);
  });

  // Try to match two players for each game
  for (const game of Object.keys(gameGroups)) {
    const users = gameGroups[game];

    while (users.length >= 2) {
      const user1 = users.shift();
      const user2 = users.shift();

      const roomID = user1.userId < user2.userId ? `${user1.userId}_${user2.userId}` : `${user2.userId}_${user1.userId}`;
      console.log(`Matched users in room: ${roomID}`);
      console.log("Users:", user1, user2);

      // Remove matched users from queue
      userQueue = userQueue.filter((u) => u.userId !== user1.userId && u.userId !== user2.userId);

      console.log("Updated Queue:", userQueue);

      try {
        // Check if room already exists
        const roomDoc = await db.collection("userRooms").doc(roomID).get();
        
        if (!roomDoc.exists) {
          // Create the room document if it doesn't exist
          await db.collection("userRooms").doc(roomID).set({
            members: [user1.userId, user2.userId],
            createdAt: new Date(),
            messages: [],
            game: game
          });
          console.log(`Room ${roomID} created in Firestore`);
        } else {
          // Update the existing room if needed
          await db.collection("userRooms").doc(roomID).update({
            members: [user1.userId, user2.userId],
            updatedAt: new Date(),
            game: game
          });
          console.log(`Room ${roomID} updated in Firestore`);
        }

        // Verify the room was created successfully
        const verifyRoom = await db.collection("userRooms").doc(roomID).get();
        if (verifyRoom.exists) {
          // Only emit matchFound if room creation was successful
          console.log("Room verified, emitting matchFound events");
          io.to(user1.userId).emit("matchFound", { roomID, opponent: user2.userId });
          io.to(user2.userId).emit("matchFound", { roomID, opponent: user1.userId });
        } else {
          console.error("Room creation failed, not emitting matchFound events");
          // Put users back in queue if room creation failed
          userQueue.push(user1, user2);
        }
      } catch (error) {
        console.error("Error creating/updating room in Firestore:", error);
        // Put users back in queue if there was an error
        userQueue.push(user1, user2);
      }
    }
  }
};

// Remove user from queue
export const leaveQueue = async (req, res) => {
  const { userId } = req.body;
  await handleUserDisconnect(userId);
  res.json({ message: "User removed from queue", queue: userQueue });
};

// Remove user from queue when disconnected
export const removeUserFromQueue = (userId) => {
  const userIndex = userQueue.findIndex((user) => user.userId === userId);
  
  if (userIndex !== -1) {
    userQueue.splice(userIndex, 1);
    console.log(`User ${userId} removed from queue. Current Queue:`, userQueue);
    io.emit("queueUpdated", userQueue);
  } else {
    console.log(`User ${userId} was not in queue.`);
  }
};