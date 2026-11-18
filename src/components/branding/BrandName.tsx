import Link from "next/link";

type BrandNameProps = {
  compact?: boolean;
};

export default function BrandName({ compact = false }: BrandNameProps) {
  return (
    <Link
      className={`brand-name${compact ? " brand-name--compact" : ""}`}
      href="/"
      aria-label="NETWORKING LEVEL UP, accueil"
    >
      <span className="brand-main">
        NETWORKING <b>LEVEL UP</b>
      </span>
      {!compact && (
        <span className="brand-tag">
          LEARN <i>•</i> CONNECT <i>•</i> BUILD <i>•</i> GROW
        </span>
      )}
    </Link>
  );
}
