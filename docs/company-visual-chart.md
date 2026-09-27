# Company workspace presentation

The Company page starts with four keyboard-accessible disclosure buttons.
Their panels use a restrained height, opacity and content entrance transition;
closed content is inert. Reduced-motion preferences disable the animation.
The Hybrid organizational chart is open initially, with Visual chart selected.
The previous agent cards and their update actions remain under Cards & edit.
Owner guards, validations and storage are unchanged.

The visual chart is a top-down reporting forest: managers sit above their
direct reports, including cross-department reports. Full-size HTML cards show
department, title and recorded reporting manager; connector paths exist *only*
for saved `reports_to_agent_id` relationships. Active humans appear in a
separate governance band, since human reporting lines are not recorded in this
data model. Missing managers and cycles receive warnings and become separate
roots instead of false links. The default zoom is always 100% and never
automatically fits a wide chart into one tiny screen. Horizontal/vertical
scrolling, arrow navigation, search focus, optional zoom-in, keyboard selection
and an inspector provide access to larger hierarchies. Cards & edit retains
all previous editable fields and server actions.

The active company's name and logo now attach inside the current page's
header. The separate global account bar and its owner name were removed;
header space is reserved to prevent covering page actions. If a page has no
conventional header, the badge attaches inside its main content. Company
switching remounts the badge for the newly selected organization. The sidebar
still provides membership/account identity as it did before.

Validation: `npm run test:company-chart` covers tree topology, cross-department
reporting, inactive humans, cycles, missing managers, default full-size chart,
disclosure accessibility, existing actions and removal of the independent bar.
Existing customer and logo suites, typecheck and production build are also run.
The unrelated 2nya files are outside this change.
