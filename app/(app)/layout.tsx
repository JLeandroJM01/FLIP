import { QuickAddProvider } from "@/components/quick-add/quick-add-provider";
import { BottomNav } from "@/components/shell/bottom-nav";
import { Sidebar } from "@/components/shell/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { requireUser } from "@/lib/auth";
import { countPendingReview, getCatalogs } from "@/lib/data";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase } = await requireUser();
  const [catalogs, pendingReview] = await Promise.all([getCatalogs(supabase), countPendingReview(supabase)]);

  return (
    <QuickAddProvider catalogs={catalogs}>
      <div className="flex min-h-dvh">
        <Sidebar pendingReview={pendingReview} />
        <main className="min-w-0 flex-1 pb-28 md:pb-10">{children}</main>
      </div>
      <BottomNav pendingReview={pendingReview} />
      <Toaster position="top-center" />
    </QuickAddProvider>
  );
}
