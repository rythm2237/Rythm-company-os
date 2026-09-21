update public.commercial_offers
set summary = 'Fast + Smart AI modes with a shared monthly token allowance.',
    price_label = '€9.90 / month · ≈6.6M Fast/Luna or ≈660K Smart/Terra token-equivalent',
    features = '["≈6.6M Fast/Luna token-equivalent or ≈660K Smart/Terra token-equivalent from one shared monthly allowance","Fast + Smart modes","Normal mode","No rollover","Token capacity varies with input/output mix, caching, reasoning and routing"]'::jsonb,
    updated_at = now()
where offer_code = 'ai_workspace_starter';
