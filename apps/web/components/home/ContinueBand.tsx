import { ContinueCard } from '@/components/design-system';

export function ContinueBand() {
  return (
    <section className="mt-auto px-16 pb-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-[12.5px] font-medium text-text-secondary">Continue where you left off</h2>
        <button className="text-[12px] text-text-tertiary hover:text-text-primary" type="button">
          View all tasks
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <ContinueCard
          meta="Step 4 of 7 · ~3 min remaining"
          status="RUNNING"
          tag="Browser"
          title="Pull Q2 churn cohorts from Mixpanel"
        />
        <ContinueCard meta="Waiting for your approval" status="WAITING" tag="Writing" title="Draft launch announcement for Loop" />
        <ContinueCard
          meta="Completed 22 min ago · 6 files changed"
          status="STOPPED"
          tag="Build"
          title="Refactor settings page in handle-web"
        />
      </div>
    </section>
  );
}
