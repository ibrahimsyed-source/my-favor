// Pick one photo from the device library and upload it through the server's
// /api/uploads proxy (Supabase Storage sits behind it — the app never talks to
// Supabase directly and holds no storage key). Honest three-way result:
//   { ok: true, url }     — public https URL, ready to persist on a favor/profile
//   { ok: false, reason } — unsupported type / server refusal (the server's
//                           400/503 message rides `reason`)
//   null                  — the user cancelled the picker (not an error; show nothing)
//
// Signup needs the two halves separately (the upload route is authed, but the
// avatar is picked BEFORE the account exists): pickImageLocal() for an instant
// local preview, uploadPickedImage() once a session exists.

import * as ImagePicker from 'expo-image-picker';
import { uploadImageApi, UploadContentType } from '../api/endpoints';

export type PickedImage = { uri: string; data: string; contentType: UploadContentType };

// Server contentType allowlist (uploads.routes.ts mirrors this).
const MIME_TYPE: Record<string, UploadContentType> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};

const EXT_TYPE: Record<string, UploadContentType> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};

// Map the picked asset to the allowlist: trust the asset's mimeType first,
// fall back to the filename/uri extension, and default to JPEG only when the
// asset declares nothing at all (quality < 1 makes expo re-encode to JPEG on
// native anyway). A declared-but-unsupported type (e.g. HEIC) returns null so
// the caller can surface a clear reason instead of a server 400.
function contentTypeOf(asset: ImagePicker.ImagePickerAsset): UploadContentType | null {
  const mime = asset.mimeType?.toLowerCase();
  if (mime) return MIME_TYPE[mime] ?? null;
  const name = asset.fileName ?? asset.uri ?? '';
  const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(name)?.[1]?.toLowerCase();
  if (ext) return EXT_TYPE[ext] ?? null;
  return 'image/jpeg';
}

// Open the OS photo picker and return the asset locally — no network. NOTE:
// deliberately NO media-library permission pre-gate: the system photo pickers
// (iOS 14+ PHPicker, Android 13+ Photo Picker, web file input) need none, and
// a stale "denied" answer to that unnecessary prompt must not lock users out.
export async function pickImageLocal(): Promise<
  { ok: true; image: PickedImage } | { ok: false; reason: string } | null
> {
  let res: ImagePicker.ImagePickerResult;
  try {
    res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.7,
      base64: true,
    });
  } catch {
    return { ok: false, reason: 'Could not open the photo library on this device.' };
  }
  if (res.canceled || !res.assets?.[0]) return null; // user cancelled — not an error

  const asset = res.assets[0];
  const contentType = contentTypeOf(asset);
  if (!contentType) return { ok: false, reason: 'Please choose a JPEG, PNG, or WebP image.' };

  // base64:true fills asset.base64 on native; web sometimes returns a data:
  // URI instead — the server accepts either (it strips the prefix).
  const data = asset.base64 ?? (asset.uri?.startsWith('data:') ? asset.uri : null);
  if (!data) return { ok: false, reason: 'Could not read the selected image. Please try another one.' };

  return { ok: true, image: { uri: asset.uri, data, contentType } };
}

// Upload an already-picked image (requires an authenticated session).
export async function uploadPickedImage(
  image: PickedImage,
  kind: 'favor' | 'avatar',
): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  try {
    const { url } = await uploadImageApi({ data: image.data, contentType: image.contentType, kind });
    return { ok: true, url };
  } catch (e: any) {
    // The server's 400 (too large / bad type) and 503 (uploads not configured)
    // messages are user-presentable — surface them verbatim. A transport abort
    // (slow uplink vs the upload timeout) gets friendly copy instead of the
    // dev-facing "Is the API running?" text.
    const reason =
      e?.code === 'network_error'
        ? 'The upload timed out — check your connection and try again.'
        : e?.message || 'Could not upload the image. Please try again.';
    return { ok: false, reason };
  }
}

export async function pickAndUploadImage(
  kind: 'favor' | 'avatar',
): Promise<{ ok: true; url: string } | { ok: false; reason: string } | null> {
  const picked = await pickImageLocal();
  if (picked === null) return null;
  if (!picked.ok) return picked;
  return uploadPickedImage(picked.image, kind);
}
