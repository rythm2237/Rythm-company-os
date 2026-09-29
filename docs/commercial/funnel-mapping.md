# Public Beta commercial selection

Activation model: assisted B2B invoice confirmation; signup is not an online purchase. See `activation-model.md`.

| Public choice | Template key | Offer | Entitlement product | Plan | Monthly base price | Capacity |
| --- | --- | --- | --- | --- | --- | --- |
| AI Advertising Agency | `ready_ai_advertising_agency_v1` | `ready_ai_company` | `ready_company` | `public_beta` | €249 + AI usage | 12 Agents (11 template roles and communications) |
| Software Company | `ready_software_company_v1` | `custom_ai_company` | `company_studio` | `public_beta` | €699 + AI usage | 50 Agents (19 template roles) |
| Custom AI Company | — | `custom_ai_company` | `company_studio` | `public_beta` | €699 + AI usage | 50 Agents |
| Ready AI Company, template chosen later | — | `ready_ai_company` | `ready_company` | `public_beta` | €249 + AI usage | 12 Agents |

The Software Company is a predefined Ready Company **template** but requires the Company Studio **product entitlement** in the current Production catalog. Its public card discloses the plan and price. The preview SaaS Startup remains a demo choice, not a paid selection.

`lib/commercial/selection.ts` defines public template-to-offer selection. The `commercial_offers` table supplies the authoritative offer price. `provision_commercial_company_v1` checks the offer, active stable template, product support, plan and capacity before creating the pending customer organization. It records the template key on that organization's entitlement. A pending entitlement does not authorize template installation. Once active, the selected template opens in the library for an explicit provisioning action.

The generic Get Started path asks for a product choice on Pricing or Templates. Email verification, OAuth, login retry and refresh retain the chosen product and template through URL parameters. Organization-specific selection is persisted on the entitlement rather than inferred from mutable user metadata after setup.
