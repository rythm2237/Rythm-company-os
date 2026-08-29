export type AgentTaskState = {
  status: "idle" | "success" | "error";
  output?: string;
  error?: string;
  correlationId?: string;
  routing?: string;
  knowledgeCount?: number;
};

export const initialAgentTaskState: AgentTaskState = { status: "idle" };
