import { switchOrganization } from "@/app/organization-context/actions";

type Props = {
  activeOrganizationId: string;
  activeOrganizationName: string;
  activeRole: string;
  productCode?: string | null;
  entitlementStatus?: string | null;
  organizations: Array<{ id: string; name: string; role: string }>;
};

const productLabel: Record<string, string> = {
  ready_company: "Ready Company",
  custom_company: "Custom Company",
  company_studio: "Company Studio",
};

export default function OrganizationSwitcher({
  activeOrganizationId,
  activeOrganizationName,
  activeRole,
  productCode,
  entitlementStatus,
  organizations,
}: Props) {
  return (
    <section
      aria-label="Active organization context"
      style={{
        maxWidth: 1440,
        margin: "10px auto 0",
        padding: "0 22px",
        display: "flex",
        gap: 12,
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <strong>{activeOrganizationName}</strong>
        <span style={{ color: "#687386", fontSize: ".82rem" }}>{activeRole}</span>
        {productCode ? <span className="pill">{productLabel[productCode] ?? productCode}</span> : null}
        {entitlementStatus ? <span className="pill">{entitlementStatus}</span> : null}
      </div>
      {organizations.length > 1 ? (
        <form action={switchOrganization} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="hidden" name="next" value="/command-center" />
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: ".82rem" }}>
            Company
            <select name="organizationId" defaultValue={activeOrganizationId} aria-label="Active company">
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name} — {organization.role}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button" type="submit">Switch</button>
        </form>
      ) : null}
    </section>
  );
}
