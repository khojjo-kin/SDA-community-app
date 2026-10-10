// Browser version of the one call api.ts makes: resize to a width and save as JPEG.
export const SaveFormat = { JPEG: 'jpeg', PNG: 'png' } as const;

type Action = { resize?: { width?: number; height?: number } };

function load(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That picture could not be opened. Choose another.'));
    img.src = uri;
  });
}

export async function manipulateAsync(uri: string, actions: Action[] = [], opts: { compress?: number; format?: string } = {}) {
  const img = await load(uri);
  let width = img.naturalWidth;
  let height = img.naturalHeight;
  for (const a of actions) {
    if (a.resize?.width && a.resize.width < width) {
      height = Math.round((height * a.resize.width) / width);
      width = a.resize.width;
    } else if (a.resize?.height && a.resize.height < height) {
      width = Math.round((width * a.resize.height) / height);
      height = a.resize.height;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const type = opts.format === 'png' ? 'image/png' : 'image/jpeg';
  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, type, opts.compress ?? 0.9));
  if (!blob) throw new Error('That picture could not be prepared. Choose another.');
  return { uri: URL.createObjectURL(blob), width, height };
}
