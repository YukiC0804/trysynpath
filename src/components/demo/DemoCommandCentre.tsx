import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useWorkspaceTheme } from '../../hooks/useWorkspaceTheme';
import { useDemoAnalysis } from '../../hooks/useDemoAnalysis';
import { WorkspaceTopBar } from './workspace/WorkspaceTopBar';
import { WorkspaceSidebar } from './workspace/WorkspaceSidebar';
import { CommandCentreSection } from './sections/CommandCentreSection';
import { AlertsSection } from './sections/AlertsSection';
import { AgentsSection } from './sections/AgentsSection';
import { DashboardsSection } from './sections/DashboardsSection';
import { AppsSection } from './sections/AppsSection';
import { WorkflowsSection } from './sections/WorkflowsSection';
import { DataSourcesSection } from './sections/DataSourcesSection';
import { ActivitySection } from './sections/ActivitySection';
import {
  DEFAULT_CREATED_STATE,
  type WorkspaceCreatedState,
  type WorkspaceSection,
} from '../../types/workspace';

export function DemoCommandCentre() {
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('command');
  const [createdState, setCreatedState] = useState<WorkspaceCreatedState>(DEFAULT_CREATED_STATE);
  const analysis = useDemoAnalysis();
  const { theme, setWorkspaceTheme } = useWorkspaceTheme();

  const handleNavigate = useCallback((section: WorkspaceSection) => {
    setActiveSection(section);
  }, []);

  const handleWorkspaceAction = useCallback((actionId: string) => {
    setCreatedState((prev) => {
      const next = { ...prev };
      switch (actionId) {
        case 'daily-risk-agent':
          next.dailyRiskAgentCreated = true;
          break;
        case 'save-dashboard':
        case 'customer-dashboard':
          next.operationsDashboardSaved = true;
          break;
        case 'publish-app':
          next.orderEntryPublished = true;
          break;
        case 'estimating-tool':
          next.estimatingToolCreated = true;
          break;
        case 'approval-workflow':
          next.rfqAgentActivated = true;
          break;
        default:
          break;
      }
      return next;
    });
  }, []);

  const runPromptFromAlert = useCallback(
    (prompt: string) => {
      setActiveSection('command');
      analysis.setPrompt(prompt);
      analysis.runAnalysis(prompt);
    },
    [analysis],
  );

  const handleViewAlerts = useCallback(() => {
    setActiveSection('alerts');
  }, []);

  const handleBackToHome = useCallback(() => {
    setActiveSection('command');
    analysis.reset();
  }, [analysis]);

  return (
    <div
      className="demo-workspace flex h-screen flex-col overflow-hidden bg-black text-neutral-200"
      data-theme={theme}
    >
      <WorkspaceTopBar
        onBackToHome={handleBackToHome}
        theme={theme}
        onThemeChange={setWorkspaceTheme}
      />

      <div className="flex min-h-0 flex-1">
        <div className="hidden min-h-0 md:flex">
          <WorkspaceSidebar
            activeSection={activeSection}
            onNavigate={handleNavigate}
            recentPrompts={analysis.history}
            onSelectPrompt={runPromptFromAlert}
          />
        </div>

        {/* Mobile section tabs */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex gap-1 overflow-x-auto border-b border-neutral-800 bg-[#0a0a0a] px-2 py-2 md:hidden">
            {(
              [
                ['command', 'Command'],
                ['alerts', 'Alerts'],
                ['agents', 'Agents'],
                ['dashboards', 'Dashboards'],
                ['apps', 'Apps'],
                ['workflows', 'Workflows'],
                ['data', 'Data'],
                ['activity', 'Activity'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => handleNavigate(id)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeSection === id
                    ? 'bg-white/10 text-white'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              {activeSection === 'command' && (
                <CommandCentreSection
                  analysis={analysis}
                  onAction={handleWorkspaceAction}
                  onViewAlerts={handleViewAlerts}
                />
              )}
              {activeSection === 'alerts' && (
                <AlertsSection onRunPromptFromAlert={runPromptFromAlert} />
              )}
              {activeSection === 'agents' && <AgentsSection createdState={createdState} />}
              {activeSection === 'dashboards' && <DashboardsSection createdState={createdState} />}
              {activeSection === 'apps' && <AppsSection createdState={createdState} />}
              {activeSection === 'workflows' && <WorkflowsSection />}
              {activeSection === 'data' && <DataSourcesSection />}
              {activeSection === 'activity' && <ActivitySection createdState={createdState} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
