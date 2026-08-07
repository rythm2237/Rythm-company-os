-- RYTHM Legal Review Calibration v2
-- Distinguishes strategic legal conditions from execution-level legal gates.

alter table public.meeting_legal_reviews
  add column if not exists legal_applicability text
    check (legal_applicability is null or legal_applicability in (
      'STRATEGIC_CONDITIONS_ONLY',
      'EXECUTION_REVIEW_REQUIRED',
      'LICENSED_COUNSEL_REQUIRED'
    )),
  add column if not exists calibration_version smallint not null default 1
    check (calibration_version >= 1);

comment on column public.meeting_legal_reviews.legal_applicability is
  'Calibrated legal scope: strategic conditions only, execution review required, or licensed counsel required.';
comment on column public.meeting_legal_reviews.calibration_version is
  'Legal review policy calibration version. Version 2 separates strategic direction from execution authorization.';
