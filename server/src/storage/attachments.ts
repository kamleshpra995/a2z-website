import path from 'node:path';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { validateAttachment } from '../shared/attachmentValidation.ts';
import type { Attachment } from '../shared/types.ts';

export interface AttachmentStore {
  save(ticketId: string, file: unknown, userId: string): Promise<Attachment>;
  absolutePath(metadata: Pick<Attachment, 'storagePath'>): string;
  remove(metadata: Pick<Attachment, 'storagePath'>): Promise<void>;
}

/** Only database references use relative storage paths. Never expose this root as static hosting. */
export function createAttachmentStore(directory: string): AttachmentStore {
  const root = path.resolve(directory);
  const resolve = (relative: string | undefined) => {
    const file = path.resolve(root, relative ?? '');
    const within = path.relative(root, file);
    if (!within || within.startsWith('..') || path.isAbsolute(within))
      throw Error('Invalid attachment storage path.');
    return file;
  };
  return {
    async save(ticketId, file, userId) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(ticketId)) throw Error('Invalid ticket ID.');
      const validated = validateAttachment(file);
      const id = randomUUID();
      const storagePath = `tickets/${ticketId}/${id}.${validated.extension}`;
      const absolute = resolve(storagePath);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, validated.bytes, { flag: 'wx' });
      return {
        id,
        name: validated.name,
        mime: validated.mime,
        size: validated.size,
        storagePath,
        createdBy: userId,
        createdAt: new Date().toISOString(),
      };
    },
    absolutePath: (metadata) => resolve(metadata.storagePath),
    async remove(metadata) {
      await unlink(resolve(metadata.storagePath)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    },
  };
}
