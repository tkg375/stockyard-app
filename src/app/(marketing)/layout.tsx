import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-page">
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
