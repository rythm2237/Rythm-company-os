# Company workspace presentation

The Company page now starts with short, native keyboard-accessible disclosure
rows for Official identity, Structure and Human workforce. The Hybrid
organizational chart disclosure is open initially, and its Visual chart view
is the default. The previous agent cards and their existing update actions
remain intact under Cards & edit. Owner guards, validations and storage are
unchanged; no new reporting relationships are persisted by the visualization.

The chart includes active humans and non-archived AI positions grouped by
department. Its arrows represent *only* recorded agent `reports_to_agent_id`
relationships. Human reporting lines are marked Not recorded because none
exists in this data model. Department leads are shown only where a recorded
manager-agent binding exists. Missing managers and cycles receive warnings;
the chart never guesses a relationship. Zoom/Fit width, horizontal scrolling,
search highlighting, keyboard selection and a full position inspector work
without altering the saved organizational structure. Cards & edit retains
the previous editable fields and server actions.

The active company's name and logo now attach inside the current page's
header. The separate global account bar and its owner name were removed;
header space is reserved to prevent covering page actions. If a page has no
conventional header, the badge attaches inside its main content. Company
switching remounts the badge for the newly selected organization. The sidebar
still provides membership/account identity as it did before.

Validation: `npm run test:company-chart` covers topology, cross-department
reporting, inactive humans, cycles, missing managers, default chart markup,
collapsed sections, existing actions and removal of the independent bar.
Existing customer and logo suites, typecheck and production build are also run.
The unrelated 2nya files are outside this change.
