-- The application accesses data through its authenticated backend. Enabling RLS
-- prevents accidental direct access through the Supabase Data API. The database
-- owner used by Prisma bypasses RLS; no anon/authenticated policies are created.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'shopping_lists', 'appointments', 'life_transactions', 'financial_accounts',
    'user_agent_installs', 'user_connections', 'agent_permissions', 'activity_logs',
    'vault_documents', 'hitl_requests', 'notifications', 'agent_conversations',
    'agent_messages', 'agent_runs', 'agent_run_steps', 'tool_runs', 'provider_receipts',
    'provider_connections', 'connected_accounts', 'workflow_connections', 'agent_traces',
    'creator_profiles', 'creator_access_requests', 'agent_definitions', 'agent_versions',
    'provider_definitions', 'agents', 'vault_schemas'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    END IF;
  END LOOP;
END $$;
