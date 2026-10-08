import * as ImagePicker from 'expo-image-picker';

export type Picked = ImagePicker.ImagePickerAsset;

/** Opens the photo library. Returns an empty list when the person cancels. */
export async function pickFromLibrary(opts: { video?: boolean; multiple?: boolean; square?: boolean } = {}): Promise<Picked[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: opts.video ? ['images', 'videos'] : ['images'],
    allowsMultipleSelection: !!opts.multiple,
    selectionLimit: opts.multiple ? 10 : 1,
    orderedSelection: !!opts.multiple,
    allowsEditing: !!opts.square,
    aspect: [1, 1],
    quality: 0.9,
    videoMaxDuration: 60,
    videoExportPreset: ImagePicker.VideoExportPreset.H264_960x540,
  });
  return res.canceled ? [] : res.assets;
}

/** Opens the camera. Throws a readable error when camera access is off. */
export async function takePhoto(): Promise<Picked[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Camera access is off. Turn it on for Community in the Settings app.');
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
  return res.canceled ? [] : res.assets;
}
