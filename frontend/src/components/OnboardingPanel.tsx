import { BriefcaseBusiness, CalendarCheck, CircleDollarSign, FileText, HeartPulse, Home, Plane, Search, ShoppingBag } from "lucide-react";

export type OnboardingNeed = {
  id: string;
  title: string;
  detail: string;
  category: string;
  query: string;
  matcherNeedId: string;
  recommendation: string;
  icon: typeof Plane;
};

export const onboardingNeeds: OnboardingNeed[] = [
  {
    id: "travel",
    title: "Plan a trip",
    detail: "Flights, hotels, loyalty, itineraries",
    category: "Travel",
    query: "travel",
    matcherNeedId: "travel",
    recommendation: "Recommended helpers match trips, bookings, loyalty details, and travel preferences.",
    icon: Plane
  },
  {
    id: "daily",
    title: "Remember errands",
    detail: "Reminders, planning, small tasks",
    category: "Daily Tasks",
    query: "task",
    matcherNeedId: "daily",
    recommendation: "Recommended helpers match reminders, planning, errands, and repeat life admin.",
    icon: CalendarCheck
  },
  {
    id: "work",
    title: "Handle emails",
    detail: "Drafts, follow-ups, scheduling",
    category: "Work",
    query: "email",
    matcherNeedId: "work",
    recommendation: "Recommended helpers match email drafts, follow-ups, scheduling, and work coordination.",
    icon: BriefcaseBusiness
  },
  {
    id: "money",
    title: "Manage money",
    detail: "Budgets, cards, subscriptions",
    category: "Money",
    query: "money",
    matcherNeedId: "money",
    recommendation: "Recommended helpers match budgets, cards, subscriptions, payment rules, and approval guardrails.",
    icon: CircleDollarSign
  },
  {
    id: "applications",
    title: "Apply for jobs",
    detail: "Jobs, school, forms, resumes",
    category: "Applications",
    query: "apply jobs resume school",
    matcherNeedId: "applications",
    recommendation: "Recommended helpers match resumes, applications, forms, and deadlines.",
    icon: FileText
  },
  {
    id: "family",
    title: "Handle life admin",
    detail: "Family, appointments, paperwork",
    category: "Family",
    query: "family admin appointment paperwork",
    matcherNeedId: "family",
    recommendation: "Recommended helpers match appointments, family coordination, paperwork, and household follow-up.",
    icon: Home
  },
  {
    id: "shopping",
    title: "Shop smarter",
    detail: "Compare options, subscriptions",
    category: "Shopping",
    query: "shopping",
    matcherNeedId: "shopping",
    recommendation: "Recommended helpers match product comparisons, subscriptions, preferences, and purchase approval.",
    icon: ShoppingBag
  },
  {
    id: "health",
    title: "Organize health notes",
    detail: "Private notes and appointment prep",
    category: "Health",
    query: "health",
    matcherNeedId: "health",
    recommendation: "Recommended helpers match private notes, appointment prep, and organizing health details.",
    icon: HeartPulse
  }
];

export const primaryOnboardingNeeds = onboardingNeeds.slice(0, 5);

type OnboardingPanelProps = {
  className: string;
  onBrowseAll: () => void;
  onSelectNeed: (need: OnboardingNeed) => void;
};

export function OnboardingPanel({ className, onBrowseAll, onSelectNeed }: OnboardingPanelProps) {
  return (
    <section className={className} aria-label="First helper setup">
      <div className="onboarding-copy">
        <div className="panel-title">Pick Your First Helper</div>
        <h2>What do you want help with first?</h2>
        <p>Choose a normal everyday task. Helpers start restricted, and you decide what private info or actions they can use.</p>
      </div>

      <div className="onboarding-choice-grid" aria-label="Common helper needs">
        {primaryOnboardingNeeds.map((need) => {
          const Icon = need.icon;
          return (
            <button
              className="onboarding-choice"
              data-testid={`onboarding-need-${need.id}`}
              key={need.id}
              onClick={() => onSelectNeed(need)}
              type="button"
            >
              <Icon size={18} />
              <span>{need.title}</span>
              <small>{need.detail}</small>
            </button>
          );
        })}
      </div>

      <div className="onboarding-footer">
        <div>
          <strong>Private by default</strong>
          <span>Helpers can suggest, organize, and draft. They cannot read private info, buy, book, send, or share without approval.</span>
        </div>
        <button onClick={onBrowseAll} type="button"><Search size={16} /> Browse all helpers</button>
      </div>
    </section>
  );
}
