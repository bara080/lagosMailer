'use client';
import { useEffect, useState } from 'react';
import { ChevronDown, Building2, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { COMPANIES, DEFAULT_COMPANY, getCompany, setCompany } from '@/lib/companies';

// Workspace/tenant switcher. Selecting a company persists it (localStorage) and
// invalidates all queries so every list refetches with the new `x-company`
// header → each company shows its own isolated data.
export default function CompanySwitcher() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [company, setCo] = useState<string>(DEFAULT_COMPANY);

  useEffect(() => setCo(getCompany()), []);

  function pick(id: string) {
    setCompany(id);
    setCo(id);
    setOpen(false);
    qc.invalidateQueries(); // refetch everything for the newly selected company
  }

  const current = COMPANIES.find((c) => c.id === company) ?? COMPANIES[0];

  return (
    <div className="usermenu">
      <button className="company-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="company-logo"><Building2 size={15} /></span>
        <b>{current.name}</b>
        <ChevronDown size={15} color="var(--text-dim)" />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setOpen(false)} />
          <div className="menu-pop" style={{ left: 0, right: 'auto' }}>
            <div className="menu-label">Switch company</div>
            {COMPANIES.map((c) => (
              <button key={c.id} className="mi" onClick={() => pick(c.id)}>
                <span className="company-logo sm"><Building2 size={13} /></span>
                {c.name}
                {c.id === company && <Check size={15} style={{ marginLeft: 'auto', color: 'var(--accent)' }} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
