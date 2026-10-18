export function workspaceError(response: Response, subject: string): Error {
  if (response.status === 401) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('growthos-session-expired'));
    return Error('Session expired. Sign in again to continue.');
  }
  if (response.status === 403) return Error('Permission denied. Select an authorized workspace or ask an owner for access.');
  return Error(`${subject} unavailable. Try again later.`);
}
