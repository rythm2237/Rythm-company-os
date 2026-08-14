"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { trackPublicExperienceEvent } from "@/lib/analytics/public-events";
import styles from "./SolutionFinder.module.css";

type Answers = {
  role?: string;
  objective?: string;
  size?: string;
  challenge?: string;
  aiRole?: string;
  governance?: string;
};

type RecommendationKey = "ready" | "custom" | "enterprise";

type Option = { value: string; label: string; detail: string };
type Question = { key: keyof Answers; title: string; help: string; options: Option[] };

type Recommendation = {
  key: RecommendationKey;
  title: string;
  subtitle: string;
  audience: string;
  why: string[];
  how: string[];
  blueprint: { title: string; detail: string }[];
  agents: string[];
  primaryHref: string;
  primaryLabel: string;
  score: number;
};

const PROFILE_STORAGE_KEY = "rythm-solution-profile-v1";
const DISMISSED_STORAGE_KEY = "rythm-solution-finder-dismissed-v1";
const QUESTIONS: Question[] = [
  {
    key: "role",
    title: "Where are you starting from?",
    help: "This helps us distinguish between building a new company, improving an existing team, and enterprise deployment.",
    options: [
      { value: "founder", label: "Founder / business owner", detail: "I am building or running a business." },
      { value: "manager", label: "Manager / department lead", detail: "I am responsible for a team or business function." },
      { value: "professional", label: "Employee / specialist", detail: "I want better leverage inside my current role." },
      { value: "consultant", label: "Consultant / advisor", detail: "I support multiple clients or organizations." },
      { value: "starting", label: "Starting a business", detail: "I have an idea and need an operating structure." },
      { value: "exploring", label: "Exploring", detail: "I am still learning what an AI company could do." },
    ],
  },
  {
    key: "objective",
    title: "What do you want RYTHM to help you build?",
    help: "Choose the outcome closest to what you need today.",
    options: [
      { value: "ready-team", label: "A ready AI team", detail: "I want useful roles without designing the organization myself." },
      { value: "custom-company", label: "My own AI company", detail: "I want custom roles, departments, hierarchy and workflows." },
      { value: "department", label: "AI workforce for a department", detail: "I want AI roles inside an existing organization or business unit." },
      { value: "scale", label: "Scale an existing operation", detail: "I need more capacity, coordination and decision support." },
      { value: "test", label: "Test RYTHM first", detail: "I want to try a real business problem before committing." },
    ],
  },
  {
    key: "size",
    title: "How large is the team or organization involved?",
    help: "We use this to avoid recommending enterprise complexity when you do not need it.",
    options: [
      { value: "solo", label: "Just me", detail: "Solo founder, professional or consultant." },
      { value: "small", label: "2–10 people", detail: "Small team or early-stage business." },
      { value: "mid", label: "11–50 people", detail: "Growing business or established team." },
      { value: "large", label: "51–250 people", detail: "Larger organization or multi-team environment." },
      { value: "enterprise", label: "250+ people", detail: "Enterprise-scale organization or governed rollout." },
    ],
  },
  {
    key: "challenge",
    title: "What is the most important problem to solve?",
    help: "The recommendation should explain the problem it solves, not just list features.",
    options: [
      { value: "capacity", label: "Not enough capacity", detail: "Too much work for the people available." },
      { value: "coordination", label: "Coordination is fragmented", detail: "Work, ownership and follow-through are hard to keep aligned." },
      { value: "decisions", label: "Decision support", detail: "I need better analysis, evidence and structured recommendations." },
      { value: "knowledge", label: "Knowledge is scattered", detail: "Important context is split across people, tools and documents." },
      { value: "automation", label: "Processes are too manual", detail: "I need governed automation and repeatable workflows." },
      { value: "scale", label: "Scaling creates complexity", detail: "We need more capability without losing control." },
    ],
  },
  {
    key: "aiRole",
    title: "How should AI participate in the organization?",
    help: "This sets the shape of the workforce we visualize for you.",
    options: [
      { value: "advisor", label: "Advisor", detail: "Analyze and recommend; humans execute." },
      { value: "specialists", label: "Specialist team", detail: "Multiple AI roles working within defined responsibilities." },
      { value: "operations", label: "Operational workforce", detail: "AI roles should continuously support real workflows." },
      { value: "cross-functional", label: "Cross-functional organization", detail: "AI roles across functions coordinated as one system." },
    ],
  },
  {
    key: "governance",
    title: "How much human control do you want?",
    help: "RYTHM is governed by design. This helps us choose the right operating model.",
    options: [
      { value: "recommend", label: "Recommendations only", detail: "Humans make and execute consequential decisions." },
      { value: "approve", label: "Approval before action", detail: "AI can prepare work, with human approval at defined boundaries." },
      { value: "bounded", label: "Bounded operational authority", detail: "AI can operate within clear limits and escalate exceptions." },
    ],
  },
];

function computeRecommendation(answers: Answers): Recommendation {
  let ready = 0;
  let custom = 0;
  let enterprise = 0;

  if (["solo", "small"].includes(answers.size ?? "")) ready += 3;
  if (["mid", "large"].includes(answers.size ?? "")) custom += 2;
  if (answers.size === "enterprise") enterprise += 6;

  if (answers.objective === "ready-team") ready += 7;
  if (answers.objective === "custom-company") custom += 7;
  if (answers.objective === "department") enterprise += answers.size === "enterprise" || answers.size === "large" ? 8 : 4;
  if (answers.objective === "scale") custom += 3;
  if (answers.objective === "test") ready += 1;

  if (answers.role === "starting") ready += 4;
  if (answers.role === "founder") { ready += 2; custom += 2; }
  if (answers.role === "manager") { custom += 2; enterprise += 2; }
  if (answers.role === "consultant") custom += 3;
  if (answers.role === "professional") ready += 2;

  if (answers.aiRole === "advisor") ready += 2;
  if (answers.aiRole === "specialists") { ready += 2; custom += 2; }
  if (answers.aiRole === "operations") custom += 3;
  if (answers.aiRole === "cross-functional") { custom += 3; enterprise += 3; }

  if (answers.governance === "bounded") { custom += 2; enterprise += 2; }
  if (answers.challenge === "scale") { custom += 2; enterprise += 2; }
  if (answers.challenge === "automation") custom += 2;

  const winner: RecommendationKey = enterprise > custom && enterprise > ready
    ? "enterprise"
    : custom > ready
      ? "custom"
      : "ready";

  const gap = Math.max(2, Math.abs(Math.max(ready, custom, enterprise) - [ready, custom, enterprise].sort((a, b) => b - a)[1]));
  const score = Math.min(96, 74 + gap * 3);
  const challengeLabel = QUESTIONS.find((q) => q.key === "challenge")?.options.find((o) => o.value === answers.challenge)?.label.toLowerCase() ?? "operational complexity";

  if (winner === "enterprise") {
    return {
      key: winner,
      title: "Enterprise AI Workforce",
      subtitle: "Deploy governed AI roles inside an existing organization or department.",
      audience: "Best fit for departments and larger organizations that need controlled rollout, role boundaries and executive oversight.",
      why: [
        `Your context points to ${challengeLabel} at a scale where governance matters as much as capability.`,
        "A departmental deployment lets you introduce AI roles without pretending the rest of the organization must become an AI company overnight.",
        "Enterprise architecture keeps human managers, permissions, auditability and rollout boundaries explicit.",
      ],
      how: [
        "Start with one business unit or department and define the Human Department Lead as the accountable authority.",
        "Add specialized AI roles around the workflows that create the most leverage.",
        "Use meetings, approvals and traceability to connect AI recommendations to accountable human decisions.",
      ],
      blueprint: [
        { title: "Human Department Lead", detail: "Business authority and final accountability" },
        { title: "AI Program Manager", detail: "Coordinates governed AI specialists" },
        { title: "Specialist AI Team", detail: "Role-specific analysis and operational support" },
        { title: "Governed Execution", detail: "Meetings → approvals → actions → traceability" },
      ],
      agents: ["Process Analyst", "Automation Specialist", "Data Analyst", "Research Agent", "Documentation Specialist"],
      primaryHref: "/enterprise?source=solution-finder",
      primaryLabel: "Plan an Enterprise deployment",
      score,
    };
  }

  if (winner === "custom") {
    return {
      key: winner,
      title: "Custom AI Company",
      subtitle: "Design the AI organization around your own roles, workflows and operating model.",
      audience: "Best fit when a pre-built team would be too restrictive and you need ongoing control over structure and responsibilities.",
      why: [
        `Your answers suggest ${challengeLabel} is tied to how work is structured, not just a shortage of one capability.`,
        "You need the ability to define departments, Agent responsibilities, reporting lines and governance boundaries around your own operation.",
        "Custom Company avoids forcing your organization into a template while preserving RYTHM's Human CEO governance model.",
      ],
      how: [
        "Define the outcomes and departments you need before creating individual AI roles.",
        "Build a specialist workforce with explicit responsibilities, KPIs, authority and reporting lines.",
        "Operate through projects, meetings, approvals, actions and Company Memory instead of isolated prompts.",
      ],
      blueprint: [
        { title: "Human CEO / Owner", detail: "Defines intent and retains consequential authority" },
        { title: "Custom Departments", detail: "Structure based on your actual business" },
        { title: "Custom AI Agents", detail: "Roles, skills, KPIs and authority you control" },
        { title: "Company OS", detail: "Projects → meetings → approvals → accountable work" },
      ],
      agents: ["Operations Manager", "Strategy Analyst", "Research Specialist", "Finance Analyst", "Workflow Coordinator"],
      primaryHref: "/pricing?recommended=custom_ai_company&source=solution-finder",
      primaryLabel: "Explore Custom Company",
      score,
    };
  }

  return {
    key: winner,
    title: "Ready AI Company",
    subtitle: "Start with a governed AI workforce that is already structured for you.",
    audience: "Best fit when you want useful AI capacity quickly without spending time designing departments and Agent architecture first.",
    why: [
      `Your profile suggests you can address ${challengeLabel} without introducing unnecessary organizational complexity.`,
      "A ready-made AI company gives you a coherent workforce and operating model from day one.",
      "You can learn how RYTHM works through real workflows before deciding whether you ever need deeper customization.",
    ],
    how: [
      "Choose a ready company closest to the work you want to improve.",
      "Use the included AI roles within clear Human CEO authority and approval boundaries.",
      "Run projects, meetings and accountable actions in one persistent workspace rather than using disconnected AI tools.",
    ],
    blueprint: [
      { title: "Human CEO / Owner", detail: "Intent, review and final authority" },
      { title: "Pre-built AI Manager", detail: "Coordinates the included specialist workforce" },
      { title: "Ready Specialist Agents", detail: "Defined roles and responsibilities" },
      { title: "Governed Workflow", detail: "Work → meeting → approval → action → trace" },
    ],
    agents: ["Strategy Agent", "Operations Agent", "Research Agent", "Analytics Agent"],
    primaryHref: "/templates?source=solution-finder",
    primaryLabel: "Explore Ready Companies",
    score,
  };
}

function restoreAnswers(): Answers {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROFILE_STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed as Answers : {};
  } catch {
    return {};
  }
}

export default function SolutionFinder() {
  const [eligible, setEligible] = useState(false);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<Recommendation | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setAnswers(restoreAnswers());
    setDismissed(window.sessionStorage.getItem(DISMISSED_STORAGE_KEY) === "true");

    const explored = new Set<string>();
    const clickHandler = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest(".demo-navigation button, .demo-agent-grid button") : null;
      if (!target) return;
      const key = target.textContent?.trim();
      if (!key) return;
      explored.add(key);
      if (explored.size >= 4) setEligible(true);
    };
    const analyticsHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string }>).detail;
      if (detail?.name === "tour_completed") setEligible(true);
    };
    const timer = window.setTimeout(() => setEligible(true), 90_000);
    document.addEventListener("click", clickHandler, true);
    window.addEventListener("rythm:public-experience", analyticsHandler as EventListener);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("click", clickHandler, true);
      window.removeEventListener("rythm:public-experience", analyticsHandler as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => dialogRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  const currentQuestion = QUESTIONS[step];
  const progress = result ? 100 : ((step + 1) / QUESTIONS.length) * 100;
  const savedSummary = useMemo(() => Object.keys(answers).length === QUESTIONS.length, [answers]);

  function begin() {
    setOpen(true);
    setResult(savedSummary ? computeRecommendation(answers) : null);
    trackPublicExperienceEvent({ name: "solution_finder_started", properties: { resumed: savedSummary } });
  }

  function dismiss() {
    setDismissed(true);
    window.sessionStorage.setItem(DISMISSED_STORAGE_KEY, "true");
    trackPublicExperienceEvent({ name: "solution_finder_dismissed" });
  }

  function answer(value: string) {
    const next = { ...answers, [currentQuestion.key]: value };
    setAnswers(next);
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
    trackPublicExperienceEvent({ name: "solution_finder_answered", properties: { question: currentQuestion.key, option: value } });
    if (step === QUESTIONS.length - 1) {
      const recommendation = computeRecommendation(next);
      setResult(recommendation);
      trackPublicExperienceEvent({ name: "solution_finder_recommended", properties: { recommendation: recommendation.key } });
      return;
    }
    setStep((current) => current + 1);
  }

  function startOver() {
    setAnswers({});
    setResult(null);
    setStep(0);
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  }

  if (!eligible && !open) return null;

  return (
    <>
      {!open && !dismissed ? (
        <aside className={styles.launcher} aria-label="RYTHM Solution Finder">
          <div className={styles.launcherTop}>
            <span className={styles.launcherIcon} aria-hidden="true">✦</span>
            <div>
              <h3>See how RYTHM could work for you</h3>
              <p>Answer six short questions. We will recommend the simplest RYTHM setup that fits your situation—and show why.</p>
            </div>
            <button className={styles.closeButton} type="button" onClick={dismiss} aria-label="Dismiss Solution Finder">×</button>
          </div>
          <div className={styles.launcherActions}>
            <button className={styles.primary} type="button" onClick={begin}>Find my solution</button>
            <button className={styles.secondary} type="button" onClick={dismiss}>Not now</button>
          </div>
        </aside>
      ) : null}

      {open ? (
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div className={styles.dialog} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="solution-finder-title" tabIndex={-1}>
            <div className={styles.header}>
              <div className={styles.headerText}>
                <p className={styles.eyebrow}>RYTHM SOLUTION FINDER</p>
                <h2 id="solution-finder-title">{result ? "A RYTHM setup shaped around your situation" : "What are you actually trying to improve?"}</h2>
                <p>{result ? "This is a product recommendation, not an upsell rule. We choose the simplest path that matches the answers you gave." : "No company name, email or personal data is required. Your answers stay in this browser and can later help avoid repeating onboarding questions."}</p>
              </div>
              <button className={styles.closeButton} type="button" onClick={() => setOpen(false)} aria-label="Close Solution Finder">×</button>
            </div>
            <div className={styles.progress} aria-label={`Solution Finder progress ${Math.round(progress)} percent`}><span style={{ width: `${progress}%` }} /></div>

            {!result ? (
              <div className={styles.question}>
                <h3>{currentQuestion.title}</h3>
                <p>{currentQuestion.help}</p>
                <div className={styles.options}>
                  {currentQuestion.options.map((option) => (
                    <button className={styles.option} key={option.value} type="button" onClick={() => answer(option.value)}>
                      <strong>{option.label}</strong><span>{option.detail}</span>
                    </button>
                  ))}
                </div>
                <div className={styles.navigation}>
                  <div>{step > 0 ? <button className={styles.back} type="button" onClick={() => setStep((current) => current - 1)}>← Back</button> : null}</div>
                  <span className={styles.stepLabel}>Question {step + 1} of {QUESTIONS.length}</span>
                </div>
              </div>
            ) : (
              <div className={styles.result}>
                <section className={styles.resultHero}>
                  <div>
                    <p className={styles.eyebrow}>RECOMMENDED PATH</p>
                    <h2>{result.title}</h2>
                    <p>{result.subtitle}</p>
                    <p style={{ marginTop: 10 }}>{result.audience}</p>
                  </div>
                  <div className={styles.fitScore}><strong>{result.score}%</strong><span>profile fit</span></div>
                </section>

                <div className={styles.resultGrid}>
                  <article className={styles.resultCard}><h3>Why this fits</h3><ul>{result.why.map((item) => <li key={item}>{item}</li>)}</ul></article>
                  <article className={styles.resultCard}><h3>How RYTHM would help</h3><ul>{result.how.map((item) => <li key={item}>{item}</li>)}</ul></article>
                </div>

                <section className={styles.blueprint} aria-label="Recommended RYTHM operating blueprint">
                  <h3>Visualize your operating model</h3>
                  <div className={styles.blueprintFlow}>
                    {result.blueprint.map((node, index) => (
                      <span key={node.title} style={{ display: "contents" }}>
                        <span className={styles.node}><strong>{node.title}</strong><small>{node.detail}</small></span>
                        {index < result.blueprint.length - 1 ? <span className={styles.arrow} aria-hidden="true">→</span> : null}
                      </span>
                    ))}
                  </div>
                  <div className={styles.agentRow} aria-label="Example AI roles">{result.agents.map((agent) => <span key={agent}>{agent}</span>)}</div>
                </section>

                <div className={styles.resultActions}>
                  <Link className={styles.primary} href={result.primaryHref} onClick={() => trackPublicExperienceEvent({ name: "solution_finder_primary_clicked", properties: { recommendation: result.key } })}>{result.primaryLabel}</Link>
                  <Link className={styles.secondary} href="/live-ai-meeting?source=solution-finder" onClick={() => trackPublicExperienceEvent({ name: "solution_finder_meeting_clicked", properties: { recommendation: result.key } })}>Try it with a Live AI Meeting</Link>
                  <Link className={styles.secondary} href="/pricing?source=solution-finder">Compare all paths</Link>
                  <button className={styles.startOver} type="button" onClick={startOver}>Start over</button>
                </div>
                <p className={styles.privacy}>RYTHM does not claim this is the only valid setup. The recommendation is a transparent rule-based fit assessment using only the six answers above.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
