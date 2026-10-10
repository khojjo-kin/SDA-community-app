import * as ImagePicker from 'expo-image-picker';

export type Picked = ImagePicker.ImagePickerAsset;

/** Opens the photo library. Returns an empty list when the person cancels. */
export async function pickFromLibrary(opts: { video?: boolean; multiple?: boolean; square?: boolean; limit?: number } = {}): Promise<Picked[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: opts.video ? ['images', 'videos'] : ['images'],
    allowsMultipleSelection: !!opts.multiple,
    selectionLimit: opts.multiple ? opts.limit ?? 10 : 1,
    orderedSelection: !!opts.multiple,
    allowsEditing: !!opts.square,
    aspect: [1, 1],
    quality: 1,
    videoMaxDuration: 60,
    videoExportPreset: ImagePicker.VideoExportPreset.H264_960x540,
  });
  return res.canceled ? [] : res.assets;
}

/** Opens the library showing videos only. The video is made smaller so it uploads quickly. */
export async function pickVideo(): Promise<Picked | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsMultipleSelection: false,
    quality: 1,
    videoMaxDuration: 60,
    videoExportPreset: ImagePicker.VideoExportPreset.H264_960x540,
  });
  return res.canceled ? null : res.assets[0] ?? null;
}

/** Opens the camera. Throws a readable error when camera access is off. */
export async function takePhoto(opts: { front?: boolean; video?: boolean; videoOnly?: boolean } = {}): Promise<Picked[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Camera access is off. Turn it on for Community in the Settings app.');
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: opts.videoOnly ? ['videos'] : opts.video ? ['images', 'videos'] : ['images'],
    // 640 x 480 keeps a one-minute recording well under the upload limit and looks sharper than "medium".
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.VGA640x480,
    cameraType: opts.front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    quality: 1,
    videoMaxDuration: 60,
  });
  return res.canceled ? [] : res.assets;
}

/** Whether a picked video is short and small enough to share. Returns a reason when it is not. */
export function videoProblem(durationMs: number | null | undefined, bytes: number | null | undefined): string | null {
  if ((durationMs ?? 0) > 60500) return 'Videos can be up to 60 seconds. Trim it in Photos, then choose it again.';
  if ((bytes ?? 0) > 48 * 1024 * 1024) return 'That video is too large to upload. Choose a shorter one.';
  return null;
}
