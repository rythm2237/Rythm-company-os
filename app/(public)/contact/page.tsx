import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ offer?: string }> };

export default async function ContactPage({ searchParams }: Props) {
  const { offer } = await searchParams;
  redirect(offer ? `/enterprise?offer=${encodeURIComponent(offer)}` : "/enterprise");
}
