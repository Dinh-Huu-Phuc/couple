"use client";
import { useState } from "react";
import { useApp } from "@/components/app-shell";
import { Button, Notice } from "@/components/ui";
import { useAction } from "@/lib/use-action";
export function ProfileForm({ onboarding = false }: { onboarding?: boolean }) {
  const { api, context } = useApp();
  const action = useAction();
  const [name, setName] = useState(context.profile.displayName ?? "");
  const [timezone, setTimezone] = useState(context.profile.timezone);
  const zones = Array.from(
    new Set([
      context.profile.timezone,
      "Asia/Ho_Chi_Minh",
      "Asia/Bangkok",
      "Asia/Tokyo",
      "Asia/Seoul",
      "Asia/Singapore",
      "Europe/London",
      "Europe/Paris",
      "America/New_York",
      "America/Los_Angeles",
      "Australia/Sydney",
      "UTC",
    ]),
  );
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        void action.run(
          () => api.profile(name.trim(), timezone),
          () => action.setMessage("Đã lưu tên và múi giờ của cậu."),
        );
      }}
    >
      <label>
        Tên hiển thị
        <input
          autoComplete="nickname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={50}
          placeholder="Người ấy thường gọi cậu là gì?"
        />
      </label>
      <label>
        Múi giờ
        <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone === "Asia/Ho_Chi_Minh" ? "Việt Nam (UTC+7)" : zone}
            </option>
          ))}
        </select>
      </label>
      <Notice error={action.error} text={action.message} />
      <Button type="submit" busy={action.busy} disabled={!name.trim()}>
        {onboarding ? "Tiếp tục đến lời mời" : "Lưu hồ sơ"}
      </Button>
    </form>
  );
}
