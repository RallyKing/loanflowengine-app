import type { Metadata } from "next";
import { LegalDocumentShell } from "@/components/marketing/LegalDocumentShell";
import { MARKETING_BRAND_NAME } from "@/lib/marketingBrand";

export const metadata: Metadata = {
  title: `Terms of Service — ${MARKETING_BRAND_NAME}`,
  description: `Terms of Service for the ${MARKETING_BRAND_NAME} software platform.`,
};

export default function TermsOfServicePage() {
  return (
    <LegalDocumentShell title="Terms of Service">
      <p>
        <strong>Last updated:</strong> July 13, 2026
      </p>
      <p>
        These Terms of Service (&quot;Terms&quot;) govern access to and use of
        the {MARKETING_BRAND_NAME} platform, websites, APIs, and related services
        (collectively, the &quot;Service&quot;) operated by {MARKETING_BRAND_NAME}{" "}
        (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By accessing or
        using the Service, you agree to these Terms.
      </p>

      <h2>1. Nature of the Service</h2>
      <p>
        {MARKETING_BRAND_NAME} is a <strong>software infrastructure provider</strong>.
        We provide tools for document management, deal pipelines, client portals,
        lender data rooms, task automation, and related workflow features. We are{" "}
        <strong>not a lender, broker, financial institution, law firm, or tax
        advisor</strong>. We do not originate loans, underwrite transactions,
        provide credit decisions, or offer legal, tax, or investment advice. Any
        lending, brokerage, or funding activity conducted through the Service is
        performed solely by you and your authorized parties.
      </p>

      <h2>2. Eligibility &amp; Accounts</h2>
      <p>
        You must be at least 18 years old and authorized to bind your organization.
        You are responsible for maintaining the confidentiality of credentials,
        restricting access to authorized personnel, and all activity under your
        account. Notify us promptly of any unauthorized use.
      </p>

      <h2>3. User Responsibilities</h2>
      <p>When using the Service, you agree that you will:</p>
      <ul>
        <li>
          Upload, store, and share only data you are legally permitted to process,
          including sensitive financial, personal, and business information.
        </li>
        <li>
          Obtain all required consents from clients, borrowers, guarantors, lenders,
          and other data subjects before collecting or sharing their information.
        </li>
        <li>
          Comply with applicable laws, including privacy, lending, communications
          (including TCPA and CAN-SPAM), and records-retention requirements.
        </li>
        <li>
          Configure access controls appropriately so documents are shared only with
          intended recipients.
        </li>
        <li>
          Not use the Service for unlawful, fraudulent, harassing, or abusive
          purposes, or to transmit malware or attempt unauthorized access.
        </li>
      </ul>
      <p>
        You retain ownership of content you submit. You grant us a limited license
        to host, process, transmit, and display content solely to operate and improve
        the Service.
      </p>

      <h2>4. Client &amp; Third-Party Access</h2>
      <p>
        The Service may generate links, portals, and delivery rooms for clients,
        lenders, and partners. You control who receives access. We are not
        responsible for misuse arising from credentials or links you distribute, or
        from recipients you authorize.
      </p>

      <h2>5. Fees &amp; Subscription</h2>
      <p>
        Paid plans, if applicable, are billed according to your order form or
        subscription agreement. Fees are non-refundable except where required by law
        or expressly stated in writing. We may modify pricing on renewal with
        reasonable notice.
      </p>

      <h2>6. Service Availability — &quot;As Is&quot;</h2>
      <p>
        THE SERVICE IS PROVIDED ON AN <strong>&quot;AS IS&quot;</strong> AND{" "}
        <strong>&quot;AS AVAILABLE&quot;</strong> BASIS WITHOUT WARRANTIES OF ANY
        KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES
        OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND
        NON-INFRINGEMENT. We do not warrant uninterrupted, error-free, or secure
        operation, or that defects will be corrected.
      </p>

      <h2>7. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE AND OUR AFFILIATES, OFFICERS,
        DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT,
        INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR
        ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR BUSINESS OPPORTUNITY,
        ARISING FROM OR RELATED TO THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY.
        OUR AGGREGATE LIABILITY FOR ANY CLAIM SHALL NOT EXCEED THE GREATER OF (A)
        AMOUNTS PAID BY YOU TO US FOR THE SERVICE IN THE TWELVE (12) MONTHS BEFORE
        THE CLAIM OR (B) ONE HUNDRED U.S. DOLLARS ($100).
      </p>

      <h2>8. Indemnification</h2>
      <p>
        You will defend, indemnify, and hold harmless {MARKETING_BRAND_NAME} from
        claims, damages, losses, and expenses (including reasonable attorneys&apos;
        fees) arising from your content, your use of the Service, violation of
        these Terms, or violation of applicable law.
      </p>

      <h2>9. Suspension &amp; Termination</h2>
      <p>
        We may suspend or terminate access for violation of these Terms, security
        risk, non-payment, or legal requirement. Upon termination, your right to
        use the Service ceases. Provisions that by nature should survive will
        survive, including limitations of liability and indemnification.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update these Terms from time to time. Material changes will be
        posted on this page with an updated date. Continued use after changes
        constitutes acceptance.
      </p>

      <h2>11. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the United States and the State of
        Delaware, without regard to conflict-of-law principles, except where
        mandatory consumer protections apply.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions regarding these Terms may be directed to your account
        representative or through the support channels provided in your workspace.
      </p>
    </LegalDocumentShell>
  );
}
