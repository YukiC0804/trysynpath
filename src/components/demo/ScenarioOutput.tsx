import { Database, Sparkles } from 'lucide-react';
import type { DemoScenario } from '../../data/demoScenarios';
import { RiskCard } from './RiskCard';
import { RecommendedActions } from './RecommendedActions';
import { QuoteBreakdown } from './QuoteBreakdown';
import { RescheduleTimeline, EstimatingCalculator } from './RescheduleTimeline';
import { AppBuilderPreview } from './AppBuilderPreview';
import { DashboardPreview } from './DashboardPreview';
import { StatusBadge } from './StatusBadge';

interface ScenarioOutputProps {
  scenario: DemoScenario;
  showOutput: boolean;
  isLoading: boolean;
}

export function ScenarioOutput({ scenario, showOutput, isLoading }: ScenarioOutputProps) {
  if (isLoading) {
    return (
      <div className="space-y-3 rounded-xl border border-neutral-800 bg-[#0a0a0a] p-5">
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <Sparkles className="h-4 w-4 animate-pulse text-violet-400" />
          Pulling data from connected systems...
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-900" />
        ))}
      </div>
    );
  }

  if (!showOutput) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/30 p-8 text-center">
        <Sparkles className="mx-auto mb-3 h-8 w-8 text-neutral-600" />
        <p className="text-sm text-neutral-500">Run the prompt to see AI analysis across your connected systems</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge variant="ai">AI output</StatusBadge>
        <span className="text-xs text-neutral-500">Synthesised from {scenario.dataSources.length} data sources</span>
      </div>

      {renderScenarioContent(scenario)}

      {scenario.id === 'rfq-quote' && (
        <RecommendedActions
          actions={['Approve quote draft', 'Send to sales team for review']}
          title="Recommended next step"
        />
      )}
    </div>
  );
}

function renderScenarioContent(scenario: DemoScenario) {
  switch (scenario.id) {
    case 'urgent-order':
      return (
        <>
          <RiskCard
            customer="Bosch"
            order="SO-1048"
            dueDate="12 Jul"
            risk="High"
            impact="£84,000"
            erpStatus="In production"
            rootCauses={['Material shortage', 'Machine bottleneck', 'Supplier delay', 'Quality rework']}
            signals={[
              { label: 'Material', detail: 'Aluminium casing material shortage' },
              { label: 'Supplier', detail: 'PO-7782 from MetalWorks Ltd delayed by 2 days' },
              { label: 'Capacity', detail: 'Line 3 running at 96% utilisation' },
              { label: 'Machine', detail: 'CNC-04 had 2.5 hours downtime' },
              { label: 'Quality', detail: 'Rework issue on Job J-883' },
            ]}
          />
          <RecommendedActions
            actions={[
              'Expedite PO-7782 from MetalWorks Ltd',
              'Move Job J-901 from Line 3 to Line 2',
              'Prioritise CNC-04 maintenance check before next shift',
              'Notify Bosch account manager with updated delivery confidence',
            ]}
          />
        </>
      );

    case 'rfq-quote':
      return (
        <QuoteBreakdown
          customer="Schneider Electric"
          product="Custom aluminium housing"
          quantity={2000}
          delivery="4 weeks required"
          specs={[
            { label: 'Material', value: 'Aluminium 6061' },
            { label: 'Finishing', value: 'Anodised black' },
            { label: 'Tolerance', value: '±0.05mm' },
          ]}
          costs={{
            material: '£8,420',
            machine: '£14,200',
            labour: '£9,800',
            overhead: '£6,180',
            unitCost: '£18.40',
            price: '£27.50',
            margin: '33.1%',
            leadTime: '23 working days',
            confidence: '87%',
          }}
        />
      );

    case 'rescheduling':
      return (
        <RescheduleTimeline
          before={[
            { id: 'J-883', line: 'Line 3 · Bosch priority', priority: 'High' },
            { id: 'J-901', line: 'Line 3 · ABB order', priority: 'High' },
            { id: 'J-902', line: 'Line 2 · Internal batch' },
          ]}
          after={[
            { id: 'J-883', line: 'Line 3 · Bosch priority', priority: 'High', note: 'Kept — high priority' },
            { id: 'J-901', line: 'Line 2 · ABB order', priority: 'High', note: 'Moved from Line 3' },
            { id: 'J-902', line: 'Line 2 · Split run', note: 'Split into two smaller runs' },
          ]}
          changes={[
            'Keep J-883 on Line 3 because Bosch order is high priority',
            'Move J-901 to Line 2 to relieve CNC-04 bottleneck',
            'Delay lower-priority internal batch by 1 day',
            'Split J-902 into two smaller runs on Line 2',
          ]}
          impact={{
            lateBefore: '3',
            lateAfter: '1',
            revenueProtected: '£122,000',
            capacityRecovered: '5.5 hours',
          }}
        />
      );

    case 'estimating':
      return <EstimatingCalculator />;

    case 'order-entry':
      return <AppBuilderPreview />;

    case 'build-dashboard':
      return <DashboardPreview />;

    default:
      return null;
  }
}

export function DataSourcesList({ sources }: { sources: string[] }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Database className="h-4 w-4 text-neutral-500" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Connected data sources</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {sources.map((source) => (
          <span
            key={source}
            className="rounded-full border border-neutral-800 bg-black/40 px-2.5 py-1 text-xs text-neutral-400"
          >
            {source}
          </span>
        ))}
      </div>
    </div>
  );
}
