import type { Metadata } from "next";
import { LegalDocumentShell } from "@/components/marketing/LegalDocumentShell";
import { MARKETING_BRAND_NAME } from "@/lib/marketingBrand";

export const metadata: Metadata = {
  title: `Privacy Policy — ${MARKETING_BRAND_NAME}`,
  description: `Privacy Policy for the ${MARKETING_BRAND_NAME} software platform.`,
};

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentShell title="Privacy Policy">
      <p>
        <strong>Last updated:</strong> July 13, 2026
      </p>
      <p>
        This Privacy Policy describes how {MARKETING_BRAND_NAME} (&quot;we,&quot;
        &quot;us,&quot; or &quot;our&quot;) collects, uses, discloses, and
        protects information when you use our websites, applications, and related
        services (the &quot;Service&quot;).
      </p>

      <h2>1. Who We Are</h2>
      <p>
        {MARKETING_BRAND_NAME} provides software infrastructure for commercial
        brokers, lenders, and funding professionals to manage deals, documents,
        client portals, and pipeline workflows. We are a technology provider — not
        a lender or broker — and process data on behalf of our customers to
        facilitate their business operations.
      </p>

      <h2>2. Information We Collect</h2>
      <h3>Information you provide</h3>
      <ul>
        <li>Account and profile information (name, email, organization, role).</li>
        <li>
          Deal and contact data you enter into the CRM and pipeline workspace.
        </li>
        <li>
          Documents and files uploaded to the document vault, client portals, and
          lender delivery rooms — which may include financial statements, tax
          returns, identification, contracts, and other sensitive business records.
        </li>
        <li>Communications you send through or in connection with the Service.</li>
        <li>Support requests and feedback.</li>
      </ul>
      <h3>Information collected automatically</h3>
      <ul>
        <li>Log data (IP address, browser type, device identifiers, timestamps).</li>
        <li>Usage analytics and performance diagnostics.</li>
        <li>Cookies and similar technologies for authentication and preferences.</li>
      </ul>

      <h2>3. How We Use Information</h2>
      <p>We use information to:</p>
      <ul>
        <li>Provide, maintain, and secure the Service.</li>
        <li>Authenticate users and enforce access controls.</li>
        <li>Facilitate document exchange between parties you authorize.</li>
        <li>Send transactional notifications, including task reminders and portal alerts.</li>
        <li>Improve reliability, performance, and product features.</li>
        <li>Comply with legal obligations and prevent fraud or abuse.</li>
      </ul>

      <h2>4. How We Share Information</h2>
      <p>
        <strong>
          We do not sell your personal information or uploaded deal documents.
        </strong>{" "}
        We share information only as follows:
      </p>
      <ul>
        <li>
          <strong>With parties you explicitly link or invite</strong> — including
          clients, borrowers, lenders, and partners granted access through portals,
          upload links, or data rooms you configure.
        </li>
        <li>
          <strong>With service providers</strong> who assist in hosting, storage,
          email/SMS delivery, analytics, and security — under contractual
          confidentiality and data-processing obligations.
        </li>
        <li>
          <strong>For legal reasons</strong> when required by law, subpoena, or to
          protect rights, safety, and integrity of the Service.
        </li>
        <li>
          <strong>In a business transfer</strong> such as merger or acquisition,
          subject to continued protection consistent with this Policy.
        </li>
      </ul>

      <h2>5. Data Security</h2>
      <p>
        We implement administrative, technical, and organizational safeguards
        designed to protect data, including encryption in transit, access controls,
        tenant isolation, audit logging, and secure United States-based
        infrastructure. No method of transmission or storage is 100% secure; you
        are responsible for safeguarding credentials and configuring appropriate
        internal access policies.
      </p>

      <h2>6. Data Retention</h2>
      <p>
        We retain information for as long as your account is active or as needed to
        provide the Service, comply with law, resolve disputes, and enforce
        agreements. You may request deletion subject to legal and operational
        requirements.
      </p>

      <h2>7. SMS &amp; A2P 10DLC Messaging</h2>
      <p>
        If you enable SMS notifications through the Service, messages are sent only
        to recipients for whom you have obtained appropriate consent under the
        Telephone Consumer Protection Act (TCPA) and applicable A2P 10DLC
        registration requirements. Message frequency varies by deal activity.
        Recipients may opt out by replying STOP where supported; reply HELP for
        assistance. Message and data rates may apply. You are responsible for
        maintaining compliant consent records for your contacts.
      </p>

      <h2>8. Your Rights &amp; Choices</h2>
      <p>
        Depending on your jurisdiction, you may have rights to access, correct,
        delete, or export personal information, or to object to certain processing.
        Contact us through your account representative to submit a request. We will
        verify requests as required by law.
      </p>

      <h2>9. International Users</h2>
      <p>
        The Service is operated from the United States. If you access the Service
        from other regions, you consent to transfer and processing in the U.S.,
        which may have different data protection laws than your jurisdiction.
      </p>

      <h2>10. Children</h2>
      <p>
        The Service is not directed to individuals under 18. We do not knowingly
        collect personal information from children.
      </p>

      <h2>11. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy periodically. The &quot;Last updated&quot;
        date reflects the current version. Material changes will be posted on this
        page.
      </p>

      <h2>12. Contact</h2>
      <p>
        Privacy inquiries may be submitted through your account representative or
        the support channels provided in your workspace.
      </p>
    </LegalDocumentShell>
  );
}
