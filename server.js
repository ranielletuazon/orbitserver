import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { Server } from "socket.io";
import http from "http";
import queueRoutes from "./routes/queueRoutes.js";
import { removeUserFromQueue, handleUserDisconnect } from "./controllers/queueController.js";
import { db } from "./firebaseConfig.js";

const app = express();
const server = http.createServer(app);
export const io = new Server(server, { cors: { origin: "*" } });

const port = 5000;

app.use(bodyParser.json());
app.use(cors());
app.use("/", queueRoutes);

// Track users in rooms
const rooms = new Map();

io.on("connection", (socket) => {
  console.log("User connected: ", socket.id);

  socket.on("joinQueue", async (userId) => {
    socket.userId = userId;
    socket.join(userId);

    try {
      const userDoc = await db.collection("user").doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        console.log(`User on queue: ${userData.username} (${userId})`);
      }
    } catch (error) {
      console.error("Error fetching username:", error);
    }
  });

  socket.on("leaveQueue", (userId) => {
    removeUserFromQueue(userId);
    socket.leave(userId); 
  });

  // WebRTC Signaling
  socket.on("joinRoom", ({ roomId, userId }) => {
    socket.userId = userId;
    socket.roomId = roomId;
    socket.join(roomId);
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    
    rooms.get(roomId).add(userId);
    console.log(`User ${userId} joined room ${roomId}`);
    
    // Notify all users in the room about the new user
    io.to(roomId).emit("userJoined", { userId, roomId });
  });
  
  socket.on("leaveRoom", ({ roomId, userId }) => {
    if (roomId) {
      socket.leave(roomId);
      
      if (rooms.has(roomId)) {
        rooms.get(roomId).delete(userId);
        
        if (rooms.get(roomId).size === 0) {
          rooms.delete(roomId);
        }
      }
      
      console.log(`User ${userId} left room ${roomId}`);
      io.to(roomId).emit("userLeft", { userId, roomId });
    }
  });
  
  // WebRTC signaling - relaying offers, answers and ICE candidates
  socket.on("offer", ({ roomId, offer, userId, target }) => {
    console.log(`Relaying offer from ${userId} to ${target} in room ${roomId}`);
    io.to(roomId).emit("offer", { offer, userId, roomId });
  });
  
  socket.on("answer", ({ roomId, answer, userId, target }) => {
    console.log(`Relaying answer from ${userId} to ${target} in room ${roomId}`);
    io.to(roomId).emit("answer", { answer, userId, roomId });
  });
  
  socket.on("iceCandidate", ({ roomId, candidate, userId }) => {
    console.log(`Relaying ICE candidate from ${userId} in room ${roomId}`);
    io.to(roomId).emit("iceCandidate", { candidate, userId, roomId });
  });

  socket.on("disconnect", async () => {
    if (socket.userId) {
      console.log(`User disconnected: ${socket.userId}`);
      
      // Handle video call room cleanup
      if (socket.roomId) {
        if (rooms.has(socket.roomId)) {
          rooms.get(socket.roomId).delete(socket.userId);
          
          if (rooms.get(socket.roomId).size === 0) {
            rooms.delete(socket.roomId);
          }
        }
        
        io.to(socket.roomId).emit("userLeft", { userId: socket.userId, roomId: socket.roomId });
      }
      
      await handleUserDisconnect(socket.userId);
      socket.leave(socket.userId); 
    } else {
      console.log(`User disconnected: ${socket.id} (no userId found)`);
    }
  });
});

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});