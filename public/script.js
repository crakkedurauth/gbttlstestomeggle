const socket = io();

let localStream = null;
let peer = null;
let initiator = false;

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

/* =========================
   SCREEN SYSTEM
========================= */

function switchScreen(from, to) {
  document.getElementById(from).classList.remove("active");
  document.getElementById(to).classList.add("active");
}

/* =========================
   AGE GATE
========================= */

function enterApp() {
  // FIX #1: start camera immediately so it's ready before matching
  startCamera().then(() => {
    switchScreen("ageGate", "lobby");
  }).catch((err) => {
    alert("Camera/mic access is required. Please allow permissions and refresh.");
    console.error(err);
  });
}

function deny() {
  alert("Access denied.");
}

/* =========================
   LOBBY
========================= */

function findUser() {
  switchScreen("lobby", "search");
  socket.emit("find");
}

function cancelSearch() {
  socket.emit("next"); // remove from waiting queue
  switchScreen("search", "lobby");
}

/* =========================
   CHAT CONTROLS
========================= */

function nextUser() {
  closePeer();
  remoteVideo.srcObject = null;
  switchScreen("chat", "search");
  socket.emit("next");
  setTimeout(() => socket.emit("find"), 500);
}

function disconnect() {
  closePeer();
  remoteVideo.srcObject = null;
  socket.emit("next");
  switchScreen("chat", "lobby");
}

/* =========================
   CAMERA
========================= */

async function startCamera() {
  if (localStream) return; // already running
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });
  localVideo.srcObject = localStream;
}

/* =========================
   PEER CONNECTION
========================= */

function createPeer() {
  peer = new RTCPeerConnection(config);

  // attach local tracks — localStream is guaranteed ready here
  localStream.getTracks().forEach(track => {
    peer.addTrack(track, localStream);
  });

  peer.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", { candidate: event.candidate });
    }
  };

  peer.onconnectionstatechange = () => {
    if (peer && (peer.connectionState === "failed" || peer.connectionState === "disconnected")) {
      closePeer();
      remoteVideo.srcObject = null;
      switchScreen("chat", "search");
      setTimeout(() => socket.emit("find"), 500);
    }
  };
}

function closePeer() {
  if (peer) {
    peer.close();
    peer = null;
  }
}

/* =========================
   SOCKET MATCHMAKING
========================= */

socket.on("matched", async ({ initiator: isInit }) => {
  initiator = isInit;

  closePeer(); // clean up any previous peer
  switchScreen("search", "chat");

  // FIX #1: camera is already running — just create the peer
  createPeer();

  if (initiator) {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit("signal", { offer });
  }
});

// FIX #2: handle partner clicking Next / disconnecting
socket.on("disconnectPeer", () => {
  closePeer();
  remoteVideo.srcObject = null;
  // put them back in search automatically
  switchScreen("chat", "search");
  setTimeout(() => socket.emit("find"), 500);
});

/* =========================
   SIGNALING
========================= */

socket.on("signal", async (data) => {
  if (!peer) return;

  if (data.offer) {
    await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit("signal", { answer });
  }

  if (data.answer) {
    await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  if (data.candidate) {
    try {
      await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) {
      console.warn("ICE candidate error:", e);
    }
  }
});