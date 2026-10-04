"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="fatal">
      <h1>Chưa mở được trang này</h1>
      <p>Cậu thử tải lại nhé.</p>
      <button className="button" onClick={reset}>
        Thử lại
      </button>
    </main>
  );
}
