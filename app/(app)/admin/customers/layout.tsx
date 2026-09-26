import { getPlatformAdminContext } from "@/lib/admin/authorization";
export const dynamic = "force-dynamic";
export default async function CustomerAdminLayout({ children }: { children: React.ReactNode }) {
  if (!await getPlatformAdminContext()) return <main className="admin-studio"><section className="admin-panel"><h1>Access denied</h1><p>Customer administration is available only to RYTHM platform administrators.</p></section></main>;
  return children;
}
