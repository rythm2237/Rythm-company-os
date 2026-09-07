import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { enMessages, type Messages } from "@/lib/i18n/messages/en";

const MESSAGE_LOADERS: Partial<Record<Locale, () => Promise<Messages>>> = {
  en: async () => enMessages,
};

export async function getMessages(locale: Locale = DEFAULT_LOCALE): Promise<Messages> {
  const loader = MESSAGE_LOADERS[locale] ?? MESSAGE_LOADERS[DEFAULT_LOCALE];
  if (!loader) throw new Error(`No message catalog is configured for locale: ${locale}`);
  return loader();
}

export { enMessages };
export type { Messages };
