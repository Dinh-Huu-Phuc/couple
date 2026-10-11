"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Heart,
  House,
  Mail,
  BookOpen,
  ImageIcon,
  Settings,
  LogOut,
  RefreshCw,
  CircleHelp,
  UserRound,
  MessageCircle,
} from "lucide-react";
import { coupleApi, queryKeys } from "@couple/api";
import {
  type LetterActivity,
  AppError,
  initials,
  safeNext,
  type Context,
} from "@couple/domain";
import { browserClient } from "@/lib/supabase/client";
import { Loading, Notice } from "./ui";
import { appName } from "@couple/theme";
import { inactivityStatus } from "@/lib/inactivity";
import { ThemeMenu } from "./theme";
const client = () => browserClient();
type AppValue = {
  context: Context;
  userId: string;
  email: string;
  pendingWishCount: number;
  letterActivity: LetterActivity[];
  refresh: () => Promise<void>;
};
const AppContext = createContext<AppValue | null>(null);
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("Missing app context");
  return { ...value, api: coupleApi(client()), client: client() };
}
const navigation = [
  { href: "/home", label: "Hai mình", icon: House },
  { href: "/wishes", label: "Hộp của tớ", icon: Mail },
  { href: "/history", label: "Đã mở", icon: BookOpen },
  { href: "/memories", label: "Kỷ niệm", icon: ImageIcon },
];
const pairedNavigation = [
  ...navigation.slice(0, 1),
  { href: "/chat", label: "Trò chuyện", icon: MessageCircle },
  ...navigation.slice(1),
];
export function AppShell({
  userId,
  email,
  children,
}: {
  userId: string;
  email: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const cache = useQueryClient();
  const oldCouple = useRef<string | null | undefined>(undefined);
  const [offline, setOffline] = useState(false);
  const [signoutError, setSignoutError] = useState<unknown>();
  const query = useQuery({
    queryKey: queryKeys.context(userId),
    queryFn: () => coupleApi(client()).context(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const ctx = query.data;
  const trackActivity = Boolean(ctx && !ctx.deletionPending);
  const inactivity = useQuery({
    queryKey: [userId, "inactivity"],
    queryFn: inactivityStatus,
    enabled: !!ctx && !ctx.deletionPending,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!trackActivity) return;
    let interactedAt = Date.now();
    const interact = () => {
      interactedAt = Date.now();
    };
    const touch = () => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine &&
        Date.now() - interactedAt < 10 * 60_000
      )
        void client().schema("api").rpc("touch_account_activity");
    };
    touch();
    const interval = window.setInterval(touch, 60_000);
    document.addEventListener("visibilitychange", touch);
    window.addEventListener("online", touch);
    window.addEventListener("pointerdown", interact);
    window.addEventListener("keydown", interact);
    window.addEventListener("scroll", interact, true);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", touch);
      window.removeEventListener("online", touch);
      window.removeEventListener("pointerdown", interact);
      window.removeEventListener("keydown", interact);
      window.removeEventListener("scroll", interact, true);
    };
  }, [userId, trackActivity]);
  const coupleId = ctx?.couple?.id;
  const pendingWishes = useQuery({
    queryKey: queryKeys.pendingPartnerWishes(userId, coupleId ?? null),
    queryFn: () => coupleApi(client()).pendingPartnerWishes(),
    enabled: !!coupleId && !!ctx?.emailVerified && !ctx?.deletionPending,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const activities = useQuery({
    queryKey: [userId, "letter-activity", coupleId ?? null],
    enabled: !!coupleId && !!ctx?.emailVerified && !ctx?.deletionPending,
    queryFn: () => coupleApi(client()).letterActivity(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const activityCount = (activities.data ?? []).filter(
    (row) => row.version > row.seen_version,
  ).length;
  useEffect(() => {
    if (!coupleId) return;
    let stopped = false;
    const receive = async () => {
      const { data, error } = await client()
        .from("chat_messages")
        .select("id")
        .eq("couple_id", coupleId)
        .neq("sender_id", userId)
        .is("delivered_at", null)
        .limit(100);
      if (!stopped && !error && data?.length)
        await coupleApi(client()).ackChatMessages(data.map((row) => row.id));
    };
    const safeReceive = () => {
      void receive().catch(() => undefined);
    };
    safeReceive();
    const interval = window.setInterval(safeReceive, 30_000);
    const channel = client()
      .channel(`delivery:${userId}:${coupleId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `couple_id=eq.${coupleId}`,
        },
        safeReceive,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") safeReceive();
      });
    window.addEventListener("online", safeReceive);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("online", safeReceive);
      void client().removeChannel(channel);
    };
  }, [userId, coupleId]);
  useEffect(() => {
    if (!coupleId) return;
    const channel = client()
      .channel(`letters:${userId}:${coupleId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "letter_activity",
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          void cache.invalidateQueries({
            queryKey: [userId, "letter-activity"],
          });
          void cache.invalidateQueries({
            queryKey: queryKeys.draws(userId, coupleId),
          });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void cache.invalidateQueries({
            queryKey: [userId, "letter-activity"],
          });
          void cache.invalidateQueries({
            queryKey: queryKeys.draws(userId, coupleId),
          });
        }
      });
    return () => {
      void client().removeChannel(channel);
    };
  }, [userId, coupleId, cache]);
  const pendingBadge = pendingWishes.data
    ? pendingWishes.data > 99
      ? "99+"
      : String(pendingWishes.data)
    : null;
  useEffect(() => {
    if (
      query.error instanceof AppError &&
      query.error.code === "UNAUTHENTICATED"
    ) {
      void cache.cancelQueries();
      cache.clear();
      void client().auth.signOut({ scope: "local" });
      router.replace("/login");
    }
  }, [query.error, cache, router]);
  useEffect(() => {
    const now = coupleId ?? null;
    if (ctx && oldCouple.current !== undefined && oldCouple.current !== now) {
      void cache.cancelQueries({
        predicate: (q) =>
          q.queryKey[0] === userId && q.queryKey[1] !== "context",
      });
      cache.removeQueries({
        predicate: (q) =>
          q.queryKey[0] === userId && q.queryKey[1] !== "context",
      });
      router.replace(now ? "/home" : "/connect");
    }
    if (ctx) oldCouple.current = now;
  }, [coupleId, ctx, userId, cache, router]);
  useEffect(() => {
    if (!ctx) return;
    if (ctx.deletionPending) {
      if (pathname !== "/settings") router.replace("/settings");
      return;
    }
    const current = safeNext(`${pathname}${window.location.search}`);
    if (!ctx.emailVerified)
      router.replace(`/verify-email?next=${encodeURIComponent(current)}`);
    else if (!ctx.profile.displayName && pathname !== "/onboarding")
      router.replace(`/onboarding?next=${encodeURIComponent(current)}`);
    else if (ctx.profile.displayName && pathname === "/onboarding")
      router.replace(
        safeNext(
          new URLSearchParams(window.location.search).get("next"),
          coupleId ? "/home" : "/connect",
        ),
      );
    else if (
      !coupleId &&
      ["/home", "/chat", "/history", "/memories"].includes(pathname)
    )
      router.replace("/connect");
  }, [ctx, pathname, coupleId, router]);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  async function signOut() {
    await cache.cancelQueries();
    cache.clear();
    const { error } = await client().auth.signOut();
    if (error) {
      setSignoutError(error);
      return;
    }
    router.replace("/login");
    router.refresh();
  }
  if (!ctx || query.isError)
    return (
      <main className="fatal">
        {query.isError ? (
          <Notice error={query.error} retry={() => void query.refetch()} />
        ) : (
          <Loading />
        )}
      </main>
    );
  if (
    (ctx.deletionPending && pathname !== "/settings") ||
    !ctx.emailVerified ||
    (!ctx.profile.displayName && pathname !== "/onboarding") ||
    (!coupleId &&
      ["/home", "/chat", "/history", "/memories"].includes(pathname))
  )
    return <Loading />;
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: [userId] });
  };
  return (
    <AppContext.Provider
      value={{
        context: ctx,
        userId,
        email,
        pendingWishCount: pendingWishes.data ?? 0,
        letterActivity: activities.data ?? [],
        refresh,
      }}
    >
      <div className="app-layout">
        <aside className="sidebar">
          <Link href="/home" className="wordmark">
            {appName}
            <Heart size={19} />
          </Link>
          <span className="sidebar-caption">THƯ GỬI NGƯỜI THƯƠNG</span>
          <nav aria-label="Điều hướng chính">
            {(coupleId ? pairedNavigation : navigation).map(
              ({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={
                    pathname === href ||
                    (href === "/home" && pathname === "/connect")
                      ? "page"
                      : undefined
                  }
                  className={
                    pathname === href ||
                    (href === "/home" && pathname === "/connect")
                      ? "active"
                      : ""
                  }
                >
                  <Icon size={20} />
                  <span>{label}</span>
                  {href === "/history" && activityCount > 0 && (
                    <span
                      className="pending-wish-badge"
                      aria-label={`${activityCount} thư có cập nhật mới`}
                    >
                      {activityCount > 99 ? "99+" : activityCount}
                    </span>
                  )}
                  {href === "/home" && pendingBadge && (
                    <span
                      className="pending-wish-badge"
                      aria-label={`${pendingWishes.data} mong muốn mới`}
                    >
                      {pendingBadge}
                    </span>
                  )}
                </Link>
              ),
            )}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-note">
              <Heart size={16} />
              <p>
                Một điều nhỏ hôm nay,
                <br />
                một kỷ niệm mai sau.
              </p>
            </div>
            <Link
              href="/support"
              className={pathname === "/support" ? "active" : ""}
            >
              <CircleHelp size={19} />
              Hỗ trợ & góp ý
            </Link>
            <Link
              href="/settings"
              className={pathname === "/settings" ? "active" : ""}
            >
              <Settings size={19} />
              Cài đặt
            </Link>
            <button onClick={signOut}>
              <LogOut size={19} />
              Đăng xuất
            </button>
          </div>
        </aside>
        <div className="app-main">
          <header className="topbar">
            <span className="topbar-note">
              Dành một chút dịu dàng cho nhau <Heart size={13} />
            </span>
            <div className="topbar-actions">
              <button
                className="icon-button"
                aria-label="Làm mới trạng thái"
                onClick={() => void refresh()}
              >
                <RefreshCw size={17} />
              </button>
              <ThemeMenu />
              {coupleId && (
                <Link
                  className="mobile-chat-link"
                  href="/chat"
                  aria-label="Mở trò chuyện"
                >
                  <MessageCircle size={18} />
                </Link>
              )}
              <details className="profile-menu">
                <summary
                  className="profile-link"
                  aria-label="Mở menu tài khoản"
                >
                  <span className="avatar">
                    {initials(ctx.profile.displayName)}
                  </span>
                  <span>Xin chào, {ctx.profile.displayName || "cậu"}</span>
                </summary>
                <div className="popover-menu account-menu">
                  <div className="account-menu-name">
                    <UserRound size={17} />
                    <span>
                      {ctx.profile.displayName || "Tài khoản của cậu"}
                      <small>{email}</small>
                    </span>
                  </div>
                  <Link href="/settings">
                    <Settings size={17} />
                    Cài đặt
                  </Link>
                  <Link href="/support">
                    <CircleHelp size={17} />
                    Hỗ trợ & góp ý
                  </Link>
                  <button type="button" onClick={() => void signOut()}>
                    <LogOut size={17} />
                    Đăng xuất
                  </button>
                </div>
              </details>
            </div>
          </header>
          <main
            id="main"
            className="main-content"
            key={`${userId}:${coupleId ?? "unpaired"}`}
          >
            <Notice error={signoutError} />
            {inactivity.data &&
              !inactivity.data.accepted &&
              pathname !== "/settings" && (
                <div className="notice" role="status">
                  COUPLE có quy định xoá tài khoản sau {inactivity.data.days}{" "}
                  ngày không hoạt động. Tài khoản của cậu chưa áp dụng cho đến
                  khi cậu chấp nhận. <Link href="/settings">Đọc quy định</Link>
                </div>
              )}
            {offline && (
              <Notice text="Đang mất mạng. Cậu kết nối lại trước khi gửi thay đổi nhé." />
            )}
            {children}
          </main>
          <footer className="app-footer">
            Một khoảng riêng. Chỉ hai mình.
            <Heart size={12} />
          </footer>
        </div>
        <nav className="bottom-tabs" aria-label="Điều hướng trên điện thoại">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className={pathname === href ? "active" : ""}
            >
              <Icon size={20} />
              <span>{label}</span>
              {href === "/history" && activityCount > 0 && (
                <span
                  className="pending-wish-badge"
                  aria-label={`${activityCount} thư có cập nhật mới`}
                >
                  {activityCount > 99 ? "99+" : activityCount}
                </span>
              )}
              {href === "/home" && pendingBadge && (
                <span
                  className="pending-wish-badge bottom"
                  aria-label={`${pendingWishes.data} mong muốn mới`}
                >
                  {pendingBadge}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>
    </AppContext.Provider>
  );
}
