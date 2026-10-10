// react-native-webrtc on desktop: the browser's own WebRTC, which has the same interface. This
// lets the shared src/lib/rtc.ts and calls.tsx run unchanged, so calls and Live work between
// the Mac app and the iPhone app.
export const RTCPeerConnection = globalThis.RTCPeerConnection;
export const RTCIceCandidate = globalThis.RTCIceCandidate;
export const RTCSessionDescription = globalThis.RTCSessionDescription;
export const MediaStream = globalThis.MediaStream;
export type MediaStream = globalThis.MediaStream;
export const mediaDevices = {
  getUserMedia(constraints: MediaStreamConstraints) {
    if (!navigator.mediaDevices?.getUserMedia) return Promise.reject(new Error('This computer has no camera or microphone access.'));
    return navigator.mediaDevices.getUserMedia(constraints);
  },
};
