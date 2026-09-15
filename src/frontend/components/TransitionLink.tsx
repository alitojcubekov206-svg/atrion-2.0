"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import { usePageWipe } from "@/frontend/components/PageWipe";

type Props = ComponentProps<typeof Link>;

export default function TransitionLink({ href, onClick, target, children, ...rest }: Props) {
  const { navigate } = usePageWipe();
  const path = typeof href === "string" ? href : (href.pathname ?? "");

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      target === "_blank" ||
      !path.startsWith("/") ||
      path.startsWith("/api/")
    ) {
      return;
    }
    e.preventDefault();
    navigate(path);
  }

  return (
    <Link href={href} target={target} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
