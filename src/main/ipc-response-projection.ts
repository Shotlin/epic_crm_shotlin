import {
  requiresRevenueOperationsResponseProjection,
  type IpcAuthorizationPolicy,
} from './ipc-authorization-policy';

/**
 * Applies response-level least privilege after a handler succeeds. This is
 * deliberately separate from command authorization: delegated handlers may
 * resolve their own record scope, but must never return an unprojected
 * Revenue Operations snapshot to a user who lacks read access to part of it.
 */
export function projectIpcResponseForPolicy<T>(
  channel: string,
  policy: IpcAuthorizationPolicy,
  actorId: string | undefined,
  response: T,
  projectRevenueOperationsResponse: (response: T, actorId: string) => T,
): T {
  if (!requiresRevenueOperationsResponseProjection(channel, policy)) return response;
  if (!actorId) throw new Error('Revenue Operations response has no authenticated actor.');
  return projectRevenueOperationsResponse(response, actorId);
}
