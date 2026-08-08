# FileShare

A fast, private, and ultra-minimal peer-to-peer file-sharing application built for the web.

FileShare enables direct, high-speed browser-to-browser data transfers without relying on any intermediary cloud storage. It uses WebRTC for the data tunnel and a lightweight Node.js signaling server to establish the initial connection.

## Features

- **True Peer-to-Peer:** Files are transferred directly between devices using WebRTC Data Channels. Your data never touches a cloud server.
- **Deterministic Peer Matching:** Secure, manual room-code-based discovery logic ensures you only connect with your intended peer.
- **Ultra-Minimal UI:** A streamlined React frontend focused entirely on the core file transfer experience.
- **High-Speed Transfers:** Optimized chunking and buffer management (SCTP) designed to maximize local network and internet bandwidth.
- **Cross-Platform:** Works natively in modern web browsers (Chrome, Firefox, Safari, Edge) without any app installation required.

## Tech Stack

- **Frontend:** React, Vite, CSS (Glassmorphism design)
- **Backend (Signaling):** Node.js, Express, Socket.io
- **Networking:** WebRTC (RTCPeerConnection, RTCDataChannel), STUN/TURN integration for NAT traversal

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- npm or yarn

### Installation

1. Clone the repository and navigate into the project directory.
2. Install the dependencies:
   ```bash
   npm install
   ```

### Running Locally

You can run both the signaling server and the React frontend concurrently using the provided development scripts.

```bash
# Start both the client and server concurrently
npm run dev

# Or run them separately:
npm run dev:server
npm run dev:client
```

Once running, open your browser and navigate to `http://localhost:5173`. 

### Usage

1. **Host:** Open the app and copy your randomly generated Room Code.
2. **Peer:** On a different device (or a different browser tab), enter the Room Code to join.
3. **Transfer:** Once connected, the host or the peer can select a file. The receiver will be prompted to accept or reject the incoming file.
4. **Download:** Upon completion, the file is instantly available for download.
