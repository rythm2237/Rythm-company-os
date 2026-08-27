export type BootstrapEmailMetadata = {
  id: string;
  from?: string | null;
  to?: string[];
  subject?: string | null;
  date?: string | null;
};

export type BootstrapCalendarEvent = {
  id: string;
  summary?: string | null;
  organizer?: string | null;
  attendees?: string[];
  start?: string | null;
};

export type BootstrapDiscoveryInput = {
  emails: BootstrapEmailMetadata[];
  calendarEvents: BootstrapCalendarEvent[];
  accountEmail?: string | null;
};

type SignalBucket = {
  key: string;
  name: string;
  description: string;
  score: number;
  evidence: string[];
};

const CATEGORY_RULES: Array<{
  key: string;
  name: string;
  description: string;
  terms: RegExp;
  roles: Array<{ role: string; purpose: string }>;
}> = [
  {
    key: "product_engineering",
    name: "Product & Engineering",
    description: "Product delivery, software, technology and technical execution.",
    terms: /\b(product|engineering|developer|development|software|release|deploy|bug|sprint|github|api|technical|design)\b/i,
    roles: [
      {
        role: "Product & Delivery Agent",
        purpose: "Coordinate product requirements, delivery planning and cross-functional execution.",
      },
      {
        role: "Engineering Agent",
        purpose: "Support technical planning, implementation analysis and engineering execution under Human CEO governance.",
      },
    ],
  },
  {
    key: "sales_customer",
    name: "Sales & Customer",
    description: "Customer relationships, commercial opportunities and revenue operations.",
    terms: /\b(customer|client|sales|lead|proposal|quote|deal|contract|demo|pricing|invoice|renewal|crm)\b/i,
    roles: [
      {
        role: "Commercial Operations Agent",
        purpose: "Support pipeline, customer follow-up and commercial coordination without autonomous external commitments.",
      },
    ],
  },
  {
    key: "operations",
    name: "Operations",
    description: "Internal workflows, planning, fulfillment and day-to-day operating coordination.",
    terms: /\b(operation|operations|planning|schedule|workflow|process|warehouse|logistics|fulfillment|supply|inventory|task)\b/i,
    roles: [
      {
        role: "Operations Agent",
        purpose: "Coordinate operating workflows, priorities, follow-ups and process visibility.",
      },
    ],
  },
  {
    key: "finance_legal",
    name: "Finance & Governance",
    description: "Financial administration, contracts, compliance and governed business controls.",
    terms: /\b(finance|financial|invoice|payment|budget|tax|legal|contract|privacy|compliance|security|audit)\b/i,
    roles: [
      {
        role: "Finance & Governance Agent",
        purpose: "Support financial and governance analysis while escalating material commitments to the Human CEO.",
      },
    ],
  },
  {
    key: "people_admin",
    name: "People & Administration",
    description: "People coordination, recruiting, administration and internal support.",
    terms: /\b(hiring|recruit|candidate|interview|people|hr|human resources|payroll|leave|onboarding|admin)\b/i,
    roles: [
      {
        role: "People Operations Agent",
        purpose: "Support people administration, onboarding and internal coordination with privacy-aware handling.",
      },
    ],
  },
];

function bounded<T>(items: T[], max: number) {
  return items.slice(0, max);
}

function normalizeEmail(value?: string | null) {
  if (!value) return null;
  const match = value.toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?.[0] ?? null;
}

function domain(email?: string | null) {
  const normalized = normalizeEmail(email);
  return normalized?.split("@")[1] ?? null;
}

function externalDomains(input: BootstrapDiscoveryInput) {
  const ownDomain = domain(input.accountEmail);
  const counts = new Map<string, number>();
  for (const email of input.emails) {
    for (const candidate of [email.from, ...(email.to ?? [])]) {
      const item = domain(candidate);
      if (!item || item === ownDomain || ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com"].includes(item)) continue;
      counts.set(item, (counts.get(item) ?? 0) + 1);
    }
  }
  for (const event of input.calendarEvents) {
    for (const candidate of [event.organizer, ...(event.attendees ?? [])]) {
      const item = domain(candidate);
      if (!item || item === ownDomain || ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com"].includes(item)) continue;
      counts.set(item, (counts.get(item) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([name, count]) => ({ domain: name, interactions: count }));
}

function categorySignals(input: BootstrapDiscoveryInput) {
  const buckets = new Map<string, SignalBucket>(
    CATEGORY_RULES.map((rule) => [
      rule.key,
      {
        key: rule.key,
        name: rule.name,
        description: rule.description,
        score: 0,
        evidence: [],
      },
    ]),
  );

  const inspect = (text: string, evidence: string) => {
    for (const rule of CATEGORY_RULES) {
      if (!rule.terms.test(text)) continue;
      const bucket = buckets.get(rule.key)!;
      bucket.score += 1;
      if (bucket.evidence.length < 6) bucket.evidence.push(evidence);
    }
  };

  for (const email of bounded(input.emails, 100)) {
    const subject = String(email.subject ?? "").trim();
    if (subject) inspect(subject, `email_subject:${subject.slice(0, 100)}`);
  }
  for (const event of bounded(input.calendarEvents, 100)) {
    const summary = String(event.summary ?? "").trim();
    if (summary) inspect(summary, `calendar_summary:${summary.slice(0, 100)}`);
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.score > 0)
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

function confidence(sourceCount: number, signalCount: number) {
  if (sourceCount >= 30 && signalCount >= 8) return "high";
  if (sourceCount >= 10 && signalCount >= 3) return "medium";
  return "low";
}

export function synthesizeCompanyBootstrapProposal(input: BootstrapDiscoveryInput) {
  const emails = bounded(input.emails ?? [], 100);
  const calendarEvents = bounded(input.calendarEvents ?? [], 100);
  const signals = categorySignals({ ...input, emails, calendarEvents });
  const selected = signals.slice(0, 4);
  const ownDomain = domain(input.accountEmail);

  const departments = selected.map((signal) => ({
    key: signal.key,
    name: signal.name,
    description: signal.description,
    confidence: confidence(emails.length + calendarEvents.length, signal.score),
    evidence_count: signal.score,
  }));

  const agents = selected.flatMap((signal) => {
    const rule = CATEGORY_RULES.find((item) => item.key === signal.key)!;
    return rule.roles.slice(0, signal.score >= 4 ? 2 : 1).map((role, index) => ({
      department_key: signal.key,
      role_code: `${signal.key}_${index + 1}`,
      role: role.role,
      name: role.role,
      purpose: role.purpose,
      authority_level: 1,
      risk_ceiling: "medium",
      external_actions_allowed: false,
      initial_status: "paused",
    }));
  });

  const totalSignals = selected.reduce((sum, item) => sum + item.score, 0);
  const sourceCount = emails.length + calendarEvents.length;

  return {
    version: "phase3-pilot-v1",
    mode: "proposal_only",
    sources: {
      gmail_metadata_count: emails.length,
      google_calendar_event_count: calendarEvents.length,
      raw_email_bodies_persisted: false,
      attachments_persisted: false,
    },
    company_hints: {
      account_domain: ownDomain,
      external_domains: externalDomains({ ...input, emails, calendarEvents }),
    },
    confidence: confidence(sourceCount, totalSignals),
    evidence_summary: selected.map((signal) => ({
      category: signal.key,
      count: signal.score,
      samples: signal.evidence,
    })),
    proposed_structure: {
      departments,
      agents,
    },
    governance: {
      human_ceo_confirmation_required: true,
      provider_writes_required: false,
      agents_initial_status: "paused",
      external_actions_allowed: false,
    },
  };
}
