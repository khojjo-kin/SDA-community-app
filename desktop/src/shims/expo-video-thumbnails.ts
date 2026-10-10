// Browser version: draws one frame of a video into a JPEG.
export async function getThumbnailAsync(uri: string, opts: { time?: number; quality?: number } = {}) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  video.src = uri;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('That video could not be opened.'));
  });
  video.currentTime = Math.min((opts.time ?? 0) / 1000, Math.max(0, video.duration - 0.1) || 0);
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
    setTimeout(resolve, 1500);
  });
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 720;
  canvas.height = video.videoHeight || 1280;
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', opts.quality ?? 0.7));
  if (!blob) throw new Error('No thumbnail');
  return { uri: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
}
