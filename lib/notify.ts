// Browser notifications, disguise-aware.
//
// In normal mode a notification shows who + what. In stealth / panic mode it collapses to a
// neutral "New message" with no sender or content, so a popup can never blow your cover.

export function notifySupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notifyPermission(): NotificationPermission {
  return notifySupported() ? Notification.permission : "denied";
}

export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (!notifySupported()) return "denied";
  if (Notification.permission === "granted") return "granted";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/**
 * Show a notification.
 * @param disguised when true (stealth/panic on), hide sender + content.
 */
export function showMessageNotification(sender: string, text: string, disguised: boolean) {
  if (!notifySupported() || Notification.permission !== "granted") return;
  try {
    const title = disguised ? "New message" : sender;
    const body = disguised ? "" : text.length > 120 ? text.slice(0, 117) + "…" : text;
    const n = new Notification(title, {
      body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: "solink-message",
      silent: false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* notification failed */
  }
}
