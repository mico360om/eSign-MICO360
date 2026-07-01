// ─────────────────────────────────────────────────────────────────────────────
// eSign MICO360 — Legal / Help content
//
// EDIT THIS FILE to update the Terms & Conditions, Privacy Policy and About Us
// text. Content is plain data so a developer/admin can change wording, dates,
// contact details and app metadata without touching any UI code.
//
// Each section is rendered as a heading (`h`) followed by one or more paragraphs
// (`p`). Bullet lists are written as paragraphs beginning with "• ".
// After editing, rebuild the web app (and the desktop installer) to publish.
// ─────────────────────────────────────────────────────────────────────────────

export interface LegalSection {
  h?: string;        // optional section heading
  p: string[];       // paragraphs (a line starting with "• " renders as a bullet)
}

export interface LegalDoc {
  key: "terms" | "privacy" | "about";
  title: string;
  lastUpdated: string;   // human-readable date — update when you change the text
  intro?: string;
  sections: LegalSection[];
}

// App / company metadata — single source of truth for the About page footer too.
export const APP_INFO = {
  appName: "eSign MICO360",
  appVersion: "1.0.1",
  companyName: "MICO360 Softwares",
  contactEmail: "mico360om@gmail.com",
  website: "https://github.com/mico360om/eSign-MICO360",
  supportEmail: "mico360om@gmail.com",
};

export const TERMS: LegalDoc = {
  key: "terms",
  title: "Terms & Conditions",
  lastUpdated: "1 July 2026",
  intro:
    "These Terms & Conditions govern your use of the eSign MICO360 application. " +
    "By installing, accessing or using the software you agree to be bound by these terms. " +
    "Please replace this placeholder text with your organisation's finalised legal terms.",
  sections: [
    {
      h: "1. App Usage Rules",
      p: [
        "eSign MICO360 is provided for authorised internal document approval, electronic signing and stamping. You agree to use the application only for lawful business purposes and in accordance with your organisation's policies.",
        "• Do not attempt to bypass access controls, permissions or audit logging.",
        "• Do not share your login credentials with any other person.",
        "• Each user is responsible for all activity performed under their account.",
      ],
    },
    {
      h: "2. User Responsibility",
      p: [
        "You are responsible for maintaining the confidentiality of your account and password and for restricting access to your device. You agree to accept responsibility for all activities that occur under your account.",
      ],
    },
    {
      h: "3. Document Accuracy Responsibility",
      p: [
        "The application facilitates the approval and signing of documents but does not verify the accuracy, completeness or legality of the document content. The uploader and approvers are solely responsible for ensuring that documents are correct, complete and appropriate before approval, signing or stamping.",
      ],
    },
    {
      h: "4. Limitation of Liability",
      p: [
        "To the maximum extent permitted by applicable law, MICO360 Softwares shall not be liable for any indirect, incidental, special or consequential damages, or any loss of data, profit or business, arising out of or in connection with the use of, or inability to use, the application.",
        "The software is provided on an “as is” and “as available” basis without warranties of any kind, whether express or implied.",
      ],
    },
    {
      h: "5. Software Updates",
      p: [
        "The application may automatically check for and download updates to provide new features, security patches and bug fixes. Updates may be optional or mandatory. You agree that the software may be updated and that some updates may be required to continue using the application.",
      ],
    },
    {
      h: "6. Support Terms",
      p: [
        "Support is provided on a best-effort basis through the contact channels listed on the About Us page. Response times and the scope of support are subject to your organisation's agreement with MICO360 Softwares.",
      ],
    },
    {
      h: "7. Acceptance of Terms",
      p: [
        "By continuing to use eSign MICO360 you acknowledge that you have read, understood and agreed to these Terms & Conditions. If you do not agree, you must stop using the application.",
      ],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  key: "privacy",
  title: "Privacy Policy",
  lastUpdated: "1 July 2026",
  intro:
    "This Privacy Policy describes how eSign MICO360 collects, uses, stores and protects information. " +
    "Please replace this placeholder text with your organisation's finalised privacy policy.",
  sections: [
    {
      h: "1. What Data We Collect",
      p: [
        "• Account information: name, email address, phone, department, designation and role.",
        "• Authentication data: securely hashed passwords and session tokens.",
        "• Documents and files you upload, together with their metadata (title, profile, priority, due date, notes).",
        "• Signatures, stamps and approval marks you apply to documents.",
        "• Activity and audit data: actions performed, date and time, and where available the device or network address.",
      ],
    },
    {
      h: "2. How the Data Is Used",
      p: [
        "Data is used solely to operate the application: to authenticate users, route documents through approval workflows, apply signatures and stamps, generate reports, send notifications and maintain a tamper-evident audit trail. We do not sell your data or use it for advertising.",
      ],
    },
    {
      h: "3. How Documents and Files Are Stored",
      p: [
        "In the desktop edition, your database and uploaded files are stored locally on your own device within the application's data folder. They are not transmitted to any external server by the application. In server-hosted deployments, data is stored on the server infrastructure operated by your organisation.",
      ],
    },
    {
      h: "4. Data Security",
      p: [
        "Passwords are stored using one-way cryptographic hashing. Access to documents and features is controlled by a role and permission system. The audit log uses a hash chain so that tampering can be detected. You are responsible for securing the device or server on which the application runs, including operating-system level access controls and backups.",
      ],
    },
    {
      h: "5. Your Rights",
      p: [
        "Subject to your organisation's policies and applicable law, you may request access to, correction of, or deletion of your personal data. Administrators can manage user accounts, reset passwords and deactivate users. Contact your administrator or the address below to exercise these rights.",
      ],
    },
    {
      h: "6. Contact Information",
      p: [
        "For any privacy questions or requests, contact us at mico360om@gmail.com.",
      ],
    },
  ],
};

export const ABOUT: LegalDoc = {
  key: "about",
  title: "About Us",
  lastUpdated: "1 July 2026",
  intro:
    "eSign MICO360 is a secure electronic document approval, signing and stamping platform " +
    "designed for organisations that need controlled, auditable document workflows.",
  sections: [
    {
      h: "Our Application",
      p: [
        "eSign MICO360 streamlines the full lifecycle of document approval — upload, profile-based routing, sequential or parallel approvals, electronic signatures, company stamps, completion and a tamper-evident audit trail — all in one application available on Windows desktop and the web.",
      ],
    },
    {
      h: "Our Company",
      p: [
        "MICO360 Softwares builds practical business software focused on security, reliability and a clean user experience. We help teams replace slow, paper-based approval processes with fast, accountable digital workflows.",
      ],
    },
    {
      h: "Contact",
      p: [
        "• Email: mico360om@gmail.com",
        "• Website: https://github.com/mico360om/eSign-MICO360",
      ],
    },
  ],
};

export const LEGAL_DOCS: Record<LegalDoc["key"], LegalDoc> = {
  terms: TERMS,
  privacy: PRIVACY,
  about: ABOUT,
};
