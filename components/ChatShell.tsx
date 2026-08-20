"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AttachmentRef, ChatMessage, ChatTransport, InboxActivity, ReactionSummary, ReplyRef, TransportEvents } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { CodeSnippet } from "./CodeSnippet";
import { BossModeIDE } from "./BossModeIDE";
import { Sidebar, type Contact } from "./Sidebar";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { TypingDots } from "./TypingDots";
import { ImageLightbox } from "./ImageLightbox";
import { ImageCropper } from "./ImageCropper";
import { GroupChatView } from "./GroupChatView";
import { NewGroupModal } from "./NewGroupModal";
import { LogoMark } from "./Logo";
import type { GroupTransport, GroupEvents } from "@/lib/groupTransport";
import { requestNotifyPermission, showMessageNotification, notifyPermission } from "@/lib/notify";
import { encodeMessage, decodeMessage } from "@/lib/envelope";

const SOLINK_TITLE = "Solink — Private Messenger";
const DISGUISED_TITLE = "index.ts — Visual Studio Code";

export type TransportFactory = (
  peerUsername: string,
  events: TransportEvents
) => ChatTransport;

function sameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.toDateString() === db.toDateString();
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

// A short WebAudio "ping" for incoming messages — no asset file needed.
function playPing() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => ctx.close();
  } catch {
    /* audio not available */
  }
}

export function ChatShell({
  myName,
  myAvatarUrl,
  makeTransport,
  makeInboxSubscription,
  loadInbox,
  markConversationRead,
  setConversationPinned,
  setConversationArchived,
  setConversationMuted,
  loadBlockedUsers,
  blockUser,
  unblockUser,
  validateUsername,
  lookupUser,
  fetchProfiles,
  makeGroupTransport,
  listGroups,
  createGroup,
  onSignOut,
}: {
  myName: string;
  myAvatarUrl?: string | null;
  makeTransport: TransportFactory;
  makeInboxSubscription?: (onActivity: (a: InboxActivity) => void) => () => void;
  loadInbox?: () => Promise<Array<{ conversationId: string; username: string; avatarUrl: string | null; lastText: string; lastActivity: number; unread: number; archived: boolean; pinned: boolean; mutedUntil: number | null }>>;
  markConversationRead?: (conversationId: string, throughMessageId: string) => Promise<void>;
  setConversationPinned?: (conversationId: string, pinned: boolean) => Promise<void>;
  setConversationArchived?: (conversationId: string, archived: boolean) => Promise<void>;
  setConversationMuted?: (conversationId: string, mutedUntil: number | null) => Promise<void>;
  loadBlockedUsers?: () => Promise<string[]>;
  blockUser?: (username: string) => Promise<void>;
  unblockUser?: (username: string) => Promise<void>;
  validateUsername?: (username: string) => Promise<boolean>;
  lookupUser?: (username: string) => Promise<{ username: string; avatarUrl: string | null } | null>;
  fetchProfiles?: (usernames: string[]) => Promise<{ username: string; avatarUrl: string | null }[]>;
  makeGroupTransport?: (groupId: string, events: GroupEvents) => GroupTransport;
  listGroups?: () => Promise<{ id: string; name: string }[]>;
  createGroup?: (name: string, memberUsernames: string[]) => Promise<{ id: string; name: string } | null>;
  onSignOut?: () => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeContact, setActiveContact] = useState<string | null>(null);
  const [messagesByContact, setMessagesByContact] = useState<Record<string, ChatMessage[]>>({});

  // ---- groups (additive; the 1-on-1 state above is untouched) ----
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<{ id: string; username: string }[]>([]);
  const [groupMsgs, setGroupMsgs] = useState<ChatMessage[]>([]);
  const [groupConnecting, setGroupConnecting] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const groupTransportRef = useRef<GroupTransport | null>(null);

  const [peerName, setPeerName] = useState("");
  const [simulated, setSimulated] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stealth, setStealth] = useState(false);
  const [ide, setIde] = useState(false);
  const [lastWire, setLastWire] = useState("");
  const [showWire, setShowWire] = useState(true);
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerAvatar, setPeerAvatar] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<number | null>(null);
  const [notifyOn, setNotifyOn] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reactionsByMsg, setReactionsByMsg] = useState<
    Record<string, Record<string, { emoji: string; mine: boolean }>>
  >({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const [pendingForward, setPendingForward] = useState<{ file: File; target: string } | null>(null);
  const [cropState, setCropState] = useState<{ file: File } | null>(null);

  const transportRef = useRef<ChatTransport | null>(null);
  const makeTransportRef = useRef(makeTransport);
  makeTransportRef.current = makeTransport;
  const inboxRef = useRef(makeInboxSubscription);
  inboxRef.current = makeInboxSubscription;
  const activeContactRef = useRef(activeContact);
  activeContactRef.current = activeContact;
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;
  const syncedReadRef = useRef<Map<string, string>>(new Map());
  const blockedReadyRef = useRef(!loadBlockedUsers);
  const blockedMutationRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingClear = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markedRef = useRef<Set<string>>(new Set());
  const atBottomRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const restoreScrollRef = useRef<number | null>(null); // scrollHeight snapshot for load-older compensation
  const loadingInitialHistoryRef = useRef(false);
  const animatedMessageIdsRef = useRef<Set<string>>(new Set());
  const [loadingOlder, setLoadingOlder] = useState(false);

  // Live refs so the (stable) message handler always sees current UI state.
  const stealthRef = useRef(stealth);
  stealthRef.current = stealth;
  const ideRef = useRef(ide);
  ideRef.current = ide;
  const notifyRef = useRef(notifyOn);
  notifyRef.current = notifyOn;

  // restore notification preference
  useEffect(() => {
    setNotifyOn(localStorage.getItem("solink:notify") === "1" && notifyPermission() === "granted");
  }, []);

  async function toggleNotify() {
    if (notifyOn) {
      setNotifyOn(false);
      localStorage.setItem("solink:notify", "0");
      return;
    }
    const perm = await requestNotifyPermission();
    const on = perm === "granted";
    setNotifyOn(on);
    localStorage.setItem("solink:notify", on ? "1" : "0");
  }

  const messages = (activeContact && messagesByContact[activeContact]) || [];
  const contactsKey = `solink:contacts:${myName.toLowerCase()}`;

  const reconcileInbox = useCallback(async () => {
    if (!loadInbox) return;
    if (!blockedReadyRef.current) return;
    try {
      const serverContacts = await loadInbox();
      setContacts((current) => {
        const local = new Map(current.map((contact) => [contact.username.toLowerCase(), contact]));
        const synced = serverContacts.filter(
          (item) => !blockedRef.current.has(item.username.toLowerCase())
        ).map((item) => {
          const existing = local.get(item.username.toLowerCase());
          local.delete(item.username.toLowerCase());
          return {
            ...existing,
            conversationId: item.conversationId,
            username: item.username,
            avatarUrl: item.avatarUrl,
            unread: item.unread,
            archived: item.archived,
            pinned: item.pinned,
            mutedUntil: item.mutedUntil,
            lastText:
              (existing?.lastActivity || 0) > item.lastActivity
                ? existing?.lastText
                : item.lastText,
            lastActivity: Math.max(existing?.lastActivity || 0, item.lastActivity),
          };
        });
        // Keep locally searched draft contacts that have no server conversation.
        return [
          ...synced,
          ...[...local.values()].filter(
            (contact) => !blockedRef.current.has(contact.username.toLowerCase())
          ),
        ];
      });
    } catch {
      // Inbox synchronization is optional and must never block messaging.
    }
  }, [loadInbox]);

  // load saved contacts for this identity
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(contactsKey) || "[]");
      if (Array.isArray(saved)) setContacts(saved.map((u: string) => ({ username: u })));
    } catch {
      /* ignore */
    }
  }, [contactsKey]);

  useEffect(() => {
    if (!loadInbox) return;
    void reconcileInbox();
    const reconcile = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void reconcileInbox();
    };
    const timer = window.setInterval(reconcile, 30_000);
    window.addEventListener("online", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
    };
  }, [loadInbox, reconcileInbox]);

  const persistContacts = useCallback(
    (list: Contact[]) => {
      localStorage.setItem(contactsKey, JSON.stringify(list.map((c) => c.username)));
    },
    [contactsKey]
  );

  // Backfill avatars for contacts that don't have one yet (e.g. loaded from
  // localStorage, which only stores usernames). One batched query.
  const avatarRequestedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!fetchProfiles) return;
    const need = contacts
      .filter((c) => c.avatarUrl === undefined && !avatarRequestedRef.current.has(c.username.toLowerCase()))
      .map((c) => c.username);
    if (!need.length) return;
    const needSet = new Set(need.map((u) => u.toLowerCase()));
    need.forEach((u) => avatarRequestedRef.current.add(u.toLowerCase()));
    fetchProfiles(need)
      .then((profs) => {
        const map = new Map(profs.map((p) => [p.username.toLowerCase(), p.avatarUrl]));
        setContacts((prev) =>
          prev.map((c) =>
            needSet.has(c.username.toLowerCase())
              ? { ...c, avatarUrl: map.get(c.username.toLowerCase()) ?? null }
              : c
          )
        );
      })
      .catch(() => {});
  }, [contacts, fetchProfiles]);

  // Blocked usernames (lowercase), persisted per identity. Blocked people can't
  // start chats with you and their inbox pings are ignored.
  const blockedKey = `solink:blocked:${myName.toLowerCase()}`;
  const blockedMigratedKey = `${blockedKey}:cloud-migrated`;
  const blockedPendingKey = `${blockedKey}:cloud-pending`;
  const blockedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    let local = new Set<string>();
    try {
      const saved = JSON.parse(localStorage.getItem(blockedKey) || "[]");
      if (Array.isArray(saved)) {
        local = new Set(saved.map((u: string) => u.toLowerCase()));
        blockedRef.current = local;
      }
    } catch {
      /* ignore */
    }
    if (loadBlockedUsers) {
      const fetchBlockedUsers = loadBlockedUsers;
      void (async () => {
        async function loadStableServerBlocks(): Promise<Set<string>> {
          while (true) {
            const version = blockedMutationRef.current;
            const serverUsernames = await fetchBlockedUsers();
            if (cancelled || version === blockedMutationRef.current) {
              return new Set(serverUsernames.map((username) => username.toLowerCase()));
            }
          }
        }

        let server = await loadStableServerBlocks();
        if (cancelled) return;
        const shouldImport = localStorage.getItem(blockedMigratedKey) !== "1";
        let pending: string[] = [];
        if (shouldImport) {
          const savedPending = localStorage.getItem(blockedPendingKey);
          if (savedPending === null) {
            pending = [...local];
            localStorage.setItem(blockedPendingKey, JSON.stringify(pending));
          } else {
            try {
              const parsed = JSON.parse(savedPending);
              if (Array.isArray(parsed)) {
                pending = parsed.filter((username): username is string => typeof username === "string");
              }
            } catch {
              pending = [];
            }
          }
        }
        const legacyOnly = shouldImport
          ? pending.filter((username) => !server.has(username))
          : [];
        // Import legacy local blocks once. A failed import stays blocked on
        // this device and will be retried on a later app load.
        if (blockUser) {
          const imports = await Promise.allSettled(
            legacyOnly.map((username) => blockUser(username))
          );
          imports.forEach((result, index) => {
            if (result.status === "fulfilled") server.add(legacyOnly[index]);
          });
        }
        if (cancelled) return;
        server = await loadStableServerBlocks();
        if (cancelled) return;
        const failedLegacy = legacyOnly.filter((username) => !server.has(username));
        if (shouldImport) {
          if (failedLegacy.length === 0) {
            localStorage.setItem(blockedMigratedKey, "1");
            localStorage.removeItem(blockedPendingKey);
          } else {
            localStorage.setItem(blockedPendingKey, JSON.stringify(failedLegacy));
          }
        }
        const effective = shouldImport
          ? new Set([...server, ...failedLegacy])
          : server;
        blockedRef.current = effective;
        localStorage.setItem(blockedKey, JSON.stringify([...effective]));
        blockedReadyRef.current = true;
        setContacts((current) => current.filter(
          (contact) => !effective.has(contact.username.toLowerCase())
        ));
        void reconcileInbox();
      })()
        .catch(() => {
          // Local blocking remains available when Cloud synchronization fails.
          blockedReadyRef.current = true;
          void reconcileInbox();
        });
    } else {
      blockedReadyRef.current = true;
    }
    return () => {
      cancelled = true;
    };
  }, [blockUser, blockedKey, blockedMigratedKey, blockedPendingKey, loadBlockedUsers, reconcileInbox]);
  const persistBlocked = useCallback(
    (set: Set<string>) => localStorage.setItem(blockedKey, JSON.stringify([...set])),
    [blockedKey]
  );

  // Remove a chat locally (history + contact). Does not tell the other side.
  function removeContact(username: string) {
    const lc = username.toLowerCase();
    setContacts((prev) => {
      const next = prev.filter((c) => c.username.toLowerCase() !== lc);
      persistContacts(next);
      return next;
    });
    setMessagesByContact((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) if (k.toLowerCase() === lc) delete next[k];
      return next;
    });
    if (activeContact?.toLowerCase() === lc) setActiveContact(null);
  }

  // Block: remove the chat and refuse future contact until unblocked.
  async function blockContact(username: string) {
    try {
      if (blockUser) await blockUser(username);
    } catch {
      flash("Couldn't block this user. Try again.");
      return;
    }
    blockedMutationRef.current += 1;
    const next = new Set(blockedRef.current).add(username.toLowerCase());
    blockedRef.current = next;
    persistBlocked(next);
    removeContact(username);
    flash(`Blocked @${username}`);
  }

  async function unblock(username: string): Promise<boolean> {
    try {
      if (unblockUser) await unblockUser(username);
    } catch {
      flash("Couldn't unblock this user. Try again.");
      return false;
    }
    blockedMutationRef.current += 1;
    const next = new Set(blockedRef.current);
    next.delete(username.toLowerCase());
    blockedRef.current = next;
    persistBlocked(next);
    return true;
  }

  async function updateActiveConversation(
    operation: "pin" | "archive" | "mute",
    value: boolean | number | null
  ) {
    if (!activeContact) return;
    const contact = contacts.find(
      (item) => item.username.toLowerCase() === activeContact.toLowerCase()
    );
    if (!contact?.conversationId) {
      flash("This chat is still syncing. Try again in a moment.");
      return;
    }
    try {
      if (operation === "pin" && setConversationPinned) {
        await setConversationPinned(contact.conversationId, value as boolean);
      } else if (operation === "archive" && setConversationArchived) {
        await setConversationArchived(contact.conversationId, value as boolean);
        if (value) setActiveContact(null);
      } else if (operation === "mute" && setConversationMuted) {
        await setConversationMuted(contact.conversationId, value as number | null);
      } else {
        return;
      }
      await reconcileInbox();
    } catch {
      flash("Couldn't update this chat. Try again.");
    }
  }

  // LIVE INBOX: a global listener for messages in ANY of my conversations — drives
  // recent-on-top sorting, unread badges, and cross-chat notifications. Runs on a
  // separate channel from the chat transport, so it can never affect message delivery.
  useEffect(() => {
    if (!inboxRef.current) return;
    const unsub = inboxRef.current((a) => {
      if (!a.fromUsername) {
        void reconcileInbox();
        return;
      }
      const uname = a.fromUsername;
      if (blockedRef.current.has(uname.toLowerCase())) return; // ignore blocked senders
      const isActive = uname.toLowerCase() === (activeContactRef.current || "").toLowerCase();
      const source = contactsRef.current.find(
        (contact) => contact.username.toLowerCase() === uname.toLowerCase()
      );
      const muted = !!source?.mutedUntil && source.mutedUntil > Date.now();
      setContacts((prev) => {
        const exists = prev.some((c) => c.username.toLowerCase() === uname.toLowerCase());
        const next = exists
          ? prev.map((c) =>
              c.username.toLowerCase() === uname.toLowerCase()
                ? {
                    ...c,
                    lastActivity: Math.max(c.lastActivity || 0, a.ts),
                    unread: isActive ? c.unread : (c.unread || 0) + 1,
                  }
                : c
            )
          : // auto-add an incoming chat from someone new
            [{ username: uname, lastActivity: a.ts, unread: isActive ? 0 : 1 }, ...prev];
        persistContacts(next);
        return next;
      });
      if (!isActive && !muted) {
        playPing();
        if (notifyRef.current) {
          showMessageNotification(uname, "sent you a message", stealthRef.current || ideRef.current);
        }
      }
      void reconcileInbox();
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconcileInbox]);

  // clear a chat's unread badge when you open it
  useEffect(() => {
    if (!activeContact) return;
    setContacts((prev) =>
      prev.some((c) => c.username === activeContact && c.unread)
        ? prev.map((c) => (c.username === activeContact ? { ...c, unread: 0 } : c))
        : prev
    );
    const contact = contacts.find(
      (item) => item.username.toLowerCase() === activeContact.toLowerCase()
    );
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const list = messagesByContact[activeContact] || [];
    const latestIncoming = [...list].reverse().find((message) => !message.mine);
    if (contact?.conversationId && latestIncoming && markConversationRead) {
      const conversationId = contact.conversationId;
      if (connecting) return;
      if (syncedReadRef.current.get(conversationId) === latestIncoming.id) return;
      syncedReadRef.current.set(conversationId, latestIncoming.id);
      void markConversationRead(conversationId, latestIncoming.id)
        .then(() => reconcileInbox())
        .catch(() => syncedReadRef.current.delete(conversationId));
    }
  }, [activeContact, connecting, contacts, markConversationRead, messagesByContact, reconcileInbox]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !activeContact) return;
      const contact = contactsRef.current.find(
        (item) => item.username.toLowerCase() === activeContact.toLowerCase()
      );
      const list = messagesByContact[activeContact] || [];
      const latestIncoming = [...list].reverse().find((message) => !message.mine);
      if (!contact?.conversationId || !latestIncoming || !markConversationRead) return;
      const conversationId = contact.conversationId;
      if (syncedReadRef.current.get(conversationId) === latestIncoming.id) return;
      syncedReadRef.current.set(conversationId, latestIncoming.id);
      void markConversationRead(conversationId, latestIncoming.id)
        .then(() => reconcileInbox())
        .catch(() => syncedReadRef.current.delete(conversationId));
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [activeContact, markConversationRead, messagesByContact, reconcileInbox]);

  // Consume a shared contact link once, then remove the username from browser
  // history so private contact metadata is not retained in the address bar.
  useEffect(() => {
    if (localStorage.getItem("solink:stealthDefault") === "1") setStealth(true);
    const url = new URL(window.location.href);
    const c = url.searchParams.get("c");
    if (c) {
      connectTo(c);
      url.searchParams.delete("c");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // one transport per active conversation
  useEffect(() => {
    if (!activeContact) return;
    setConnecting(true);
    setPeerName("");
    setSimulated(false);
    setError(null);
    setPeerTyping(false);
    setReplyingTo(null);
    setPeerOnline(false);
    setPeerAvatar(null);
    setLastSeen(null);
    setReactionsByMsg({});
    markedRef.current = new Set();
    loadingInitialHistoryRef.current = false;
    animatedMessageIdsRef.current = new Set();

    const events: TransportEvents = {
      onPeer: (pn, sim, avatarUrl) => {
        setPeerName(pn);
        setSimulated(sim);
        setPeerAvatar(avatarUrl ?? null);
        setConnecting(false);
        loadingInitialHistoryRef.current = false;
        // Keep the sidebar row's avatar in sync with what the transport fetched.
        if (avatarUrl !== undefined) {
          setContacts((prev) =>
            prev.map((c) =>
              c.username.toLowerCase() === activeContact.toLowerCase()
                ? { ...c, avatarUrl: avatarUrl ?? null }
                : c
            )
          );
        }
      },
      onMessage: (raw, payload, mine) => {
        const { text, replyTo, attachment } = decodeMessage(raw);
        const preview = text || (attachment ? "📎 " + attachment.name : "");
        setPeerTyping(false);
        if (!loadingInitialHistoryRef.current) animatedMessageIdsRef.current.add(payload.id);
        setMessagesByContact((prev) => {
          const list = prev[activeContact] || [];
          const duplicate = list.find((m) => m.id === payload.id);
          if (duplicate) {
            if (mine && duplicate.status) {
              return {
                ...prev,
                [activeContact]: list.map((message) =>
                  message.id === payload.id
                    ? { ...message, ts: payload.ts, status: undefined }
                    : message
                ),
              };
            }
            return prev;
          }
          // Keep chronological order so paged-in older messages land at the top.
          const next = [
            ...list,
            { id: payload.id, mine, text, ts: payload.ts, senderName: payload.senderName, replyTo, attachment },
          ].sort((a, b) => a.ts - b.ts);
          return { ...prev, [activeContact]: next };
        });
        if (!mine) {
          setContacts((prev) =>
            prev.map((c) =>
              c.username === activeContact
                ? { ...c, lastText: preview, lastActivity: Math.max(c.lastActivity || 0, payload.ts) }
                : c
            )
          );
          // Notify when the tab isn't focused.
          if (typeof document !== "undefined" && document.hidden) {
            const current = contactsRef.current.find(
              (contact) => contact.username.toLowerCase() === activeContact.toLowerCase()
            );
            const muted = !!current?.mutedUntil && current.mutedUntil > Date.now();
            if (!muted) playPing();
            if (!muted) {
              document.title =
                stealthRef.current || ideRef.current
                  ? DISGUISED_TITLE
                  : "● New message · Solink";
            }
            if (notifyRef.current && !muted) {
              // Disguise-aware: hide sender + content while in stealth or panic mode.
              showMessageNotification(activeContact, text, stealthRef.current || ideRef.current);
            }
          }
        }
      },
      onWireLog: (raw) => setLastWire(raw),
      onError: (msg) => {
        setError(msg);
        setConnecting(false);
      },
      onWarning: (msg) => {
        flash(msg);
        setConnecting(false);
      },
      onTyping: (isTyping) => {
        setPeerTyping(isTyping);
        if (typingClear.current) clearTimeout(typingClear.current);
        if (isTyping) {
          // Safety auto-clear in case a "stopped typing" event is missed.
          typingClear.current = setTimeout(() => setPeerTyping(false), 4000);
        }
      },
      onRead: (ids) => {
        setMessagesByContact((prev) => {
          const list = prev[activeContact] || [];
          let changed = false;
          const next = list.map((m) => {
            if (m.mine && !m.read && ids.includes(m.id)) {
              changed = true;
              return { ...m, read: true };
            }
            return m;
          });
          return changed ? { ...prev, [activeContact]: next } : prev;
        });
      },
      onPresence: (online, seen) => {
        setPeerOnline(online);
        if (!online && seen) setLastSeen(seen);
      },
      onReaction: (messageId, reactorId, emoji, mine) => {
        setReactionsByMsg((prev) => {
          const cur = { ...(prev[messageId] || {}) };
          if (emoji) cur[reactorId] = { emoji, mine };
          else delete cur[reactorId];
          return { ...prev, [messageId]: cur };
        });
      },
      onDeleted: (messageId) => {
        setMessagesByContact((prev) => {
          const list = prev[activeContact] || [];
          if (!list.some((m) => m.id === messageId)) return prev;
          return { ...prev, [activeContact]: list.filter((m) => m.id !== messageId) };
        });
      },
    };

    const t = makeTransportRef.current(activeContact, events);
    loadingInitialHistoryRef.current = true;
    transportRef.current = t;
    void t.start();
    return () => {
      t.destroy();
      transportRef.current = null;
    };
  }, [activeContact]);

  // ---- groups ----
  const makeGroupRef = useRef(makeGroupTransport);
  makeGroupRef.current = makeGroupTransport;

  // Load the user's groups once.
  useEffect(() => {
    if (!listGroups) return;
    listGroups().then(setGroups).catch(() => {});
  }, [listGroups]);

  // Opening a 1-on-1 chat closes any open group, and vice versa.
  useEffect(() => {
    if (activeContact) setActiveGroupId(null);
  }, [activeContact]);

  // One group transport per active group. Fully separate from the 1-on-1 path.
  useEffect(() => {
    if (!activeGroupId || !makeGroupRef.current) return;
    setGroupConnecting(true);
    setGroupName("");
    setGroupMembers([]);
    setGroupMsgs([]);
    const events: GroupEvents = {
      onReady: (name, members) => {
        setGroupName(name);
        setGroupMembers(members);
        setGroupConnecting(false);
      },
      onMessage: (text, payload, mine) => {
        setGroupMsgs((prev) => {
          if (prev.some((m) => m.id === payload.id)) return prev;
          return [
            ...prev,
            { id: payload.id, mine, text, ts: payload.ts, senderName: payload.senderName },
          ].sort((a, b) => a.ts - b.ts);
        });
      },
      onError: (msg) => {
        flash(msg);
        setGroupConnecting(false);
      },
    };
    const t = makeGroupRef.current(activeGroupId, events);
    groupTransportRef.current = t;
    void t.start();
    return () => {
      t.destroy();
      groupTransportRef.current = null;
    };
  }, [activeGroupId]);

  function openGroup(id: string) {
    setActiveContact(null);
    setActiveGroupId(id);
  }

  async function sendGroup(text: string) {
    const t = groupTransportRef.current;
    if (!t) return;
    atBottomRef.current = true;
    const tempId = "tmp-" + crypto.randomUUID();
    const ts = Date.now();
    setGroupMsgs((prev) => [
      ...prev,
      { id: tempId, mine: true, text, ts, senderName: myName, status: "sending" },
    ]);
    const payload = await t.send(text);
    setGroupMsgs((prev) =>
      prev.map((m) =>
        m.id === tempId
          ? payload
            ? { ...m, id: payload.id, ts: payload.ts, status: undefined }
            : { ...m, status: "failed" }
          : m
      )
    );
  }

  async function handleCreateGroup(name: string, members: string[]) {
    if (!createGroup) return;
    const g = await createGroup(name, members);
    if (!g) {
      flash("Couldn't create group");
      return;
    }
    setGroups((prev) => [g, ...prev.filter((x) => x.id !== g.id)]);
    setNewGroupOpen(false);
    openGroup(g.id);
  }

  // Use normal branding during regular chat and disguise the tab only while a
  // privacy mode is active. Returning to the tab also clears notification dots.
  useEffect(() => {
    const restoreTitle = () => {
      document.title = ideRef.current || stealthRef.current ? DISGUISED_TITLE : SOLINK_TITLE;
    };
    const onVisibility = () => {
      if (!document.hidden) restoreTitle();
    };
    restoreTitle();
    window.addEventListener("focus", restoreTitle);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", restoreTitle);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ide, stealth]);

  // global hotkeys
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && (e.key === "." || e.code === "Period")) {
        e.preventDefault();
        setIde((v) => !v);
      }
      if (e.ctrlKey && e.shiftKey && (e.key === "," || e.code === "Comma")) {
        e.preventDefault();
        setStealth((v) => !v);
      }
      if (e.key === "Escape") setIde(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-stealth: when you switch tabs / the window loses focus, disguise the chat
  // as code; restore your previous view when you return. Opt-in via Settings.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("solink:autoStealth") !== "1") return;
    let saved = false;
    const hide = () => {
      saved = stealthRef.current;
      setStealth(true);
    };
    const show = () => setStealth(saved);
    const onVis = () => (document.hidden ? hide() : show());
    window.addEventListener("blur", hide);
    window.addEventListener("focus", show);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", show);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Auto-scroll only when the user is already near the bottom (or just sent something).
  useEffect(() => {
    if (atBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, peerTyping]);

  // Lock the page while the chat app is mounted so iOS can't rubber-band or
  // scroll-jump when an input is focused. Scoped to a body class so other
  // routes stay scrollable.
  useEffect(() => {
    document.body.classList.add("chat-locked");
    return () => document.body.classList.remove("chat-locked");
  }, []);

  // When the on-screen keyboard opens/closes the visual viewport resizes; if the
  // user was pinned to the latest message, keep them there (no smooth-scroll —
  // it should track the keyboard instantly).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      if (atBottomRef.current) {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  // Complete a pending image forward once the target chat's transport is ready.
  useEffect(() => {
    if (!pendingForward) return;
    if (activeContact !== pendingForward.target || !peerName) return;
    const { file } = pendingForward;
    setPendingForward(null);
    void sendFile(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingForward, activeContact, peerName]);

  // Mark the peer's messages as read while the chat is open and the tab is visible.
  useEffect(() => {
    if (!activeContact) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const list = messagesByContact[activeContact] || [];
    const unread = list.filter((m) => !m.mine && !markedRef.current.has(m.id)).map((m) => m.id);
    if (unread.length && transportRef.current?.markRead) {
      unread.forEach((id) => markedRef.current.add(id));
      transportRef.current.markRead(unread);
    }
  }, [messagesByContact, activeContact]);

  // Opening a chat always starts pinned to the latest message.
  useEffect(() => {
    if (!activeContact) return;
    atBottomRef.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeContact]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = dist < 80;
    setShowScrollBtn(dist > 240);
    // Near the top: page in older history, preserving the scroll position.
    if (el.scrollTop < 60 && !loadingOlderRef.current) {
      const t = transportRef.current;
      if (t?.loadOlder) {
        loadingOlderRef.current = true;
        setLoadingOlder(true);
        restoreScrollRef.current = el.scrollHeight;
        void t.loadOlder().then((n) => {
          if (n === 0) restoreScrollRef.current = null;
          loadingOlderRef.current = false;
          setLoadingOlder(false);
        });
      }
    }
  }

  // After older messages prepend, keep the viewport anchored (no jump).
  useLayoutEffect(() => {
    if (restoreScrollRef.current == null) return;
    const el = scrollRef.current;
    if (el) el.scrollTop += el.scrollHeight - restoreScrollRef.current;
    restoreScrollRef.current = null;
  }, [messages.length]);

  function scrollToBottom() {
    atBottomRef.current = true;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }

  async function send(text: string) {
    const t = transportRef.current;
    if (!t || !activeContact) return;
    const contact = activeContact;
    const reply: ReplyRef | undefined = replyingTo
      ? { id: replyingTo.id, preview: replyingTo.text.slice(0, 90), mine: replyingTo.mine }
      : undefined;
    setReplyingTo(null);
    atBottomRef.current = true;

    // Optimistic: show the bubble immediately in a "sending" state, then reconcile
    // to the server id on success or mark it "failed" (tap-to-retry) on failure.
    const tempId = crypto.randomUUID();
    const ts = Date.now();
    animatedMessageIdsRef.current.add(tempId);
    setMessagesByContact((prev) => ({
      ...prev,
      [contact]: [
        ...(prev[contact] || []),
        { id: tempId, mine: true, text, ts, senderName: myName, replyTo: reply, status: "sending" },
      ],
    }));
    setContacts((prev) =>
      prev.map((c) => (c.username === contact ? { ...c, lastText: text, lastActivity: ts } : c))
    );

    const result = await t.send(encodeMessage(text, reply), tempId);
    setMessagesByContact((prev) => {
      const list = prev[contact] || [];
      return {
        ...prev,
        [contact]: list.map((m) =>
          m.id === tempId
            ? result.state === "sent"
              ? (() => {
                  animatedMessageIdsRef.current.delete(tempId);
                  animatedMessageIdsRef.current.add(result.payload.id);
                  return { ...m, id: result.payload.id, ts: result.payload.ts, status: undefined };
                })()
              : { ...m, status: result.state === "queued" ? "queued" : "failed" }
            : m
        ),
      };
    });
  }

  // Re-send a message that previously failed (tap the ⚠ bubble).
  async function retryMessage(m: ChatMessage) {
    const t = transportRef.current;
    if (!t || !activeContact || (m.status !== "failed" && m.status !== "queued")) return;
    const contact = activeContact;
    setMessagesByContact((prev) => ({
      ...prev,
      [contact]: (prev[contact] || []).map((x) => (x.id === m.id ? { ...x, status: "sending" } : x)),
    }));
    const reply = m.replyTo;
    const result = await t.send(encodeMessage(m.text, reply), m.id);
    setMessagesByContact((prev) => {
      const list = prev[contact] || [];
      return {
        ...prev,
        [contact]: list.map((x) =>
          x.id === m.id
            ? result.state === "sent"
              ? { ...x, id: result.payload.id, ts: result.payload.ts, status: undefined }
              : { ...x, status: result.state === "queued" ? "queued" : "failed" }
            : x
        ),
      };
    });
  }

  // Unsend one of our own messages (removes it for us + the peer).
  async function deleteMessage(m: ChatMessage) {
    if (!m.mine || !activeContact) return;
    const contact = activeContact;
    const snapshot = messagesByContact[contact] || [];
    // Optimistic removal.
    setMessagesByContact((prev) => ({
      ...prev,
      [contact]: (prev[contact] || []).filter((x) => x.id !== m.id),
    }));
    // A failed/never-sent message has no server row — just drop it locally.
    if (m.status === "failed") return;
    const t = transportRef.current;
    const ok = t?.deleteMessage ? await t.deleteMessage(m.id) : false;
    if (!ok) {
      // Roll back if the server refused.
      setMessagesByContact((prev) => ({ ...prev, [contact]: snapshot }));
      flash("Couldn't delete message");
    }
  }

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  }

  async function sendFile(file: File) {
    const t = transportRef.current;
    if (!t || !activeContact || !t.sendAttachment) return;
    const MAX = 15 * 1024 * 1024;
    if (file.size > MAX) {
      flash("File too large (max 15 MB)");
      return;
    }
    flash(`Encrypting ${file.name}…`);
    const bytes = await file.arrayBuffer();
    atBottomRef.current = true;
    const res = await t.sendAttachment(
      bytes,
      { name: file.name, mime: file.type || "application/octet-stream", size: file.size },
      ""
    );
    setNotice(null);
    if (!res) {
      flash("Couldn't send file");
      return;
    }
    setMessagesByContact((prev) => {
      const list = prev[activeContact] || [];
      if (list.some((m) => m.id === res.payload.id)) return prev;
      return {
        ...prev,
        [activeContact]: [
          ...list,
          { id: res.payload.id, mine: true, text: "", ts: res.payload.ts, senderName: myName, attachment: res.attachment },
        ],
      };
    });
    const preview = file.type.startsWith("audio/")
      ? "🎙️ Voice message"
      : file.type.startsWith("image/")
        ? "📷 Photo"
        : "📎 " + file.name;
    setContacts((prev) =>
      prev.map((c) => (c.username === activeContact ? { ...c, lastText: preview } : c))
    );
  }

  // Intercept image attachments so the user can crop/edit before sending.
  // Non-images go straight through. Forwarded images reuse sendFile directly.
  function handleAttach(file: File) {
    if (file.type.startsWith("image/")) setCropState({ file });
    else void sendFile(file);
  }

  const resolveAttachment = useCallback((ref: AttachmentRef) => {
    const t = transportRef.current;
    return t?.resolveAttachment ? t.resolveAttachment(ref) : Promise.resolve(null);
  }, []);

  function aggregateReactions(messageId: string): ReactionSummary[] | undefined {
    const map = reactionsByMsg[messageId];
    if (!map) return undefined;
    const byEmoji: Record<string, { count: number; mine: boolean }> = {};
    for (const { emoji, mine } of Object.values(map)) {
      if (!byEmoji[emoji]) byEmoji[emoji] = { count: 0, mine: false };
      byEmoji[emoji].count++;
      if (mine) byEmoji[emoji].mine = true;
    }
    const arr = Object.entries(byEmoji).map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine }));
    return arr.length ? arr : undefined;
  }

  async function forwardImage(target: string) {
    if (!lightbox) return;
    const src = lightbox;
    setLightbox(null);
    try {
      const blob = await fetch(src.url).then((r) => r.blob());
      const file = new File([blob], src.name || "image.jpg", { type: blob.type || "image/jpeg" });
      setPendingForward({ file, target });
      await connectTo(target); // opens the target chat (it's an existing contact)
    } catch {
      flash("Couldn't forward image");
    }
  }

  function react(messageId: string, emoji: string) {
    const t = transportRef.current;
    if (!t?.sendReaction) return;
    const mineCur = Object.values(reactionsByMsg[messageId] || {}).find((r) => r.mine);
    const next = mineCur?.emoji === emoji ? "" : emoji;
    t.sendReaction(messageId, next);
  }

  async function connectTo(username: string): Promise<string | null> {
    const clean = username.trim();
    if (!clean) return null;
    if (clean.toLowerCase() === myName.toLowerCase()) return "That's your own username";
    // A blocked user can only be restored after an explicit confirmation.
    if (blockedRef.current.has(clean.toLowerCase())) {
      if (loadBlockedUsers && !blockedReadyRef.current) {
        return "Privacy settings are still syncing. Try again.";
      }
      if (!confirm(`Unblock @${clean} and allow messages again?`)) return `@${clean} is blocked`;
      if (!(await unblock(clean))) return `Couldn't unblock @${clean}`;
      flash(`Unblocked @${clean}`);
    }
    // already a contact → just open it
    const existing = contacts.find((c) => c.username.toLowerCase() === clean.toLowerCase());
    if (existing) {
      setActiveContact(existing.username);
      return null;
    }
    // Resolve the canonical username + avatar (cloud). lookupUser also gates on
    // existence; fall back to validateUsername, then to the raw input (demo).
    let canonical = clean;
    let avatarUrl: string | null | undefined = undefined;
    if (lookupUser) {
      const found = await lookupUser(clean).catch(() => null);
      if (!found) return `No user named @${clean}`;
      canonical = found.username;
      avatarUrl = found.avatarUrl;
      const dup = contacts.find((c) => c.username.toLowerCase() === canonical.toLowerCase());
      if (dup) {
        setActiveContact(dup.username);
        return null;
      }
    } else if (validateUsername) {
      const ok = await validateUsername(clean).catch(() => false);
      if (!ok) return `No user named @${clean}`;
    }
    setContacts((prev) => {
      if (prev.some((c) => c.username.toLowerCase() === canonical.toLowerCase())) return prev;
      const next = [{ username: canonical, avatarUrl, lastActivity: Date.now() }, ...prev];
      persistContacts(next);
      return next;
    });
    setActiveContact(canonical);
    return null;
  }

  if (ide) {
    return (
      <BossModeIDE messages={messages} peerName={peerName} onSend={send} onExit={() => setIde(false)} />
    );
  }

  return (
    <main className="h-app flex overflow-hidden">
      <Sidebar
        myName={myName}
        myAvatarUrl={myAvatarUrl}
        contacts={[...contacts].sort((a, b) =>
          Number(!!b.pinned) - Number(!!a.pinned) || (b.lastActivity || 0) - (a.lastActivity || 0)
        )}
        activeContact={activeContact}
        onSelect={setActiveContact}
        onConnect={connectTo}
        onLookup={lookupUser}
        onSignOut={onSignOut}
        groups={groups}
        activeGroupId={activeGroupId}
        onSelectGroup={openGroup}
        onNewGroup={createGroup ? () => setNewGroupOpen(true) : undefined}
        className={`md:w-80 md:shrink-0 ${activeContact || activeGroupId ? "hidden md:flex" : "flex"}`}
      />

      <section
        key={activeGroupId || activeContact || "none"}
        className={`chat-enter relative min-w-0 flex-1 flex-col ${activeContact || activeGroupId ? "flex" : "hidden md:flex"}`}
      >
        {activeGroupId ? (
          <GroupChatView
            name={groupName}
            members={groupMembers}
            messages={groupMsgs}
            connecting={groupConnecting}
            myName={myName}
            onBack={() => setActiveGroupId(null)}
            onSend={sendGroup}
          />
        ) : !activeContact ? (
          <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 text-center">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(217,119,87,0.08),transparent_42%)]" />
            <div className="relative flex max-w-sm flex-col items-center">
              <div className="mb-6 rounded-[28px] border border-brand-border bg-brand-surface/70 p-5 shadow-2xl shadow-black/20 backdrop-blur">
                <LogoMark size={62} />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-brand-text">Your conversations, together</h2>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-brand-muted">
                Choose a chat from the sidebar or find someone by username. Messages stay encrypted on every linked device.
              </p>
              <div className="mt-6 flex items-center gap-2 rounded-full border border-brand-border bg-brand-surface/50 px-3 py-1.5 text-[11px] text-brand-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-online" /> End-to-end encrypted
              </div>
            </div>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-2 border-b border-brand-border bg-brand-surface/70 px-2.5 pb-2.5 pt-[calc(0.625rem+var(--safe-top))] backdrop-blur sm:gap-3 sm:px-4">
              <button
                onClick={() => setActiveContact(null)}
                className="pressable grid h-10 w-10 shrink-0 place-items-center rounded-full text-brand-muted hover:bg-white/5 md:hidden"
                aria-label="Back to chats"
              >
                ←
              </button>
              <div className="hidden sm:block">
                <Avatar name={activeContact} size={40} online={peerOnline} bot={simulated} src={peerAvatar} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-brand-text">{activeContact}</div>
                <div className="truncate font-mono text-[11px] text-brand-muted">
                  {error ? (
                    <span className="text-red-400">{error}</span>
                  ) : peerTyping ? (
                    <span className="text-brand-accent">typing…</span>
                  ) : connecting ? (
                    <span className="text-brand-faint">connecting…</span>
                  ) : peerOnline ? (
                    <span className="text-brand-online">online</span>
                  ) : lastSeen ? (
                    <span className="text-brand-faint">
                      last seen {new Date(lastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  ) : simulated ? (
                    <span className="text-brand-accent">demo peer · encrypted</span>
                  ) : peerName ? (
                    <span className="text-brand-online">🔒 end-to-end encrypted</span>
                  ) : (
                    <span className="text-brand-faint">waiting for peer…</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => {
                    setSearchOpen((v) => !v);
                    setSearchQuery("");
                  }}
                  className={`pressable hidden h-10 w-10 place-items-center rounded-full text-xs font-medium transition sm:grid ${
                    searchOpen ? "bg-brand-accent/20 text-brand-accent" : "text-brand-faint hover:bg-white/5"
                  }`}
                  title="Search messages"
                  aria-label="Search messages"
                >
                  🔍
                </button>
                <button
                  onClick={toggleNotify}
                  className={`pressable hidden h-10 w-10 place-items-center rounded-full text-xs font-medium transition md:grid ${
                    notifyOn ? "bg-brand-accent/20 text-brand-accent" : "text-brand-faint hover:bg-white/5"
                  }`}
                  title={notifyOn ? "Notifications on" : "Enable notifications"}
                  aria-label={notifyOn ? "Disable notifications" : "Enable notifications"}
                >
                  {notifyOn ? "🔔" : "🔕"}
                </button>
                <button
                  onClick={() => setShowWire((v) => !v)}
                  className={`pressable hidden h-10 w-10 place-items-center rounded-full text-xs font-medium transition lg:grid ${
                    showWire ? "bg-white/5 text-brand-muted" : "text-brand-faint hover:bg-white/5"
                  }`}
                  title="Toggle the encrypted-wire preview"
                  aria-label="Toggle encrypted wire preview"
                >
                  🛡
                </button>
                <button
                  onClick={() => setStealth((v) => !v)}
                  className={`pressable hidden h-10 w-10 place-items-center rounded-full text-xs font-medium transition lg:grid ${
                    stealth ? "bg-brand-accent text-white" : "bg-white/5 text-brand-muted hover:bg-white/10"
                  }`}
                  title="Stealth (Ctrl+Shift+,)"
                  aria-label={stealth ? "Exit stealth mode" : "Enter stealth mode"}
                >
                  {stealth ? "🥷" : "🕶"}
                </button>
                <button
                  onClick={() => setIde(true)}
                  className="pressable hidden h-10 w-10 place-items-center rounded-full bg-white/5 text-xs font-medium text-brand-muted transition hover:bg-white/10 lg:grid"
                  title="Panic → IDE (Ctrl+Shift+.)"
                  aria-label="Open panic mode"
                >
                  🚨
                </button>
                <div className="relative">
                  <button
                    onClick={() => setHeaderMenuOpen((v) => !v)}
                    className={`pressable grid h-10 w-10 place-items-center rounded-full text-lg font-medium transition ${
                      headerMenuOpen ? "bg-white/10 text-brand-text" : "text-brand-faint hover:bg-white/5"
                    }`}
                    title="More"
                    aria-label="Chat options"
                    aria-expanded={headerMenuOpen}
                  >
                    ⋯
                  </button>
                  {headerMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setHeaderMenuOpen(false)} />
                      <div className="pop-in absolute right-0 top-11 z-30 w-52 overflow-hidden rounded-xl border border-brand-border bg-brand-surface2 shadow-2xl">
                        {(() => {
                          const current = contacts.find(
                            (item) => item.username.toLowerCase() === activeContact.toLowerCase()
                          );
                          if (!current?.conversationId) return null;
                          const muted = !!current.mutedUntil && current.mutedUntil > Date.now();
                          return (
                            <>
                              <button
                                onClick={() => {
                                  setHeaderMenuOpen(false);
                                  void updateActiveConversation("pin", !current.pinned);
                                }}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-brand-text hover:bg-white/5"
                              >
                                <span>📌</span> {current.pinned ? "Unpin chat" : "Pin chat"}
                              </button>
                              <button
                                onClick={() => {
                                  setHeaderMenuOpen(false);
                                  void updateActiveConversation(
                                    "mute",
                                    muted ? null : Date.now() + 1000 * 60 * 60 * 24 * 365 * 10
                                  );
                                }}
                                className="flex w-full items-center gap-3 border-t border-brand-border px-4 py-2.5 text-left text-sm text-brand-text hover:bg-white/5"
                              >
                                <span>🔕</span> {muted ? "Unmute chat" : "Mute chat"}
                              </button>
                              <button
                                onClick={() => {
                                  setHeaderMenuOpen(false);
                                  void updateActiveConversation("archive", !current.archived);
                                }}
                                className="flex w-full items-center gap-3 border-t border-brand-border px-4 py-2.5 text-left text-sm text-brand-text hover:bg-white/5"
                              >
                                <span>🗄️</span> {current.archived ? "Unarchive chat" : "Archive chat"}
                              </button>
                            </>
                          );
                        })()}
                        <button
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            setSearchOpen(true);
                            setSearchQuery("");
                          }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-brand-text hover:bg-white/5 sm:hidden"
                        >
                          <span>🔍</span> Search messages
                        </button>
                        <button
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            void toggleNotify();
                          }}
                          className="flex w-full items-center gap-3 border-t border-brand-border px-4 py-2.5 text-left text-sm text-brand-text hover:bg-white/5 md:hidden"
                        >
                          <span>{notifyOn ? "🔔" : "🔕"}</span> {notifyOn ? "Notifications on" : "Enable notifications"}
                        </button>
                        <button
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            setShowWire((value) => !value);
                          }}
                          className="flex w-full items-center gap-3 border-t border-brand-border px-4 py-2.5 text-left text-sm text-brand-text hover:bg-white/5 lg:hidden"
                        >
                          <span>🛡</span> {showWire ? "Hide encrypted wire" : "Show encrypted wire"}
                        </button>
                        <button
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            setStealth((value) => !value);
                          }}
                          className="flex w-full items-center gap-3 border-t border-brand-border px-4 py-2.5 text-left text-sm text-brand-text hover:bg-white/5 lg:hidden"
                        >
                          <span>{stealth ? "🥷" : "🕶"}</span> {stealth ? "Exit stealth" : "Stealth mode"}
                        </button>
                        <button
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            setIde(true);
                          }}
                          className="flex w-full items-center gap-3 border-t border-brand-border px-4 py-2.5 text-left text-sm text-brand-text hover:bg-white/5 lg:hidden"
                        >
                          <span>🚨</span> Panic mode
                        </button>
                        {!setConversationArchived && (
                          <button
                            onClick={() => {
                              setHeaderMenuOpen(false);
                              if (confirm(`Remove your chat with @${activeContact}? Your local history is cleared.`))
                                removeContact(activeContact);
                            }}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-brand-text hover:bg-white/5"
                          >
                            <span>🗑️</span> Remove local chat
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            if (confirm(`Block @${activeContact}? They won't be able to message you.`))
                              void blockContact(activeContact);
                          }}
                          className="flex w-full items-center gap-3 border-t border-brand-border px-4 py-2.5 text-left text-sm text-red-400 hover:bg-white/5"
                        >
                          <span>🚫</span> Block @{activeContact}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </header>

            {searchOpen && (
              <div className="border-b border-brand-border bg-brand-surface/70 px-3 py-2 backdrop-blur">
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search in this chat…"
                  className="w-full rounded-full border border-brand-border bg-black/25 px-4 py-2 text-sm text-brand-text outline-none focus:border-brand-accent"
                />
              </div>
            )}

            <div
              ref={scrollRef}
              onScroll={onScroll}
              className={`flex-1 overflow-y-auto overscroll-contain ${
                stealth ? "bg-ide-bg py-2" : "px-3 py-4 sm:px-5"
              }`}
            >
              {loadingOlder && !stealth && (
                <div className="mb-2 flex justify-center">
                  <span className="rounded-full bg-brand-surface2/80 px-3 py-1 text-[11px] text-brand-muted">
                    loading older…
                  </span>
                </div>
              )}
              {connecting && messages.length === 0 && !error && !stealth && (
                <div className="space-y-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`skeleton h-9 rounded-2xl ${
                          i % 2 ? "rounded-br-sm" : "rounded-bl-sm"
                        }`}
                        style={{ width: `${120 + ((i * 47) % 130)}px` }}
                      />
                    </div>
                  ))}
                </div>
              )}
              {!connecting && messages.length === 0 && !error && (
                <div className="mt-12 text-center text-sm text-brand-faint">
                  {stealth
                    ? "// no entries yet — tap a line to reveal"
                    : "Messages are encrypted before they leave this tab 🔒"}
                </div>
              )}
              {error && messages.length === 0 && (
                <div className="mx-auto mt-12 max-w-xs rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
                  {error}
                </div>
              )}
              {searchOpen && searchQuery.trim() && !stealth && messages.filter((m) => m.text.toLowerCase().includes(searchQuery.trim().toLowerCase())).length === 0 && (
                <div className="mt-10 text-center text-sm text-brand-faint">No messages match “{searchQuery.trim()}”</div>
              )}
              {stealth
                ? messages.map((m, i) => (
                    <CodeSnippet key={m.id} id={m.id} text={m.text} mine={m.mine} lineNumber={i + 1} />
                  ))
                : (searchOpen && searchQuery.trim()
                    ? messages.filter((m) => m.text.toLowerCase().includes(searchQuery.trim().toLowerCase()))
                    : messages
                  ).map((m, i, arr) => {
                    const prev = arr[i - 1];
                    const showDay = !prev || !sameDay(prev.ts, m.ts);
                    const grouped =
                      !!prev &&
                      prev.mine === m.mine &&
                      !showDay &&
                      m.ts - prev.ts < 5 * 60 * 1000;
                    return (
                      <div key={m.id}>
                        {showDay && (
                          <div className="my-3 flex justify-center">
                            <span className="rounded-full bg-brand-surface2/80 px-3 py-1 text-[11px] text-brand-muted">
                              {dayLabel(m.ts)}
                            </span>
                          </div>
                        )}
                        <MessageBubble
                          msg={m}
                          animate={animatedMessageIdsRef.current.has(m.id)}
                          grouped={grouped}
                          onReply={setReplyingTo}
                          resolveAttachment={resolveAttachment}
                          reactions={aggregateReactions(m.id)}
                          onReact={(e) => react(m.id, e)}
                          onOpenImage={(url, name) => setLightbox({ url, name })}
                          onRetry={() => retryMessage(m)}
                          onDelete={() => deleteMessage(m)}
                        />
                      </div>
                    );
                  })}
              {!stealth && peerTyping && (
                <div className="mt-2">
                  <TypingDots />
                </div>
              )}
            </div>

            {showScrollBtn && !stealth && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-28 right-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-brand-border bg-brand-surface2 text-brand-text shadow-lg transition hover:bg-brand-surface"
                aria-label="Scroll to latest"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            {showWire && lastWire && (
              <div className="flex items-center gap-2 border-t border-brand-border bg-black/30 px-4 py-1 font-mono text-[10px] text-brand-faint">
                <span className="text-brand-online/80">wire ▸</span>
                <span className="truncate">{lastWire.slice(0, 80)}…</span>
              </div>
            )}

            {replyingTo && (
              <div className="flex items-center gap-2 border-t border-brand-border bg-brand-surface/70 px-3 py-2 backdrop-blur">
                <div className="w-1 self-stretch rounded-full bg-brand-accent" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium text-brand-accent">
                    Replying to {replyingTo.mine ? "yourself" : activeContact}
                  </div>
                  <div className="truncate text-xs text-brand-muted">{replyingTo.text}</div>
                </div>
                <button
                  onClick={() => setReplyingTo(null)}
                  className="rounded-full p-1 text-brand-muted hover:bg-white/10 hover:text-brand-text"
                  aria-label="Cancel reply"
                >
                  ✕
                </button>
              </div>
            )}

            {notice && (
              <div className="border-t border-brand-border bg-brand-accent/10 px-4 py-1.5 text-center text-xs text-brand-accent">
                {notice}
              </div>
            )}

            <Composer
              onSend={send}
              onTyping={(t) => transportRef.current?.sendTyping?.(t)}
              onAttach={handleAttach}
              disabled={!!error}
            />
          </>
        )}
      </section>

      {cropState && (
        <ImageCropper
          file={cropState.file}
          title="Edit photo"
          onCancel={() => setCropState(null)}
          onDone={(blob) => {
            const base = (cropState.file.name.replace(/\.[^.]+$/, "") || "photo").slice(0, 40);
            const f = new File([blob], `${base}.jpg`, { type: "image/jpeg" });
            setCropState(null);
            void sendFile(f);
          }}
        />
      )}

      {lightbox && (
        <ImageLightbox
          url={lightbox.url}
          name={lightbox.name}
          contacts={contacts.map((c) => c.username).filter((u) => u !== activeContact)}
          onForward={forwardImage}
          onClose={() => setLightbox(null)}
        />
      )}

      {newGroupOpen && (
        <NewGroupModal
          contacts={contacts.map((c) => c.username)}
          onCancel={() => setNewGroupOpen(false)}
          onCreate={handleCreateGroup}
        />
      )}
    </main>
  );
}
