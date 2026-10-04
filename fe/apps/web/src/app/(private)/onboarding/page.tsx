import { ProfileForm } from "@/features/settings/profile-form";
import { Envelope, PageHeading } from "@/components/ui";
export default function Page() {
  return (
    <div className="onboarding">
      <Envelope small />
      <PageHeading
        eyebrow="TRƯỚC KHI GỬI LÁ THƯ ĐẦU TIÊN"
        title="Mình gọi cậu là gì?"
        description="Một cái tên thân quen để người ấy nhận ra cậu."
      />
      <section className="panel">
        <ProfileForm onboarding />
      </section>
    </div>
  );
}
