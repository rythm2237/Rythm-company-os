import React from "react";
import { createRoot } from "react-dom/client";
import { ProjectSetupWizard } from "../../components/projects/project-setup-wizard";
if(new URLSearchParams(location.search).has("reset")){localStorage.clear();history.replaceState(null,"",location.pathname);}
const userId = "11111111-1111-4111-8111-111111111111";
createRoot(document.getElementById("root")!).render(<main className="command-shell"><section className="panel"><ProjectSetupWizard organizationId="22222222-2222-4222-8222-222222222222" userId={userId} customers={[{ id: "customer", name: "Vegan Restaurant", industry: "Hospitality", country_code: "HU", website_url: "https://restaurant.example" }]} members={[{ user_id: userId, display_name: "Human Manager" }]} initialCustomer={new URLSearchParams(location.search).get("customer") || ""} action={async form => { const response = await fetch("/create", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) }); if (!response.ok) throw new Error("Creation failed"); document.body.dataset.created = "true"; }}/></section></main>);
