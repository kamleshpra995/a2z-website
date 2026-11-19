import type {
  ActionResults,
  ActionType,
  ConversationSnapshot,
  FileUpload,
  Payload,
  PublicAttachment,
  PublicTicketReceipt,
  PublicUser,
  SessionInfo,
  VerifiedStore,
  WorkspaceView,
} from '@shared/types.ts';

/** An Error carrying the HTTP status of a failed API call. */
export type ApiError = Error & { status?: number };

/** The subset of `fetch` the client needs. Tests inject their own implementation. */
export type Fetcher = (
  path: string,
  init: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'json'> & Partial<Pick<Response, 'blob'>>>;

/** All workspace data comes from the same-origin API. Sessions use HttpOnly cookies. */
export function createApiClient(request: Fetcher = (path, init) => globalThis.fetch(path, init)) {
  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await request(path, { credentials: 'same-origin', ...options });
    const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response.ok || !body) {
      const error: ApiError = Error(body?.error || `Service request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return body;
  }
  const post = <T>(path: string, body: unknown) =>
    api<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const attachments = (ticketId: string) =>
    `/api/tickets/${encodeURIComponent(ticketId)}/attachments`;
  return {
    session: () => api<SessionInfo>('/api/auth/session'),
    login: (payload: Payload) => post<{ user: PublicUser }>('/api/auth/login', payload),
    logout: () => post<{ ok: true }>('/api/auth/logout', {}),
    getState: () => api<WorkspaceView>('/api/state'),
    action: <T extends ActionType>(type: T, payload: Payload) =>
      post<{ ok: true; result: ActionResults[T] }>('/api/action', { type, payload }),
    getConversation: (id: string) =>
      api<ConversationSnapshot>(`/api/tickets/${encodeURIComponent(id)}/conversation`),
    uploadAttachment: (id: string, file: FileUpload) =>
      post<{ attachment: PublicAttachment }>(attachments(id), file),
    async getAttachmentUrl(id: string, fileId: string): Promise<string> {
      const response = await request(`${attachments(id)}/${encodeURIComponent(fileId)}`, {
        credentials: 'same-origin',
      });
      if (!response.ok || !response.blob) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw Error(body?.error || 'Could not download the attachment.');
      }
      return URL.createObjectURL(await response.blob());
    },
    verifyStore: (payload: Payload) => post<VerifiedStore>('/api/public/verify', payload),
    raisePublicTicket: (payload: Payload) =>
      post<PublicTicketReceipt>('/api/public/tickets', payload),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export const storage: ApiClient = createApiClient();
