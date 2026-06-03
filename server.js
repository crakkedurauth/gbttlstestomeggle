const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let waiting = null;

io.on("connection", (socket) => {

  socket.on("find", () => {
    if (waiting && waiting.id !== socket.id) {
      socket.partner = waiting;
      waiting.partner = socket;

      socket.emit("matched", { initiator: true });
      waiting.emit("matched", { initiator: false });

      waiting = null;
    } else {
      waiting = socket;
    }
  });

  socket.on("signal", (data) => {
    if (socket.partner) {
      socket.partner.emit("signal", data);
    }
  });

  socket.on("next", () => {
    if (socket.partner) {
      socket.partner.partner = null;
      socket.partner.emit("disconnectPeer");
    }
    socket.partner = null;
  });

  // FIX #3: clean up waiting slot and notify partner on disconnect
  socket.on("disconnect", () => {
    if (waiting === socket) {
      waiting = null;
    }
    if (socket.partner) {
      socket.partner.partner = null;
      socket.partner.emit("disconnectPeer");
    }
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`running on http://localhost:${PORT}`);
});