import { AdminDashboard } from "./dashboard";
import { AdminLogin } from "./login";
import { adminSessionValid } from "./server";

export default async function AdminPage() {
  return (await adminSessionValid()) ? <AdminDashboard /> : <AdminLogin />;
}
