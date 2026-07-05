export type WorkspaceSection =
  | 'command'
  | 'alerts'
  | 'agents'
  | 'dashboards'
  | 'apps'
  | 'workflows'
  | 'data'
  | 'activity';

export interface WorkspaceCreatedState {
  dailyRiskAgentCreated: boolean;
  operationsDashboardSaved: boolean;
  orderEntryPublished: boolean;
  estimatingToolCreated: boolean;
  rfqAgentActivated: boolean;
}

export const DEFAULT_CREATED_STATE: WorkspaceCreatedState = {
  dailyRiskAgentCreated: false,
  operationsDashboardSaved: false,
  orderEntryPublished: false,
  estimatingToolCreated: false,
  rfqAgentActivated: false,
};
