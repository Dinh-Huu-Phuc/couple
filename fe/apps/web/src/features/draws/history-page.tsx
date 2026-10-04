"use client";
import { useState } from "react";
import { useDraws } from "@/lib/use-list";
import { useApp } from "@/components/app-shell";
import { Button, Empty, Loading, Notice, PageHeading } from "@/components/ui";
import { DrawCard } from "./draw-card";
export function HistoryPage() {
  const { userId } = useApp();
  const query = useDraws();
  const [filter, setFilter] = useState("all");
  const rows =
    query.data?.pages
      .flat()
      .filter(
        (draw) =>
          filter === "all" ||
          (filter === "mine"
            ? draw.drawn_by === userId
            : draw.drawn_by !== userId),
      ) ?? [];
  return (
    <>
      <PageHeading
        eyebrow="NHỮNG LÁ THƯ ĐÃ ĐƯỢC LẮNG NGHE"
        title="Hai mình đã mở."
        description="Mỗi lá thư là nội dung tại lúc mở, được giữ lại qua những thay đổi sau này."
      />
      <div className="chips">
        {[
          ["all", "Tất cả"],
          ["mine", "Cậu đã mở"],
          ["partner", "Người ấy đã mở"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={filter === key ? "selected" : ""}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <Notice error={query.error} retry={() => void query.refetch()} />
      {query.isPending ? (
        <Loading />
      ) : !rows.length ? (
        <Empty
          title="Chưa có lá thư nào ở đây"
          text="Lá thư đầu tiên sẽ xuất hiện sau khi một trong hai người mở mong muốn."
        />
      ) : (
        <div className="history-list">
          {rows.map((draw) => (
            <DrawCard key={draw.id} draw={draw} />
          ))}
        </div>
      )}
      {query.hasNextPage && (
        <Button
          className="button-secondary load-more"
          busy={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Xem những lá thư trước
        </Button>
      )}
    </>
  );
}
