import { Suspense } from "react";
import { ConnectPage } from "@/features/connect/connect-page";
export default function Page() {
  return (
    <Suspense>
      <ConnectPage />
    </Suspense>
  );
}
