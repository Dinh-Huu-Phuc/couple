"use client";
import Link from "next/link";
import { useMemories } from "@/lib/use-list";
import { Button, Empty, Loading, Notice, PageHeading } from "@/components/ui";
import { MemoryCard } from "./memory-card";
export function MemoriesPage() {
  const query = useMemories();
  const rows = query.data?.pages.flat() ?? [];
  return (
    <>
      <PageHeading
        eyebrow="MỘT CUỐN NHẬT KÝ CỦA RIÊNG HAI NGƯỜI"
        title="Những điều muốn nhớ."
        description="Một lời nhắn, một bức ảnh. Giữ lại những dịu dàng đã cùng nhau thực hiện."
        action={
          <Link href="/history" className="button button-secondary">
            Viết từ thẻ đã hoàn thành
          </Link>
        }
      />
      <Notice error={query.error} retry={() => void query.refetch()} />
      {query.isPending ? (
        <Loading />
      ) : !rows.length ? (
        <Empty
          title="Trang đầu tiên vẫn đang chờ"
          text="Sau khi hoàn thành mong muốn, cậu có thể viết lời nhắn hoặc thêm một bức ảnh từ mục Đã mở."
        />
      ) : (
        <div className="memory-grid">
          {rows.map((memory) => (
            <MemoryCard key={memory.id} memory={memory} />
          ))}
        </div>
      )}
      {query.hasNextPage && (
        <Button
          className="button-secondary load-more"
          busy={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Xem thêm kỷ niệm
        </Button>
      )}
    </>
  );
}
