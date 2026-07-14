export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function envPresence(names: readonly string[]) {
  const present: Record<string, boolean> = {};
  const missing: string[] = [];
  for (const name of names) {
    const ok = Boolean(getEnv(name));
    present[name] = ok;
    if (!ok) missing.push(name);
  }
  return {
    present,
    missing,
    configured: missing.length === 0,
    // Env vars are snapshotted into each deployment. After adding or updating
    // a Vercel Project env var, a new deployment is required before process.env sees it.
    redeployHint:
      'If a variable exists in Vercel Project Settings but is missing here, redeploy this Preview/Production deployment so the new value is injected.',
  };
}
