-- RYTHM Company OS — trusted Full-Stack Web Development specialization
-- Adds authoritative web/software engineering sources and a reusable technology specialization.

insert into public.knowledge_source_registry
(id,source_name,publisher,base_domain,canonical_url,source_type,authority_level,allowed_role_families,allowed_topics,freshness_class,enabled,notes,last_verified_at,next_review_at)
values
('50000000-0000-0000-0000-000000000006','MDN Web Docs — Web technology for developers','Mozilla','developer.mozilla.org','https://developer.mozilla.org/en-US/docs/Web','official_documentation','high',array['technology'],array['web platform','HTML','CSS','JavaScript','HTTP','web APIs','accessibility','performance'],'moderate',true,'Primary web-platform reference for RYTHM web-development competency coverage.',now(),now()+interval '90 days'),
('50000000-0000-0000-0000-000000000007','Next.js Documentation','Vercel','nextjs.org','https://nextjs.org/docs','official_documentation','high',array['technology'],array['Next.js','React','full-stack web applications','routing','rendering','server and client components','deployment'],'fast_changing',true,'Official Next.js documentation used for current full-stack framework practices.',now(),now()+interval '30 days'),
('50000000-0000-0000-0000-000000000008','React Documentation — Learn React','Meta Open Source','react.dev','https://react.dev/learn','official_documentation','high',array['technology'],array['React','components','state','rendering','hooks','frontend engineering'],'fast_changing',true,'Official React documentation used for frontend engineering competency coverage.',now(),now()+interval '30 days'),
('50000000-0000-0000-0000-000000000009','TypeScript Handbook','Microsoft','typescriptlang.org','https://www.typescriptlang.org/docs/handbook/intro.html','official_documentation','high',array['technology'],array['TypeScript','type systems','JavaScript','API contracts','software reliability'],'moderate',true,'Official TypeScript handbook used for typed JavaScript engineering competency coverage.',now(),now()+interval '60 days'),
('50000000-0000-0000-0000-000000000010','OWASP Web Security Testing Guide — Stable','OWASP Foundation','owasp.org','https://owasp.org/www-project-web-security-testing-guide/stable/','standards_body','primary',array['technology'],array['web application security','authentication','authorization','session management','input validation','API testing','client-side security'],'moderate',true,'Authoritative application-security testing reference for RYTHM web-development QA and secure engineering.',now(),now()+interval '60 days')
on conflict (canonical_url) do update set
  source_name=excluded.source_name,
  publisher=excluded.publisher,
  base_domain=excluded.base_domain,
  source_type=excluded.source_type,
  authority_level=excluded.authority_level,
  allowed_role_families=excluded.allowed_role_families,
  allowed_topics=excluded.allowed_topics,
  freshness_class=excluded.freshness_class,
  enabled=true,
  notes=excluded.notes,
  last_verified_at=excluded.last_verified_at,
  next_review_at=excluded.next_review_at,
  updated_at=now();

insert into public.role_specializations
(id,role_family,specialization_key,title,version,knowledge_content,source_ids,qa_rules,freshness_class,last_verified_at,next_review_at,active)
values
('40000000-0000-0000-0000-000000000020','technology','web_development','Full-Stack Web Development & Software Engineering','1',
 '[
   {"domain":"web platform and application architecture","competencies":["reason about browser, server, network and database boundaries","design maintainable full-stack application structure","choose server-side versus client-side execution deliberately","design HTTP and API contracts with explicit error behavior","separate presentation, domain, data and integration concerns"]},
   {"domain":"frontend engineering","competencies":["build component-based React interfaces","manage state and rendering intentionally","implement responsive layouts","preserve semantic HTML and keyboard usability","apply progressive enhancement where appropriate","prevent unnecessary client-side complexity"]},
   {"domain":"Next.js full-stack engineering","competencies":["structure routes and layouts","use server and client components intentionally","implement server-side data access and mutations safely","design cache and revalidation behavior","separate secrets and privileged operations from client bundles","prepare deployment-safe application changes"]},
   {"domain":"TypeScript and maintainability","competencies":["model domain and API contracts with useful types","avoid unsafe any-style escapes without justification","make nullability and error states explicit","prefer small cohesive modules and stable interfaces","refactor with regression protection"]},
   {"domain":"backend, data and identity","competencies":["design REST-style endpoints and server actions","validate untrusted input on the server","apply authentication and authorization as separate controls","use least-privilege database access and row-level controls where applicable","design safe schema changes and transactional data operations"]},
   {"domain":"web security","methods":["threat-aware design","authentication testing","authorization testing","session-management review","input-validation review","API and business-logic testing","client-side security review","secret and sensitive-data handling review"]},
   {"domain":"quality engineering","methods":["requirements decomposition","architecture review","unit and integration testing","end-to-end critical-flow testing","root-cause analysis","regression testing","build and CI verification","observability review","reversible release planning"]},
   {"domain":"performance and accessibility","methods":["measure before optimizing","inspect rendering, network and bundle costs","minimize unnecessary client work","validate responsive behavior","apply WCAG-aware semantic, contrast, focus and keyboard practices","test critical user journeys under realistic conditions"]}
 ]'::jsonb,
 array[
   '50000000-0000-0000-0000-000000000006'::uuid,
   '50000000-0000-0000-0000-000000000007'::uuid,
   '50000000-0000-0000-0000-000000000008'::uuid,
   '50000000-0000-0000-0000-000000000009'::uuid,
   '50000000-0000-0000-0000-000000000010'::uuid,
   '10000000-0000-0000-0000-000000000001'::uuid
 ],
 '[
   "Never claim a build, test, security check or deployment passed unless it was actually executed or verified.",
   "Validate untrusted input server-side and enforce authorization at the protected resource or operation, not only in the UI.",
   "Never expose secrets, service credentials, privileged tokens or confidential configuration to client bundles, logs or generated examples.",
   "Treat authentication and authorization as distinct controls and apply least privilege to database, API and tool access.",
   "Test expected success, validation failures, authorization failures, edge cases and regression-sensitive paths before declaring a change production-ready.",
   "For database or infrastructure changes, prefer backward-compatible, reversible migrations and require Human CEO approval for destructive production actions.",
   "Review accessibility, responsive behavior and meaningful performance impact for user-facing changes.",
   "Use current official framework documentation for version-sensitive behavior and state uncertainty when runtime/version evidence is unavailable.",
   "Keep changes minimal, maintainable and traceable to requirements; document material architectural trade-offs."
 ]'::jsonb,
 'fast_changing',now(),now()+interval '30 days',true)
on conflict (id) do update set
  role_family=excluded.role_family,
  specialization_key=excluded.specialization_key,
  title=excluded.title,
  version=excluded.version,
  knowledge_content=excluded.knowledge_content,
  source_ids=excluded.source_ids,
  qa_rules=excluded.qa_rules,
  freshness_class=excluded.freshness_class,
  last_verified_at=excluded.last_verified_at,
  next_review_at=excluded.next_review_at,
  active=true,
  updated_at=now();