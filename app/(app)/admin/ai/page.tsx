import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPlatformAdminContext } from "@/lib/admin/authorization";
import { serviceClient } from "@/lib/ai-workspace/service";
import AIWorkspaceGuestCodeForm from "@/components/admin/AIWorkspaceGuestCodeForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI Control Center", robots: { index: false, follow: false } };

async function grantPromoCredit(formData: FormData) {
  "use server";
  const admin = await getPlatformAdminContext();
  if (!admin) throw new Error("PLATFORM_ADMIN_REQUIRED");
  const walletId = String(formData.get("walletId") ?? "").trim();
  const amountCents = Number(formData.get("amountCents") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(walletId)) throw new Error("INVALID_WALLET");
  if (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 10000) throw new Error("INVALID_PROMO_AMOUNT");
  if (reason.length < 3 || reason.length > 240) throw new Error("PROMO_REASON_REQUIRED");
  const client = serviceClient();
  const wallet = await client.from("usage_wallets").select("id,currency,status").eq("id", walletId).maybeSingle();
  if (wallet.error || !wallet.data || wallet.data.status !== "active") throw new Error("WALLET_NOT_AVAILABLE");
  const inserted = await client.from("usage_ledger").insert({
    wallet_id: walletId,
    transaction_type: "promo_credit",
    amount_micros: amountCents * 10000,
    currency: wallet.data.currency,
    source: "admin_ai_control",
    metadata: { reason, issued_by: "platform_admin" },
    actor_user_id: admin.user.id,
  });
  if (inserted.error) throw new Error("PROMO_CREDIT_FAILED");
  revalidatePath("/admin/ai");
}

export default async function AIControlCenter() {
  const admin = await getPlatformAdminContext();
  if (!admin) redirect("/command-center");
  const client = serviceClient();
  const [orgs, codes, usage, wallets] = await Promise.all([
    client.from("organizations").select("id,name").order("name"),
    client.from("aiw_guest_codes").select("id,label,status,activation_count,activation_limit,expires_at,created_at").order("created_at", { ascending: false }).limit(30),
    client.from("ai_usage_requests").select("status,actual_micros,provider,model,created_at").order("created_at", { ascending: false }).limit(50),
    client.from("usage_wallets").select("id,payer_type,currency,status,personal_account_id,organization_id").eq("status", "active").order("created_at", { ascending: true }),
  ]);
  const walletRows = await Promise.all((wallets.data ?? []).map(async (wallet) => ({ ...wallet, balance: await client.rpc("aiw_wallet_balance", { p_wallet: wallet.id }) })));

  return <main className="admin-studio">
    <section className="admin-hero"><div><p className="admin-kicker">AI OPERATIONS</p><h1>AI Control Center</h1><p>Govern RYTHM AI usage, guest access and spend reconciliation through the existing platform-admin authority.</p></div></section>
    <section className="admin-panel"><h2>Wallet promo credit</h2><p>Platform-admin only. Every credit is appended to the immutable usage ledger with an audit reason.</p>{walletRows.length ? <form action={grantPromoCredit}><label>Wallet<select name="walletId" required>{walletRows.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.payer_type} · {wallet.id.slice(0, 8)} · {wallet.currency} {(Number(wallet.balance.data ?? 0) / 1_000_000).toFixed(2)}</option>)}</select></label><label>Amount (cents)<input name="amountCents" type="number" min="1" max="10000" defaultValue="50" required /></label><label>Reason<input name="reason" maxLength={240} defaultValue="AI Workspace release E2E" required /></label><button type="submit">Grant promo credit</button></form> : <p>No active AI wallets yet.</p>}</section>
    <section className="admin-panel"><h2>Create Guest Code</h2><AIWorkspaceGuestCodeForm organizations={orgs.data ?? []} /></section>
    <section className="admin-panel"><h2>Guest Codes</h2>{(codes.data ?? []).map(c => <p key={c.id}><strong>{c.label}</strong> · {c.status} · {c.activation_count}/{c.activation_limit} activations</p>)}</section>
    <section className="admin-panel"><h2>Recent AI usage</h2>{(usage.data ?? []).map((u, i) => <p key={`${u.created_at}-${i}`}>{u.status} · {u.provider ?? "pending"} / {u.model ?? "pending"} · {u.actual_micros ?? "—"} μUSD</p>)}</section>
  </main>;
}
