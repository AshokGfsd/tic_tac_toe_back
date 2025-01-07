const express = require("express");
const { Server } = require("socket.io");
const http = require("http");
const app = express(),
  server = http.createServer(app);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

class SocketManager {
  constructor(server, corsOptions) {
    this.io = new Server(server, { cors: corsOptions });
    this.rooms = {};
    this.socket_ids = {};
    this.initializeSocketEvents();
  }

  initializeSocketEvents() {
    this.io.on("connection", (socket) => {
      console.log("*************connected****************");
      socket.on("create", () => this.createRoom(socket));
      socket.on("join", (data) => this.join(socket, data));
      socket.on("play", (data) => this.click(socket, data));
      socket.on("send_audio", (audioStream) =>
        this.broadcastAudio(socket, audioStream)
      );
      socket.on("_disconnect", () => this.handleDisconnect(socket));
      socket.on("disconnect", () => this.handleDisconnect(socket));
      socket.on("send_message", (data) => this.sendMessage(socket, data));
    });
  }

  broadcastAudio(socket, audioStream) {
    const roomId = this.socket_ids[socket.id];
    if (!roomId) return socket.emit("error", "Join a room first!");

    // Broadcast the audio stream to other players in the room
    socket.to(roomId).emit("receive_audio", audioStream);
  }
  createRoom(socket) {
    const roomId = this.generateRoomID();
    this.rooms[roomId] = {
      players: {
        [socket.id]: "X",
      },
      curr_player: "X",
      avail_id: "O",
      data: Array(9).fill(null),
    };
    this.socket_ids[socket.id] = roomId;
    socket.join(roomId);
    socket.emit("create", roomId);
  }

  join(socket, roomId) {
    const room = this.rooms[roomId];
    if (!room) return socket.emit("error", "Room not found!");
    if (Object.keys(room.players).length >= 2)
      return socket.emit("error", "Room is full!");

    room.players[socket.id] = room.avail_id;
    room.avail_id = null;
    this.socket_ids[socket.id] = roomId;
    socket.join(roomId);
    socket.emit("join", { ...room, socket_id: socket.id });
    this.io.to(roomId).emit("_disconnect", "Player connected!");
  }

  click(socket, data) {
    const roomId = this.socket_ids[socket.id];
    if (!roomId) return socket.emit("error", "Join a room first!");
    const room = this.rooms[roomId];
    if (!room || !room.data) return socket.emit("error", "Invalid room!");
    if (room.avail_id !== null) {
      return socket.emit("error", "Please wait while player connect!");
    }
    if (room.data[data]) return socket.emit("error", "Cell already occupied!");
    if (room.curr_player !== room.players[socket.id])
      return socket.emit("error", "Wait for your turn!");

    room.data[data] = room.curr_player;
    const winner = this.checkWinner(room.data);
    if (winner) {
      this.io.to(roomId).emit("winner", {
        message: `Player ${room.curr_player} wins!`,
        pattern: winner,
      });
      room.data = Array(9).fill(null); // Reset game
    } else {
      room.curr_player = room.curr_player === "X" ? "O" : "X";
    }
    this.io.to(roomId).emit("play", room.data);
  }

  sendMessage(socket, data) {
    const roomId = this.socket_ids[socket.id];
    if (!roomId) return socket.emit("error", "Join a room first!");
    socket.to(roomId).emit("receive_message", data);
  }

  handleDisconnect(socket) {
    const roomId = this.socket_ids[socket.id];
    if (roomId) {
      const room = this.rooms[roomId];
      if (room) delete room.players[socket.id];
      if (!Object.keys(room?.players).length) delete this.rooms[roomId];
    }
    socket.leave(roomId);
    this.io.to(roomId).emit("_disconnect", "Player disconnected!");
  }

  generateRoomID() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  checkWinner(board) {
    const patterns = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];
    for (const pattern of patterns) {
      const [a, b, c] = pattern;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return pattern;
      }
    }
    return null;
  }
}

const corsOptions = { origin: "*" };
const socketManager = new SocketManager(server, corsOptions);

server.listen(4445, () => console.log("Listening on port 4445"));

