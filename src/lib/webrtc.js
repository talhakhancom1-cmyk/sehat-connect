/**
 * WebRTC peer connection wrapper for 1:1 audio/video calls.
 *
 * This class handles the media layer only — it does NOT do signaling.
 * The caller wires up `src/lib/callSocket.js` for signaling and feeds
 * offer/answer/ICE candidates into this class via its methods.
 *
 * Flow (caller side):
 *   const call = new WebRTCCall({ iceServers, video: false });
 *   await call.start({ video: false });            // getUserMedia
 *   const offer = await call.createOffer();         // create SDP offer
 *   // send `offer` to the peer via the signaling socket
 *   // on receiving the peer's answer:
 *   await call.setRemoteAnswer(answerSdp);
 *   // on receiving remote ICE candidates:
 *   await call.addIceCandidate(candidate);
 *   // on hangup:
 *   call.close();
 *
 * Flow (callee side):
 *   const call = new WebRTCCall({ iceServers, video: false });
 *   await call.start({ video: false });
 *   // on receiving the caller's offer:
 *   await call.setRemoteOffer(offerSdp);
 *   const answer = await call.createAnswer();       // create SDP answer
 *   // send `answer` to the caller via the signaling socket
 *   // on receiving remote ICE candidates:
 *   await call.addIceCandidate(candidate);
 */
export class WebRTCCall {
  constructor({ iceServers = [], video = false, onRemoteStream, onIceCandidate, onStateChange, onError } = {}) {
    this.iceServers = iceServers;
    this.video = video;
    this.onRemoteStream = onRemoteStream;
    this.onIceCandidate = onIceCandidate;
    this.onStateChange = onStateChange;
    this.onError = onError;

    this.pc = null;          // RTCPeerConnection
    this.localStream = null; // MediaStream
    this.remoteStream = null;
    this._closed = false;
  }

  /** Acquire local media (mic + optional camera) and create the peer connection. */
  async start({ video: videoOverride } = {}) {
    const wantVideo = videoOverride !== undefined ? videoOverride : this.video;
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: wantVideo,
    });

    this.pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceTransportPolicy: 'all',
    });

    // Add local tracks to the connection
    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
    }

    // Route incoming remote tracks to a MediaStream the UI can render.
    this.remoteStream = new MediaStream();
    this.pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((t) => this.remoteStream.addTrack(t));
      // Also handle single-track events (some browsers don't set event.streams)
      if (!event.streams[0]) this.remoteStream.addTrack(event.track);
      this.onRemoteStream?.(this.remoteStream);
    };

    // Forward ICE candidates to the signaling layer.
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.onIceCandidate?.(event.candidate);
      }
    };

    // Connection state changes for UI feedback + reconnection handling.
    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc.iceConnectionState;
      this.onStateChange?.({ ice: state });
      if (state === 'failed') {
        // Attempt ICE restart once before giving up.
        try { this.pc.restartIce(); } catch { /* ignore */ }
      }
    };
    this.pc.onconnectionstatechange = () => {
      this.onStateChange?.({ connection: this.pc.connectionState });
    };

    return this.localStream;
  }

  /** Caller creates the offer. Returns the SDP offer object. */
  async createOffer() {
    if (!this.pc) throw new Error('Peer connection not started');
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: this.video,
      iceRestart: false,
    });
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  /** Callee receives the offer and prepares an answer. */
  async setRemoteOffer(offerSdp) {
    if (!this.pc) throw new Error('Peer connection not started');
    await this.pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
  }

  /** Callee creates the answer after accepting the offer. Returns SDP answer. */
  async createAnswer() {
    if (!this.pc) throw new Error('Peer connection not started');
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  /** Caller receives the callee's answer. */
  async setRemoteAnswer(answerSdp) {
    if (!this.pc) throw new Error('Peer connection not started');
    await this.pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
  }

  /** Either side receives a remote ICE candidate from signaling. */
  async addIceCandidate(candidate) {
    if (!this.pc) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      // Silently ignore late candidates after close — they're harmless.
      if (!this._closed) this.onError?.(e);
    }
  }

  /** Toggle the microphone mute state. Returns the new muted state. */
  toggleMute() {
    if (!this.localStream) return false;
    let muted = false;
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !track.enabled;
      muted = !track.enabled;
    }
    return muted;
  }

  /** Toggle the camera on/off (video calls only). Returns the new enabled state. */
  toggleCamera() {
    if (!this.localStream) return false;
    let enabled = true;
    for (const track of this.localStream.getVideoTracks()) {
      track.enabled = !track.enabled;
      enabled = track.enabled;
    }
    return enabled;
  }

  /** Tear down the call — stops all tracks and closes the peer connection. */
  close() {
    this._closed = true;
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        try { track.stop(); } catch { /* ignore */ }
      }
      this.localStream = null;
    }
    if (this.pc) {
      try { this.pc.close(); } catch { /* ignore */ }
      this.pc = null;
    }
    this.remoteStream = null;
  }
}

/** Fetches the ICE server config (STUN + TURN credentials) from the backend. */
export async function fetchIceServers() {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
  const token = localStorage.getItem('ehc_token');
  const res = await fetch(`${API_BASE_URL}/calls/ice-servers`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    // Fall back to a STUN-only config so calls still work on easy networks.
    return [{ urls: ['stun:stun.l.google.com:19302'] }];
  }
  const data = await res.json();
  return data.iceServers || [{ urls: ['stun:stun.l.google.com:19302'] }];
}
