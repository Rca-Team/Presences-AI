import { auth, defineMcp } from '@lovable.dev/mcp-js';
import getSchoolOverviewTool from './tools/get-school-overview';
import listRecentGateEntriesTool from './tools/list-recent-gate-entries';

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? 'project-ref-unset';

export default defineMcp({
  name: 'presences-mcp',
  title: 'Presences MCP',
  version: '0.1.0',
  instructions:
    'Use these tools to read school attendance summaries and recent gate entries from the Presences app for the signed-in user.',
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: 'authenticated',
  }),
  tools: [getSchoolOverviewTool, listRecentGateEntriesTool],
});
