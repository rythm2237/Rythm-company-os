"use client";

import { useRouter } from "next/navigation";

type MailboxFilterProps = {
  value: string;
  view: string;
  mailboxes: Array<{ id: string; address: string }>;
};

export default function MailboxFilter({ value, view, mailboxes }: MailboxFilterProps) {
  const router = useRouter();

  return (
    <select
      aria-label="Filter mailbox"
      value={value}
      onChange={(event) => {
        const mailbox = event.target.value;
        const params = new URLSearchParams();
        params.set("view", view);
        if (mailbox) params.set("mailbox", mailbox);
        router.push(`/communication?${params.toString()}`);
      }}
    >
      <option value="">All company addresses</option>
      {mailboxes.map((mailbox) => (
        <option key={mailbox.id} value={mailbox.id}>{mailbox.address}</option>
      ))}
    </select>
  );
}
