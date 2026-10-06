"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Shuffle, Heart, ArrowUpRight, Feather } from "lucide-react";
import { z } from "zod";
import { AppError, categories, drawSchema, initials } from "@couple/domain";
import { useApp } from "@/components/app-shell";
import {
  Button,
  Envelope,
  Loading,
  Notice,
  PageHeading,
} from "@/components/ui";
import { useAction } from "@/lib/use-action";
import { useMemories } from "@/lib/use-list";
import { DrawCard } from "./draw-card";
import { MemoryCard } from "@/features/memories/memory-card";
export function HomePage() {
  const { context, userId, client, api, pendingWishCount } = useApp();
  const action = useAction();
  const [category, setCategory] = useState("");
  const [budget, setBudget] = useState("");
  const memories = useMemories();
  const open = useQuery({
    queryKey: [userId, context.couple?.id, "open-draw"],
    enabled: !!context.couple,
    queryFn: async () => {
      const { data, error } = await client
        .from("draws")
        .select(
          "id,couple_id,wish_id,drawn_by,status,snapshot,drawn_at,completed_at,discussion_message,discussion_at,deferred_until",
        )
        .eq("couple_id", context.couple!.id)
        .eq("drawn_by", userId)
        .in("status", ["opened", "accepted", "discuss"])
        .limit(1);
      if (error) throw new AppError("NETWORK_ERROR");
      const parsed = z.array(drawSchema).safeParse(data);
      if (!parsed.success) throw new AppError("INVALID_RESPONSE");
      return parsed.data[0] ?? null;
    },
  });
  const names = `${context.profile.displayName} & ${context.couple?.partner.displayName}`;
  async function draw() {
    const filter = {
      category: category || null,
      budget: budget === "" ? null : Number(budget),
    };
    await action.run(
      () =>
        api.draw(
          action.keys.get("draw", filter),
          filter.category,
          filter.budget,
        ),
      (result) => {
        action.keys.clear("draw", filter);
        if (result.resumed)
          action.setMessage(
            "Cậu đang có một thẻ chưa xử lý. Mình tiếp tục với thẻ này nhé.",
          );
      },
    );
  }
  return (
    <>
      <div className="couple-identity">
        <span className="avatar-pair">
          <span className="avatar">
            {initials(context.profile.displayName)}
          </span>
          <Heart size={12} />
          <span className="avatar avatar-sand">
            {initials(context.couple?.partner.displayName)}
          </span>
        </span>
        <span>{names}</span>
        <span className="identity-rule" />
      </div>
      <PageHeading
        title="Một điều nhỏ, dành cho người thương."
        description="Mở một mong muốn, bắt đầu một niềm vui."
      />
      <Notice error={open.error} retry={() => void open.refetch()} />
      <Notice error={action.error} text={action.message} />
      {open.isPending ? (
        <Loading />
      ) : open.data ? (
        <section className="open-letter">
          <span className="eyebrow">LÁ THƯ ĐANG ĐỢI CẬU</span>
          <p>Cậu đang có một thẻ chưa xử lý. Mình tiếp tục với thẻ này nhé.</p>
          <DrawCard draw={open.data} />
        </section>
      ) : (
        <section className="draw-stage">
          <div className="botanical botanical-left" aria-hidden="true">
            ❦
          </div>
          <div className="botanical botanical-right" aria-hidden="true">
            ❦
          </div>
          <span className="eyebrow">MỘT CHIẾC THƯ NHỎ, MỘT NIỀM VUI MỚI</span>
          <h2>Hôm nay, mình làm gì cho nhau?</h2>
          <div className="tiny-rule">
            <span />
            <Heart size={14} />
            <span />
          </div>
          <div className="chips category-filters" aria-label="Nhóm mong muốn">
            <button
              className={!category ? "selected" : ""}
              onClick={() => setCategory("")}
            >
              Tất cả
            </button>
            {Object.entries(categories).map(([key, label]) => (
              <button
                key={key}
                className={category === key ? "selected" : ""}
                onClick={() => setCategory(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="budget-filter">
            Ngân sách tối đa
            <select value={budget} onChange={(e) => setBudget(e.target.value)}>
              <option value="">Không giới hạn</option>
              <option value="0">Không tốn tiền</option>
              <option value="100000">100.000 ₫</option>
              <option value="300000">300.000 ₫</option>
              <option value="500000">500.000 ₫</option>
              <option value="1000000">1.000.000 ₫</option>
            </select>
          </label>
          <Envelope />
          <Button
            busy={action.busy}
            disabled={open.isError}
            className="draw-button"
            onClick={() => void draw()}
          >
            <Shuffle size={19} />
            Bốc một mong muốn
            {pendingWishCount > 0 && (
              <span
                className="draw-count-badge"
                aria-label={`${pendingWishCount} mong muốn mới`}
              >
                {pendingWishCount > 99 ? "99+" : pendingWishCount}
              </span>
            )}
          </Button>
          <p className="draw-note">
            Một điều người ấy viết riêng, đang chờ được lắng nghe.
          </p>
        </section>
      )}
      <section className="memory-preview">
        <div className="section-heading">
          <div>
            <span className="eyebrow">GIỮ LẠI CHÚT DỊU DÀNG</span>
            <h2>Khoảnh khắc của hai mình</h2>
          </div>
          <Link href="/memories" className="text-button">
            Xem kỷ niệm
            <ArrowUpRight size={16} />
          </Link>
        </div>
        <Notice error={memories.error} retry={() => void memories.refetch()} />
        {memories.isPending ? (
          <Loading />
        ) : memories.data?.pages[0]?.length ? (
          <div className="memory-grid">
            {memories.data.pages[0].slice(0, 3).map((memory) => (
              <MemoryCard key={memory.id} memory={memory} />
            ))}
          </div>
        ) : (
          <div className="memory-placeholder">
            <Feather size={28} />
            <div>
              <h3>Những điều đáng nhớ sẽ ở đây.</h3>
              <p>
                Hoàn thành một mong muốn, rồi cất lại lời nhắn hoặc một bức ảnh
                của hai mình.
              </p>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
