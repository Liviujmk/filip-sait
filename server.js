const SIGNALING_SERVER_URL = "https://filip-sait.onrender.com";

const socket = io(SIGNALING_SERVER_URL, {
  transports: ["websocket", "polling"]
});

const roomInput = document.getElementById("roomInput");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const shareBtn = document.getElementById("shareBtn");
const viewBtn = document.getElementById("viewBtn");
const statusEl = document.getElementById("status");
const videoEl = document.getElementById("remoteVideo");

const urlParams = new URLSearchParams(window.location.search);
const initialRoom = urlParams.get("room") || "cam-" + Math.random().toString(36).substring(2, 7);
roomInput.value = initialRoom;

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

let localStream = null;
const peers = new Map();
let currentRole = null;

function setStatus(msg, color = "#2563eb") {
  statusEl.textContent = msg;
  statusEl.style.borderLeftColor = color;
}

socket.on("connect", () => {
  setStatus("Conectat la server. Alege rolul sau trimite linkul.", "#16a34a");
});

socket.on("connect_error", () => {
  setStatus("Eroare la conectarea cu serverul de semnalizare. Verifică URL-ul serverului.", "#dc2626");
});

copyLinkBtn.addEventListener("click", async () => {
  const room = roomInput.value.trim();
  if (!room) return;
  const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room)}`;
  try {
    await navigator.clipboard.writeText(inviteUrl);
    setStatus("Link copiat! Trimite-l prietenului: " + inviteUrl, "#16a34a");
  } catch {
    prompt("Copiază acest link:", inviteUrl);
  }
});

function createPeerConnection(remoteId) {
  const pc = new RTCPeerConnection(rtcConfig);
  peers.set(remoteId, pc);

  if (localStream) {
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  }

  pc.ontrack = (event) => {
    videoEl.srcObject = event.streams[0];
    setStatus("Primești imaginea live!", "#16a34a");
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", { to: remoteId, candidate: event.candidate });
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
      setStatus("Conexiunea video s-a întrerupt.", "#dc2626");
    }
  };

  return pc;
}

shareBtn.addEventListener("click", async () => {
  const roomId = roomInput.value.trim();
  if (!roomId) return alert("Introdu un cod de cameră.");

  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    setStatus("Browserul nu suportă partajarea ecranului (necesită Safari iOS 15+ pe HTTPS).", "#dc2626");
    return;
  }

  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 60 } },
      audio: false
    });

    currentRole = "sharer";
    socket.emit("join-room", { roomId, role: "sharer" });
    setStatus("Partajezi ecranul în camera: " + roomId, "#16a34a");

    localStream.getVideoTracks()[0].addEventListener("ended", () => {
      setStatus("Ai oprit partajarea ecranului.", "#eab308");
      peers.forEach((pc) => pc.close());
      peers.clear();
    });
  } catch (err) {
    setStatus("Partajare anulată sau blocată: " + err.message, "#dc2626");
  }
});

viewBtn.addEventListener("click", () => {
  const roomId = roomInput.value.trim();
  if (!roomId) return alert("Introdu un cod de cameră.");

  currentRole = "viewer";
  socket.emit("join-room", { roomId, role: "viewer" });
  setStatus("Aștepți ca prietenul să pornească partajarea în camera: " + roomId, "#2563eb");
});

socket.on("peer-joined", async ({ id }) => {
  if (currentRole === "sharer" && localStream) {
    const pc = createPeerConnection(id);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("webrtc-offer", { to: id, offer });
  }
});

socket.on("webrtc-offer", async ({ from, offer }) => {
  const pc = createPeerConnection(from);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("webrtc-answer", { to: from, answer });
});

socket.on("webrtc-answer", async ({ from, answer }) => {
  const pc = peers.get(from);
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }
});

socket.on("ice-candidate", async ({ from, candidate }) => {
  const pc = peers.get(from);
  if (pc && candidate) {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }
});

socket.on("peer-left", ({ id }) => {
  const pc = peers.get(id);
  if (pc) {
    pc.close();
    peers.delete(id);
  }
  setStatus("Cealaltă persoană a părăsit camera.", "#eab308");
});
