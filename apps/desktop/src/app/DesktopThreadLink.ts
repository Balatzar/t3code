/**
 * External apps (Vibe Island, notifications) open a thread with
 * `t3code://threads/<environmentId>/<threadId>`, the same link the mobile app
 * handles. The renderer receives it as a menu action and routes to the thread.
 */
export const OPEN_THREAD_MENU_ACTION_PREFIX = "open-thread:";

export interface DesktopThreadLink {
  readonly environmentId: string;
  readonly threadId: string;
}

export function parseDesktopThreadLink(
  value: string | undefined,
  scheme: string,
): DesktopThreadLink | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== `${scheme}:` || url.host !== "threads") return null;
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length !== 2) return null;
  const [environmentId, threadId] = segments.map((segment) => decodeURIComponent(segment));
  if (!environmentId || !threadId) return null;
  return { environmentId, threadId };
}

export function threadLinkMenuAction(link: DesktopThreadLink): string {
  return `${OPEN_THREAD_MENU_ACTION_PREFIX}${encodeURIComponent(link.environmentId)}/${encodeURIComponent(link.threadId)}`;
}
