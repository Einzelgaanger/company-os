import { Link } from "react-router-dom";
import { LegalPage } from "@/pages/legal/LegalPage";
import { BRAND } from "@/lib/brand";

const UPDATED = "15 September 2026";

export default function Terms() {
  return (
    <LegalPage
      kicker="Legal"
      title="Terms of Service"
      updated={UPDATED}
      intro={`These terms govern use of ${BRAND.name} — the agentic chief of staff for capturing commitments, prompting people, unblocking work, and reporting on projects. By creating an account or using a workspace, you agree to them.`}
      other={{ to: "/privacy-policy", label: "Read the Privacy Policy →" }}
      sections={[
        {
          id: "service",
          title: "The service",
          body: (
            <>
              <p>
                {BRAND.name} coordinates work already in motion: it makes waiting visible, checks in with owners,
                escalates with context, and produces reports for people who run projects. It is{" "}
                <strong>not</strong> a task manager in the Asana/Jira sense, not a general-purpose chatbot, and not
                a human-resources or performance-management system.
              </p>
              <p>
                Features may vary by plan, region, and what your organization enables (channels, connectors,
                coordination mode).
              </p>
            </>
          ),
        },
        {
          id: "accounts",
          title: "Accounts and workspaces",
          body: (
            <>
              <p>
                You must provide accurate account information and keep credentials confidential. Workspace admins
                control invites, roles, connectors, and messaging. If you use {BRAND.name} for an organization, you
                represent that you have authority to bind that organization to these terms.
              </p>
              <p>
                We may suspend access for security, unpaid invoices (when billing applies), or material breach.
              </p>
            </>
          ),
        },
        {
          id: "acceptable",
          title: "Acceptable use",
          body: (
            <>
              <p>You will not:</p>
              <ul>
                <li>Use the product to score, rank, or evaluate individuals for promotion, discipline, or firing.</li>
                <li>Attempt to infer emotions, mood, or wellbeing of people from biometrics, voice, or video.</li>
                <li>Probe, overload, or bypass security, tenancy, or messaging opt-out controls.</li>
                <li>Upload unlawful content or use the service to spam people outside work-coordination templates.</li>
                <li>Reverse engineer the service except where the law allows.</li>
              </ul>
              <p>
                A customer that uses {BRAND.name} as the basis for employment decisions becomes the deployer of a
                high-risk AI system under the EU AI Act and takes on those obligations themselves. We prohibit that
                use in the product and in these terms.
              </p>
            </>
          ),
        },
        {
          id: "customer-data",
          title: "Your content",
          body: (
            <>
              <p>
                You and your organization retain rights to workspace content. You grant us a limited licence to host,
                process, and transmit that content solely to provide and secure the service, including subprocessors
                listed in the <Link to="/privacy-policy">Privacy Policy</Link>.
              </p>
              <p>
                You are responsible for having a lawful basis and giving required notice before monitoring employees
                or connecting inboxes, calendars, or chat.
              </p>
            </>
          ),
        },
        {
          id: "ai",
          title: "Models and automation",
          body: (
            <>
              <p>
                Parts of the service use machine learning to extract commitments, classify replies, and draft
                report prose. Numbers in reports are computed from your data; models must not invent percentages.
                Extraction can be wrong — humans remain responsible for confirming the review queue and acting on
                escalations.
              </p>
              <p>
                Recipients of outbound messages are resolved from your directory, not invented by a model. Check-ins
                use governed templates, not free-form chat on WhatsApp.
              </p>
            </>
          ),
        },
        {
          id: "availability",
          title: "Availability and liability",
          body: (
            <>
              <p>
                We aim for a reliable service but do not warrant uninterrupted operation. To the fullest extent
                permitted by law, {BRAND.name} is provided “as is,” and we are not liable for lost profits,
                indirect damages, or decisions you make from reports. Our aggregate liability for a claim is limited
                to fees paid for the service in the three months before the claim (or USD 100 if you are on a
                free/pilot workspace with no fees).
              </p>
              <p>Nothing in these terms limits liability that cannot be limited under applicable law.</p>
            </>
          ),
        },
        {
          id: "law",
          title: "Law, changes, contact",
          body: (
            <>
              <p>
                These terms are governed by the laws applicable to the operator of this instance, without regard to
                conflict-of-law rules. If a provision is unenforceable, the rest remains in effect.
              </p>
              <p>
                We may update these terms; the date above will change. Continued use after posting constitutes
                acceptance. Related: <Link to="/privacy-policy">Privacy Policy</Link>.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
