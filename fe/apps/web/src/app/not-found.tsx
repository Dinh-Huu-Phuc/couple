import Link from "next/link";
export default function NotFound() {
  return (
    <main className="fatal">
      <h1>Lá thư này đi lạc rồi</h1>
      <p>Không tìm thấy trang cậu đang mở.</p>
      <Link className="button" href="/home">
        Về Hai mình
      </Link>
    </main>
  );
}
