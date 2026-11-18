type TaskOutput = {
  id: string;
  title: string;
  completed_at: string | null;
  safe_result: unknown;
};

export function ProjectTaskResults({ tasks }: { tasks: TaskOutput[] }) {
  return <section className="panel project-view-panel" aria-labelledby="generated-work-heading">
    <div className="panel-heading"><div><p className="label">Persisted agent work</p><h2 id="generated-work-heading">Generated work outputs</h2></div></div>
    <p className="security-note">Agent-produced content. Review the evidence before accepting implementation or business outcomes.</p>
    {tasks.length ? tasks.map(task => {
      const output = task.safe_result && typeof task.safe_result === "object" && !Array.isArray(task.safe_result)
        ? task.safe_result as Record<string, unknown> : {};
      const deliverables = Array.isArray(output.deliverables) ? output.deliverables : [];
      return <article key={task.id} className="panel" style={{ minWidth: 0 }}>
        <h3>{task.title}</h3>
        {task.completed_at ? <time dateTime={task.completed_at}>{new Date(task.completed_at).toLocaleString("en-GB")}</time> : null}
        {typeof output.summary === "string" ? <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{output.summary}</p> : null}
        {deliverables.map((item, index) => <pre key={index} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxWidth: "100%" }}>{typeof item === "string" ? item : JSON.stringify(item, null, 2)}</pre>)}
      </article>;
    }) : <p className="empty-state">No completed task outputs have been recorded.</p>}
  </section>;
}
