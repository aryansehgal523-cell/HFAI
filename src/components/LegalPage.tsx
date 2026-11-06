import { COMPANY } from "@/config/company";

export function LegalPage({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="container-x py-16">
      <div className="mx-auto max-w-[68ch]">
        <h1 className="text-5xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm text-slate">Effective {COMPANY.effectiveDate}</p>
        {intro && <p className="mt-6 text-lg text-ink-soft">{intro}</p>}
        <div className="prose-legal mt-4">{children}</div>
      </div>
    </div>
  );
}
