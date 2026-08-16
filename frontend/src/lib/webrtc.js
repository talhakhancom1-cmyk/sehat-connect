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
    this.currentFacingMode = 'user';  // tracked explicitly — getSettings().facingMode is unreliable on iOS
  }

  /** Acquire local media (mic + optional camera) and create the peer connection. */
  async start({ video: videoOverride } = {}) {
    const wantVideo = videoOverride !== undefined ? videoOverride : this.video;
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: wantVideo ? {
        width: { ideal: 1280, min: 320 },
        height: { ideal: 720, min: 240 },
        frameRate: { ideal: 30, min: 15 },
        facingMode: this.currentFacingMode,
      } : false,
    });

    this.pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceTransportPolicy: 'all',
    });

    // Add local tracks to the connection
    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
    }

    // Set bandwidth constraints for graceful degradation on weak connections.
    // Video: 512kbps max (enough for 720p at low FPS, degrades to lower res)
    // Audio: 64kbps (good quality for voice)
    try {
      const videoSender = this.pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (videoSender) {
        const params = videoSender.getParameters();
        if (!params.encodings) params.encodings = [{}];
        // Set max bitrate — browser will auto-degrade resolution/FPS to stay under this
        params.encodings[0].maxBitrate = 512000; // 512 kbps
        params.encodings[0].maxFramerate = 30;
        await videoSender.setParameters(params);
        console.log('[WebRTC:pc] video bitrate limited to 512kbps');
      }
      const audioSender = this.pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      if (audioSender) {
        const params = audioSender.getParameters();
        if (!params.encodings) params.encodings = [{}];
        params.encodings[0].maxBitrate = 64000; // 64 kbps
        await audioSender.setParameters(params);
        console.log('[WebRTC:pc] audio bitrate limited to 64kbps');
      }
    } catch (e) {
      console.warn('[WebRTC:pc] could not set bitrate constraints:', e.message);
    }

    // Route incoming remote tracks to a MediaStream the UI can render.
    this.remoteStream = new MediaStream();
    this.pc.ontrack = (event) => {
      console.log('[WebRTC:pc] ontrack', event.track.kind, event.streams.length);
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
      console.log('[WebRTC:pc] ICE state:', state);
      this.onStateChange?.({ ice: state });
      if (state === 'failed') {
        // Attempt ICE restart once before giving up.
        try { this.pc.restartIce(); } catch { /* ignore */ }
      }
    };
    this.pc.onconnectionstatechange = () => {
      console.log('[WebRTC:pc] connection state:', this.pc.connectionState);
      this.onStateChange?.({ connection: this.pc.connectionState });
    };
    this.pc.onsignalingstatechange = () => {
      console.log('[WebRTC:pc] signaling state:', this.pc.signalingState);
    };

    return this.localStream;
  }

  /** Caller creates the offer. Returns the SDP offer object. */
  async createOffer() {
    if (!this.pc) throw new Error('Peer connection not started');
    console.log('[WebRTC:pc] creating offer');
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: this.video,
      iceRestart: false,
    });
    await this.pc.setLocalDescription(offer);
    console.log('[WebRTC:pc] local description set (offer)');
    return offer;
  }

  /** Callee receives the offer and prepares an answer. */
  async setRemoteOffer(offerSdp) {
    if (!this.pc) throw new Error('Peer connection not started');
    console.log('[WebRTC:pc] setting remote offer');
    await this.pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
    console.log('[WebRTC:pc] remote description set (offer)');
  }

  /** Callee creates the answer after accepting the offer. Returns SDP answer. */
  async createAnswer() {
    if (!this.pc) throw new Error('Peer connection not started');
    console.log('[WebRTC:pc] creating answer');
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    console.log('[WebRTC:pc] local description set (answer)');
    return answer;
  }

  /** Caller receives the callee's answer. */
  async setRemoteAnswer(answerSdp) {
    if (!this.pc) throw new Error('Peer connection not started');
    console.log('[WebRTC:pc] setting remote answer');
    await this.pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
    console.log('[WebRTC:pc] remote description set (answer)');
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

  /** Switch between front/back camera (video calls only, mobile). */
  async switchCamera() {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return false;

    const currentLabel = videoTrack.label;
    const oldFacing = this.currentFacingMode;
    const newFacing = oldFacing === 'user' ? 'environment' : 'user';
    console.log('[WebRTC:pc] switchCamera: current =', oldFacing, '(' + currentLabel + ') → target =', newFacing);

    // CRITICAL: On both Android Chrome and iOS Safari, you cannot acquire a
    // second camera while the first one is still capturing. We MUST stop the
    // current video track first, then acquire the other camera. This causes a
    // brief blank flash (~200ms) but is the only reliable way to switch cameras
    // on mobile. If the new camera fails to acquire, we roll back to the
    // original facing mode.
    const sender = this.pc?.getSenders().find((s) => s.track && s.track.kind === 'video');

    // Stop the current camera to free the capture session
    console.log('[WebRTC:pc] switchCamera: stopping current camera track to free capture session');
    videoTrack.stop();
    this.localStream.removeTrack(videoTrack);

    try {
      let newStream = null;
      let usedStrategy = '';

      // ---- Strategy 1: facingMode constraint ----
      // Works on both iOS Safari and Android Chrome. Now that the old camera
      // is stopped, the browser can actually acquire the other camera.
      try {
        console.log('[WebRTC:pc] switchCamera: trying facingMode =', newFacing, '(exact)');
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: newFacing } },
          audio: false,
        });
        usedStrategy = 'facingMode-exact';
      } catch (e1) {
        console.log('[WebRTC:pc] switchCamera: exact facingMode failed:', e1.message);
        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: newFacing },
            audio: false,
          });
          usedStrategy = 'facingMode-loose';
        } catch (e2) {
          console.log('[WebRTC:pc] switchCamera: loose facingMode failed:', e2.message);
        }
      }

      // ---- Strategy 2: enumerateDevices + deviceId ----
      // Fallback for browsers that expose multiple devices but don't respect
      // facingMode constraints well.
      if (!newStream) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        console.log('[WebRTC:pc] switchCamera: found', videoInputs.length, 'video devices:',
          videoInputs.map(d => `"${d.label || 'unlabeled'}"`));

        if (videoInputs.length >= 2) {
          let targetDevice = videoInputs.find(d => d.label && d.label !== currentLabel);
          if (!targetDevice) {
            const currentIndex = videoInputs.findIndex(d => d.label === currentLabel);
            const nextIndex = (currentIndex + 1) % videoInputs.length;
            targetDevice = videoInputs[nextIndex];
          }
          if (targetDevice) {
            console.log('[WebRTC:pc] switchCamera: trying deviceId =', `"${targetDevice.label || 'unlabeled'}"`);
            try {
              newStream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: targetDevice.deviceId } },
                audio: false,
              });
              usedStrategy = 'deviceId-exact';
            } catch (e3) {
              console.log('[WebRTC:pc] switchCamera: exact deviceId failed:', e3.message);
              newStream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: targetDevice.deviceId },
                audio: false,
              });
              usedStrategy = 'deviceId-loose';
            }
          }
        }
      }

      // ---- All strategies failed — ROLLBACK to original camera ----
      if (!newStream) {
        console.warn('[WebRTC:pc] switchCamera: all strategies failed, rolling back to', oldFacing);
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: oldFacing },
          audio: false,
        });
        const rollbackTrack = newStream.getVideoTracks()[0];
        if (rollbackTrack && sender) {
          await sender.replaceTrack(rollbackTrack);
        }
        this.localStream.addTrack(rollbackTrack);
        console.log('[WebRTC:pc] switchCamera: rolled back to original camera');
        return false;
      }

      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) {
        console.warn('[WebRTC:pc] switchCamera: no video track in new stream, rolling back');
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: oldFacing },
          audio: false,
        });
        const rollbackTrack = newStream.getVideoTracks()[0];
        if (rollbackTrack && sender) {
          await sender.replaceTrack(rollbackTrack);
        }
        this.localStream.addTrack(rollbackTrack);
        return false;
      }

      console.log('[WebRTC:pc] switchCamera: new camera =', newTrack.label, 'via', usedStrategy);

      // Replace the track in the peer connection WITHOUT tearing it down.
      if (sender) {
        await sender.replaceTrack(newTrack);
        console.log('[WebRTC:pc] switchCamera: replaceTrack succeeded');
      } else {
        console.warn('[WebRTC:pc] switchCamera: no video sender found in peer connection');
      }
      this.localStream.addTrack(newTrack);
      this.currentFacingMode = newFacing;
      console.log('[WebRTC:pc] switchCamera: SUCCESS — switched to', newTrack.label, 'facing =', newFacing);
      return newFacing;
    } catch (e) {
      // Last resort: try to restore the original camera
      console.warn('[WebRTC:pc] switchCamera failed, attempting rollback:', e.message);
      try {
        const rollbackStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: oldFacing },
          audio: false,
        });
        const rollbackTrack = rollbackStream.getVideoTracks()[0];
        if (rollbackTrack && sender) {
          await sender.replaceTrack(rollbackTrack);
        }
        this.localStream.addTrack(rollbackTrack);
      } catch (rollbackErr) {
        console.error('[WebRTC:pc] switchCamera: ROLLBACK ALSO FAILED:', rollbackErr.message);
      }
      return false;
    }
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
  // In the split architecture, the ICE servers endpoint may be on the
  // WebSocket server (VITE_WS_URL) instead of the API server.
  const WS_URL = import.meta.env.VITE_WS_URL || '';
  const iceUrl = WS_URL
    ? `${WS_URL.replace(/\/ws\/?$/, '')}/api/calls/ice-servers`
    : `${API_BASE_URL}/calls/ice-servers`;
  const res = await fetch(iceUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    // Fall back to a STUN-only config so calls still work on easy networks.
    return [{ urls: ['stun:stun.l.google.com:19302'] }];
  }
  const data = await res.json();
  return data.iceServers || [{ urls: ['stun:stun.l.google.com:19302'] }];
}
