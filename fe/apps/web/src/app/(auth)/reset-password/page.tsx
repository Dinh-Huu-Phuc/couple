import { Suspense } from "react";
import { AuthForm } from "@/features/auth/auth-form";
export default function Page() {
  return (
    <Suspense>
      <AuthForm mode="reset" />
    </Suspense>
  );
}
