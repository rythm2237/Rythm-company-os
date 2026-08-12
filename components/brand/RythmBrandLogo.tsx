import Image from "next/image";

type Props = Readonly<{
  className?: string;
  priority?: boolean;
  variant?: "inverse" | "primary";
}>;

export default function RythmBrandLogo({
  className,
  priority = false,
  variant = "inverse",
}: Props) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={["rythm-brand-logo", className].filter(Boolean).join(" ")}
      height={104}
      priority={priority}
      src={`/brand/logo-navbar-${variant}.svg`}
      unoptimized
      width={430}
    />
  );
}
