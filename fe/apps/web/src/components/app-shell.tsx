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
} from "lucide-react";
import { coupleApi, queryKeys } from "@couple/api";
import { AppError, initials, safeNext, type Context } from "@couple/domain";
import { browserClient } from "@/lib/supabase/client";
import { Loading, Notice } from "./ui";
import { appName } from "@couple/theme";
const client = () => browserClient();
type AppValue = {
  context: Context;
  userId: string;
  email: string;
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
  const coupleId = ctx?.couple?.id;
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
    else if (!coupleId && ["/home", "/history", "/memories"].includes(pathname))
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
    (!coupleId && ["/home", "/history", "/memories"].includes(pathname))
  )
    return <Loading />;
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: [userId] });
  };
  return (
    <AppContext.Provider value={{ context: ctx, userId, email, refresh }}>
      <div className="app-layout">
        <aside className="sidebar">
          <Link href="/home" className="wordmark">
            {appName}
            <Heart size={19} />
          </Link>
          <span className="sidebar-caption">THƯ GỬI NGƯỜI THƯƠNG</span>
          <nav aria-label="Điều hướng chính">
            {navigation.map(({ href, label, icon: Icon }) => (
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
              </Link>
            ))}
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
              <Link href="/settings" className="profile-link">
                <span className="avatar">
                  {initials(ctx.profile.displayName)}
                </span>
                <span>Xin chào, {ctx.profile.displayName || "cậu"}</span>
              </Link>
            </div>
          </header>
          <main
            id="main"
            className="main-content"
            key={`${userId}:${coupleId ?? "unpaired"}`}
          >
            <Notice error={signoutError} />
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
            </Link>
          ))}
        </nav>
      </div>
    </AppContext.Provider>
  );
}
