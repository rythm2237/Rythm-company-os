import Image from "next/image";

type Props = Readonly<{
  className?: string;
  priority?: boolean;
  variant?: "inverse" | "primary";
}>;

export default function RythmBrandMark({
  className,
  priority = false,
  variant = "primary",
}: Props) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={["rythm-brand-mark", className].filter(Boolean).join(" ")}
      height={256}
      priority={priority}
      src={`/brand/mark-${variant}.svg`}
      unoptimized
      width={256}
    />
  );
}
