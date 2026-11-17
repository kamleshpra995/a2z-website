export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

const types = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  csv: 'text/csv',
} as const;
type Extension = keyof typeof types;

export interface ValidatedAttachment {
  name: string;
  extension: Extension;
  mime: (typeof types)[Extension];
  size: number;
  bytes: Uint8Array;
}

const isExtension = (value: string): value is Extension => Object.hasOwn(types, value);

/** Restrict size, extension and binary signature. Files are served as downloads, never executable public assets. */
export function validateAttachment(input: unknown): ValidatedAttachment {
  const file = (input && typeof input === 'object' ? input : {}) as {
    name?: unknown;
    base64?: unknown;
  };
  const name = String(file.name || '')
    .split(/[\\/]/)
    .pop()!
    .replace(/[\r\n\x00]/g, '')
    .slice(0, 160);
  const extension = name.split('.').pop()!.toLowerCase();
  if (!isExtension(extension)) throw Error('Use JPG, PNG, WebP, PDF, DOCX, XLSX, TXT or CSV.');
  const mime = types[extension];
  const base64 = String(file.base64 || '');
  if (
    base64.length > Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4 ||
    !base64 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  )
    throw Error('Invalid attachment or file exceeds 2 MB.');
  let raw: string;
  try {
    raw = atob(base64);
  } catch {
    throw Error('Invalid attachment encoding.');
  }
  if (!raw.length || raw.length > MAX_ATTACHMENT_BYTES)
    throw Error('File must be between 1 byte and 2 MB.');
  const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  const prefix = raw.slice(0, 12);
  if (
    (extension === 'pdf' && !prefix.startsWith('%PDF-')) ||
    ((extension === 'jpg' || extension === 'jpeg') &&
      !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)) ||
    (extension === 'png' &&
      ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) ||
    (extension === 'webp' && !(prefix.startsWith('RIFF') && prefix.slice(8) === 'WEBP')) ||
    ((extension === 'docx' || extension === 'xlsx') && !prefix.startsWith('PK\x03\x04'))
  )
    throw Error('File content does not match its extension.');
  return { name, extension, mime, size: bytes.length, bytes };
}
