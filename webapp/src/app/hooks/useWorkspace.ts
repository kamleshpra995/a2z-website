import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicUser, SessionInfo, WorkspaceView } from '@shared/types.ts';
import { createReadCoordinator, type ReadCoordinator } from '../utils/readCoordinator.ts';
import type { ApiClient, ApiError } from '../storage.ts';

export const EMPTY_WORKSPACE: WorkspaceView = {
  clients: [],
  services: [],
  stores: [],
  users: [],
  tickets: [],
  notifications: [],
  invoices: [],
};
const REFRESH_INTERVAL_MS = 8000;

export type Refresh = (options?: { fresh?: boolean }) => Promise<WorkspaceView | undefined>;

/** Own session restoration and workspace reads; UI forms stay in App. */
export function useWorkspace(storage: ApiClient) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [authError, setAuthError] = useState('');
  const [data, setData] = useState<WorkspaceView>(EMPTY_WORKSPACE);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const readerRef = useRef<ReadCoordinator<WorkspaceView> | null>(null);
  if (!readerRef.current) readerRef.current = createReadCoordinator(() => storage.getState());
  const reader = readerRef.current;
  const refresh: Refresh = useCallback(
    async (options) => {
      try {
        const snapshot = await reader.read(options);
        if (snapshot) {
          setData(snapshot);
          setLoaded(true);
        }
        return snapshot;
      } catch (error) {
        if ((error as ApiError).status === 401) {
          reader.invalidate();
          setSession((previous) => (previous ? { ...previous, user: null } : previous));
          setData(EMPTY_WORKSPACE);
          setLoaded(false);
        }
        throw error;
      }
    },
    [reader],
  );
  useEffect(() => {
    let active = true;
    storage
      .session()
      .then((value) => {
        if (active) setSession(value);
      })
      .catch((error: Error) => {
        if (active) setAuthError(error.message);
      });
    return () => {
      active = false;
      reader.invalidate();
    };
  }, [storage, reader]);
  useEffect(() => {
    if (!session?.user) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        await refresh();
      } catch (error) {
        if (active) setError((error as Error).message);
      }
      // Schedule after completion so a slow network cannot create overlapping polls.
      if (active) timer = setTimeout(poll, REFRESH_INTERVAL_MS);
    }
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
      reader.invalidate();
    };
  }, [session?.user?.id, refresh, reader]);
  const startSession = useCallback(
    (user: PublicUser) => {
      reader.invalidate();
      setData(EMPTY_WORKSPACE);
      setLoaded(false);
      setSession((previous) => ({ mode: 'api', ...previous, user, needsSetup: false }));
      setError('');
    },
    [reader],
  );
  const endSession = useCallback(async () => {
    await storage.logout();
    reader.invalidate();
    setSession((previous) => (previous ? { ...previous, user: null } : previous));
    setData(EMPTY_WORKSPACE);
    setLoaded(false);
  }, [storage, reader]);
  return { session, authError, data, loaded, error, setError, refresh, startSession, endSession };
}
