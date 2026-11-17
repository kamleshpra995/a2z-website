import {
  validateAttachment,
  MAX_ATTACHMENT_BYTES,
  type ValidatedAttachment,
} from '../shared/attachmentValidation.ts';
import { authenticatedAction } from './auth.ts';
import { applyAction } from './actions.ts';
import type { Actor, Attachment, FileUpload, Ticket, WorkspaceState } from '../shared/types.ts';

export type SaveFile = (
  ticketId: string,
  file: FileUpload,
  userId: string,
  validated: ValidatedAttachment,
) => Promise<Attachment>;

/** Source bytes are stored by the adapter; only attachment references enter the ticket history. */
export async function saveTicketImages(
  state: WorkspaceState,
  user: Actor,
  ticket: Ticket,
  files: unknown,
  saveFile: SaveFile,
  saved: Attachment[],
): Promise<void> {
  if (files == null) return;
  if (!Array.isArray(files) || files.length > 5) throw Error('Choose up to five ticket images.');
  const validated = files.map(validateAttachment);
  if (
    validated.some((file) => !file.mime.startsWith('image/')) ||
    validated.reduce((sum, file) => sum + file.size, 0) > MAX_ATTACHMENT_BYTES
  )
    throw Error('Choose JPG, PNG or WebP images, up to 2 MB combined.');
  for (let index = 0; index < files.length; index++) {
    const metadata = await saveFile(
      ticket.id,
      files[index] as FileUpload,
      user.id,
      validated[index]!,
    );
    saved.push(metadata);
    (ticket.attachments ??= []).push(metadata);
  }
  await authenticatedAction(
    state,
    user,
    'comment',
    {
      ticketId: ticket.id,
      text: 'Images attached when the ticket was raised.',
      attachmentIds: saved.map((file) => file.id),
    },
    applyAction,
  );
}
