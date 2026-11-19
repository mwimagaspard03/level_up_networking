import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type ButtonProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
} & Omit<ComponentPropsWithoutRef<typeof Link>, "children" | "className">;

export default function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <Link
      className={`button button--${variant} ${className}`.trim()}
      {...props}
    >
      {children}
    </Link>
  );
}
