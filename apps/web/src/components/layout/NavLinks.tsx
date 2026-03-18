"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/videos", label: "Videos" },
  { href: "/history", label: "History" },
  { href: "/profile", label: "Profile" },
]

export function NavLinks({
  className,
  onClick,
}: {
  className?: string
  onClick?: () => void
}) {
  const pathname = usePathname()

  return (
    <nav className={cn("flex items-center gap-4 text-sm", className)}>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={onClick}
          className={cn(
            "transition-colors hover:text-foreground",
            pathname === link.href
              ? "font-medium text-foreground"
              : "text-muted-foreground"
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
