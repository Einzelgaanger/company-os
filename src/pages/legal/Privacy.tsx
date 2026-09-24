import { Link } from "react-router-dom";
import { LegalPage } from "@/pages/legal/LegalPage";
import { BRAND } from "@/lib/brand";

const UPDATED = "15 September 2026";

export default function Privacy() {
  return (
    <LegalPage
      kicker="Legal"
      title="Privacy Policy"
      updated={UPDATED}
      intro={`${BRAND.name} is a work-coordination system: your agentic chief of staff. This policy explains what we process, why and the controls you and your organization have. It is not a performance-evaluation or HR analytics product.`}
      other={{ to: "/terms-of-service", label: "Read the Terms of Service →" }}
      sections={[
        {
          id: "who",
          title: "Who this covers",
          body: (
            <>
              <p>
                This policy applies to the public website, account creation and the {BRAND.name} workspace
                product. Your <strong>organization</strong> (the customer that created the workspace) is typically
                the controller of workplace data. We process that data to provide the service they configured.
              </p>
              <p>
                If you use {BRAND.name} at work, your employer’s policies and the transparency notice you
                acknowledge at onboarding also apply. You can review what the product holds about you under
                Settings → My data.
              </p>
            </>
          ),
        },
        {
          id: "collect",
          title: "What we collect",
          body: (
            <>
              <p>Depending on how the workspace is set up, we may process:</p>
              <ul>
                <li>
                  <strong>Account data</strong>: name, email, role, optional phone number for messaging and
                  authentication records.
                </li>
                <li>
                  <strong>Work data</strong>: commitments, owners, due dates, check-in replies, blockers,
                  escalations, project metadata and generated reports about <em>work items and projects</em>.
                </li>
                <li>
                  <strong>Messages we send or receive for coordination</strong>: in-app Chat (default), Telegram
                  and WhatsApp when a person links a channel, plus email notices or reports where configured.
                  Message bodies are work check-ins, not general person-to-person chat.
                </li>
                <li>
                  <strong>Connected sources</strong>: calendars, meeting notes or other connectors an admin
                  enables. Meeting audio and video are not stored.
                </li>
                <li>
                  <strong>Technical data</strong>: logs needed to operate, secure and debug the service.
                </li>
              </ul>
              <p>
                We do not collect biometric identifiers, voiceprints or camera feeds. We do not infer emotions
                of individuals.
              </p>
            </>
          ),
        },
        {
          id: "use",
          title: "How we use data",
          body: (
            <>
              <p>We use personal data to:</p>
              <ul>
                <li>Run the workspace: capture commitments, send check-ins, route unblocks and produce reports.</li>
                <li>Authenticate you, keep sessions secure and honour opt-outs (for example STOP on messaging).</li>
                <li>Meet legal obligations and respond to verified data-subject requests from your organization.</li>
              </ul>
              <p>
                Reports describe waiting time, blockers and project health. They are <strong>not</strong> a measure
                of individual performance and must not be used for promotion, discipline or termination.
              </p>
            </>
          ),
        },
        {
          id: "lawful",
          title: "Lawful basis",
          body: (
            <>
              <p>
                For workplace monitoring and coordination, employee “consent” is usually not a valid basis because
                of the imbalance of power. Organizations typically rely on <strong>legitimate interests</strong>{" "}
                (GDPR Art. 6(1)(f)) and equivalent grounds under Kenya’s Data Protection Act, with a DPIA and
                prior notice where required. Contract (providing the SaaS) and legal obligation may also apply.
              </p>
              <p>
                Messaging to individuals is sent only after the product’s eligibility and opt-in rules are met for
                that person.
              </p>
            </>
          ),
        },
        {
          id: "share",
          title: "Who we share with",
          body: (
            <>
              <p>
                We do not sell personal data. We share it with subprocessors who help us run the product, under
                contract, for example:
              </p>
              <ul>
                <li>Hosting and database (currently including Render and Supabase, depending on environment).</li>
                <li>Model inference for extraction and summaries (sanitized prompts; no tools on the reader).</li>
                <li>Telegram, WhatsApp or email providers for check-ins and notices you enabled.</li>
                <li>Optional identity (SSO / directory) if your admin connects it.</li>
              </ul>
              <p>
                Admins choose who can see reports (organization, team or project scope). We do not disclose
                workspace content to other customers.
              </p>
            </>
          ),
        },
        {
          id: "retention",
          title: "Retention and security",
          body: (
            <>
              <p>
                Retention follows the workspace settings (including data-retention months where configured) and
                legal holds. Check-in content is kept as part of the commitment trail. We use access control,
                encryption in transit and tenant isolation on the production data plane.
              </p>
              <p>
                No method is perfect. You should use strong passwords, SSO where offered and report suspected
                misuse to your workspace admin.
              </p>
            </>
          ),
        },
        {
          id: "rights",
          title: "Your rights",
          body: (
            <>
              <p>
                Depending on where you live, you may have rights to access, correct, export, restrict or request
                erasure of personal data and to object to certain processing. For workplace data, start with your
                organization and Settings → My data. You may also contact the operator of this instance or your
                supervisory authority (including Kenya’s ODPC where applicable).
              </p>
            </>
          ),
        },
        {
          id: "contact",
          title: "Contact and changes",
          body: (
            <>
              <p>
                We may update this policy. Material changes will be posted on this page with a new effective date.
                Questions: ask your workspace admin or use the in-product data tools. Related:{" "}
                <Link to="/terms-of-service">Terms of Service</Link>.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
