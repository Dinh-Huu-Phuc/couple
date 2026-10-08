"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Check, Laptop, Moon, Sun } from "lucide-react";

export type ThemePreference = "light" | "dark" | "system";
const STORAGE_KEY = "couple-theme";
const ThemeContext = createContext<{
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
} | null>(null);

function applyTheme(preference: ThemePreference) {
  const dark =
    preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const next: ThemePreference =
      saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
    applyTheme(next);
    queueMicrotask(() => setPreferenceState(next));
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => preference === "system" && applyTheme("system");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [preference]);
  const value = useMemo(
    () => ({
      preference,
      setPreference(value: ThemePreference) {
        setPreferenceState(value);
        window.localStorage.setItem(STORAGE_KEY, value);
        applyTheme(value);
      },
    }),
    [preference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("Missing theme provider");
  return value;
}

const choices = [
  { value: "light" as const, label: "Sáng", icon: Sun },
  { value: "dark" as const, label: "Tối", icon: Moon },
  { value: "system" as const, label: "Theo thiết bị", icon: Laptop },
];

export function ThemeMenu() {
  const { preference, setPreference } = useTheme();
  const Current = choices.find((item) => item.value === preference)?.icon ?? Laptop;
  return (
    <details className="theme-menu">
      <summary className="icon-button" aria-label="Chọn giao diện sáng hoặc tối">
        <Current size={18} />
      </summary>
      <div className="popover-menu" role="menu" aria-label="Giao diện">
        {choices.map(({ value, label, icon: Icon }) => (
          <button key={value} type="button" role="menuitemradio" aria-checked={preference === value}
            onClick={(event) => {
              setPreference(value);
              event.currentTarget.closest("details")?.removeAttribute("open");
            }}>
            <Icon size={17} /><span>{label}</span>{preference === value && <Check size={16} />}
          </button>
        ))}
      </div>
    </details>
  );
}

export function ThemeSettings() {
  const { preference, setPreference } = useTheme();
  return (
    <section className="panel appearance-panel">
      <h2>Giao diện</h2>
      <p className="muted">Chọn cách COUPLE hiển thị trên thiết bị này.</p>
      <div className="theme-options" role="radiogroup" aria-label="Chọn giao diện">
        {choices.map(({ value, label, icon: Icon }) => (
          <button key={value} type="button" role="radio" aria-checked={preference === value}
            className={preference === value ? "selected" : ""} onClick={() => setPreference(value)}>
            <Icon size={19} /><span>{label}</span>{preference === value && <Check size={16} />}
          </button>
        ))}
      </div>
    </section>
  );
}
