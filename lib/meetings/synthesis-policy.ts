/** Template leads may synthesize advice; Human CEO authority is unchanged. */
export function isMeetingSynthesizer(agent: { agent_code: string } | null | undefined): boolean {
  return agent?.agent_code === "B-001" || agent?.agent_code === "STRATEGY_DIRECTOR";
}
export function selectMeetingSynthesizer<T extends { agent_code: string; enabled: boolean }>(agents: T[]): T | undefined {
  return agents.find(agent => agent.enabled && agent.agent_code === "B-001")
    ?? agents.find(agent => agent.enabled && isMeetingSynthesizer(agent));
}
