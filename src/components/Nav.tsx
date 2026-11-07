import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { Logo } from "./Logo";
import { UserMenu } from "./UserMenu";
import { MobileNav } from "./MobileNav";
import { ThemeToggle } from "./ThemeToggle";

const links = [
  { href: "/jobs", label: "Find jobs" },
  { href: "/#resume", label: "Resume builder" },
  { href: "/pricing", label: "Pricing" },
];

export async function Nav() {
  const user = await getCurrentUser().catch(() => null);
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <div className="container-x flex h-16 items-center justify-between gap-6">
        <div className="flex items-center gap-10">
          <Logo />
          <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-[15px] text-slate transition hover:text-ink">
                {l.label}
              </Link>
            ))}
            {user && (
              <>
                <Link href="/dashboard" className="text-[15px] text-slate transition hover:text-ink">
                  Tracker
                </Link>
                <Link href="/referrals" className="text-[15px] text-slate transition hover:text-ink">
                  Referrals
                </Link>
                <Link href="/coach" className="text-[15px] text-slate transition hover:text-ink">
                  Coach
                </Link>
              </>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <UserMenu
              name={user.name ?? user.email}
              email={user.email}
              image={user.image}
              plan={user.plan}
              credits={user.credits}
              isAdmin={user.role === "ADMIN"}
            />
          ) : (
            <>
              <Link href="/login" className="btn btn-sm hidden text-ink hover:bg-white sm:inline-flex">Log in</Link>
              <Link href="/signup" className="btn-primary btn-sm">Get started free</Link>
            </>
          )}
          <MobileNav loggedIn={Boolean(user)} />
        </div>
      </div>
    </header>
  );
}
