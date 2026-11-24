const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 25 * 1024 * 1024,
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Serverul de semnalizare WebRTC este activ.");
});

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, role }) => {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = role;

    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    const existingIds = roomSockets
      ? Array.from(roomSockets).filter((id) => id !== socket.id)
      : [];

    socket.emit("existing-peers", { ids: existingIds });
    socket.to(roomId).emit("peer-joined", { id: socket.id, role });
  });

  socket.on("captured-photo", ({ roomId, type, image }) => {
    socket.to(roomId).emit("captured-photo", { type, image });
  });

  socket.on("recorded-video", ({ roomId, videoDataUrl }) => {
    socket.to(roomId).emit("recorded-video", { videoDataUrl });
  });

  socket.on("webrtc-offer", ({ to, offer }) => {
    io.to(to).emit("webrtc-offer", { from: socket.id, offer });
  });

  socket.on("webrtc-answer", ({ to, answer }) => {
    io.to(to).emit("webrtc-answer", { from: socket.id, answer });
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("ice-candidate", { from: socket.id, candidate });
  });

  socket.on("disconnect", () => {
    const { roomId } = socket.data;
    if (roomId) {
      socket.to(roomId).emit("peer-left", { id: socket.id });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Serverul ruleaza pe portul ${PORT}`);
});
