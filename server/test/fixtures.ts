import { createState as emptyState } from '../src/domain/state.ts';
import { authenticatedAction } from '../src/domain/auth.ts';
import { applyAction } from '../src/domain/actions.ts';
import type { ActionType, Actor, Payload, WorkspaceState } from '../src/shared/types.ts';

/** Test-only service catalogue. The actual app starts with an empty, user-managed master. */
export function createState(): WorkspaceState {
  const state = emptyState();
  state.services = [{ id: 'test-service', name: 'Test service', active: true }];
  return state;
}

/**
 * Tests often build partial records (a store without a manager, a user without an email).
 * `loose` documents that intent at the call site instead of weakening the domain types.
 */
export const loose = <T>(value: unknown): T => value as T;

/** Bind `authenticatedAction` to one workspace, keeping the per-action result types. */
export function actionRunner(state: WorkspaceState) {
  return <T extends ActionType>(user: Actor, type: T, payload: Payload) =>
    authenticatedAction(state, user, type, payload, applyAction);
}
