const supportEmail = 'support@artgen.site'
const siteUrl = 'https://artgen.site'
const lastUpdated = '2026-04-12'

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-black text-[#211915]">{title}</h2>
      <div className="mt-3 space-y-3 leading-7 text-[#66574d]">{children}</div>
    </section>
  )
}

function PrivacyContent() {
  return (
    <>
      <p className="leading-7 text-[#66574d]">
        MemoryFix AI (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates{' '}
        <a href={siteUrl} className="font-bold text-[#211915] underline">
          {siteUrl}
        </a>
        . This Privacy Policy explains how we collect, use, and protect your
        information.
      </p>

      <Section title="1. Local-First Processing">
        <p>
          Our free photo repair tool runs entirely in your browser. Photos you
          load into the local editor are <strong>never uploaded</strong> to our
          servers. AI model files are downloaded from public CDN hosts and
          cached locally on your device.
        </p>
      </Section>

      <Section title="2. Human-Assisted Restore (Paid Service)">
        <p>
          When you purchase the Human-Assisted Restore service, we collect and
          store the following:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>The photo you explicitly upload for restoration</li>
          <li>Your checkout email address and name (from Paddle)</li>
          <li>Your repair notes and preferences</li>
          <li>Order and payment reference information</li>
        </ul>
        <p>
          Uploaded photos are stored in a private, access-controlled cloud
          bucket. We retain your photo and order data for up to 90 days after
          delivery to handle support requests, then delete them.
        </p>
      </Section>

      <Section title="3. Payment Processing">
        <p>
          Payments are processed by{' '}
          <a
            href="https://www.paddle.com"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-[#211915] underline"
          >
            Paddle
          </a>{' '}
          (Merchant of Record). We do not store credit card numbers or banking
          details. Paddle handles tax collection, receipts, and payment
          security. Please review{' '}
          <a
            href="https://www.paddle.com/legal/privacy"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-[#211915] underline"
          >
            Paddle&apos;s Privacy Policy
          </a>{' '}
          for details on their data handling.
        </p>
      </Section>

      <Section title="4. Analytics">
        <p>
          We use Vercel Analytics to collect anonymous, aggregated usage data
          (page views, performance metrics). No personally identifiable
          information is collected by our analytics.
        </p>
      </Section>

      <Section title="5. Cookies &amp; Local Storage">
        <p>
          We use browser local storage to remember checkout context and
          preferences. We do not use third-party tracking cookies.
        </p>
      </Section>

      <Section title="6. Data Sharing">
        <p>We do not sell your personal data. We share data only with:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Paddle</strong> &mdash; for payment processing
          </li>
          <li>
            <strong>Resend</strong> &mdash; for transactional email delivery
          </li>
          <li>
            <strong>Supabase</strong> &mdash; for secure file storage and
            database
          </li>
          <li>
            <strong>AI restoration providers</strong> &mdash; your uploaded
            photo is sent to a cloud AI model for restoration processing
          </li>
        </ul>
      </Section>

      <Section title="7. Your Rights">
        <p>
          You may request deletion of your data at any time by emailing{' '}
          <a
            href={`mailto:${supportEmail}`}
            className="font-bold text-[#211915] underline"
          >
            {supportEmail}
          </a>
          . We will delete your photos, order data, and associated records
          within 30 days of your request.
        </p>
      </Section>

      <Section title="8. Changes">
        <p>
          We may update this policy from time to time. The &quot;Last
          updated&quot; date at the top reflects the most recent revision.
        </p>
      </Section>
    </>
  )
}

function TermsContent() {
  return (
    <>
      <p className="leading-7 text-[#66574d]">
        By using MemoryFix AI at{' '}
        <a href={siteUrl} className="font-bold text-[#211915] underline">
          {siteUrl}
        </a>
        , you agree to these Terms of Service.
      </p>

      <Section title="1. Service Description">
        <p>MemoryFix AI provides two services:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Free local photo repair</strong> &mdash; a browser-based
            tool that processes photos on your device without uploading
          </li>
          <li>
            <strong>Human-Assisted Restore</strong> &mdash; a paid service
            ($19/photo) where your photo is uploaded, processed by AI, reviewed
            by a human, and delivered by email
          </li>
        </ul>
      </Section>

      <Section title="2. Acceptable Use">
        <p>You agree to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Upload only photos you own or have the right to edit</li>
          <li>Not upload illegal, harmful, or abusive content</li>
          <li>
            Not attempt to abuse, reverse-engineer, or overload the service
          </li>
        </ul>
        <p>
          We reserve the right to refuse service and refund payment if submitted
          content violates these terms.
        </p>
      </Section>

      <Section title="3. Results &amp; Limitations">
        <p>
          Photo restoration results vary depending on the quality and condition
          of the source photo. We do not guarantee specific outcomes. The
          Human-Assisted Restore service includes a human quality review before
          delivery, but results are inherently limited by the source material.
        </p>
      </Section>

      <Section title="4. Intellectual Property">
        <p>
          You retain full ownership of your photos. We do not claim any rights
          to photos you upload or restored results we deliver. The MemoryFix AI
          browser-side core is based on the open-source{' '}
          <a
            href="https://github.com/lxfater/inpaint-web"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-[#211915] underline"
          >
            inpaint-web
          </a>{' '}
          project under GPL-3.0.
        </p>
      </Section>

      <Section title="5. Availability">
        <p>
          We aim to keep the service available but do not guarantee 100% uptime.
          During beta, delivery times for Human-Assisted Restore are typically
          within 48 hours but may vary.
        </p>
      </Section>

      <Section title="6. Liability">
        <p>
          The service is provided &quot;as is&quot; without warranties of any
          kind. To the maximum extent permitted by law, MemoryFix AI shall not
          be liable for indirect, incidental, or consequential damages arising
          from the use of this service. Our total liability is limited to the
          amount you paid for the specific order in question.
        </p>
      </Section>

      <Section title="7. Changes">
        <p>
          We may update these terms. Continued use after changes constitutes
          acceptance. Material changes will be noted by updating the date above.
        </p>
      </Section>
    </>
  )
}

function RefundContent() {
  return (
    <>
      <p className="leading-7 text-[#66574d]">
        We want you to be satisfied with the Human-Assisted Restore service. If
        you are not, we offer the following refund policy.
      </p>

      <Section title="1. Eligibility">
        <p>You may request a full refund if:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            We are unable to produce a restoration result (e.g., the source
            photo is too damaged for any meaningful improvement)
          </li>
          <li>
            Delivery takes longer than 7 business days without prior
            communication
          </li>
          <li>You contact us before we begin processing your order</li>
        </ul>
      </Section>

      <Section title="2. Partial Refunds">
        <p>
          If you are unsatisfied with the restoration quality, we will first
          offer one free revision attempt. If the revision still does not meet
          reasonable expectations, we may issue a partial or full refund at our
          discretion.
        </p>
      </Section>

      <Section title="3. Non-Refundable Cases">
        <p>Refunds are generally not available if:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            The restoration was delivered and downloaded, and no quality
            complaint was raised within 14 days
          </li>
          <li>The submitted photo violates our Terms of Service</li>
        </ul>
      </Section>

      <Section title="4. How to Request a Refund">
        <p>
          Email{' '}
          <a
            href={`mailto:${supportEmail}`}
            className="font-bold text-[#211915] underline"
          >
            {supportEmail}
          </a>{' '}
          with your order reference or submission reference. We aim to respond
          within 2 business days. Approved refunds are processed through Paddle
          and typically appear within 5&ndash;10 business days.
        </p>
      </Section>
    </>
  )
}

const pages: Record<
  string,
  { title: string; subtitle: string; Content: () => JSX.Element }
> = {
  '/privacy': {
    title: 'Privacy Policy',
    subtitle: 'How we handle your data',
    Content: PrivacyContent,
  },
  '/terms': {
    title: 'Terms of Service',
    subtitle: 'Rules for using MemoryFix AI',
    Content: TermsContent,
  },
  '/refund': {
    title: 'Refund Policy',
    subtitle: 'Our commitment to your satisfaction',
    Content: RefundContent,
  },
}

export function isLegalPage(path: string): boolean {
  return path in pages
}

export default function LegalPage({ path }: { path: string }) {
  const page = pages[path]

  if (!page) {
    return null
  }

  const { title, subtitle, Content } = page

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-8 md:py-16">
      <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
        {subtitle}
      </p>
      <h1 className="mt-3 text-4xl font-black tracking-tight text-[#211915]">
        {title}
      </h1>
      <p className="mt-3 text-sm text-[#9b8b7c]">Last updated: {lastUpdated}</p>

      <Content />

      <div className="mt-12 rounded-2xl border border-[#e6d2b7] bg-[#fffaf3] p-6 text-sm leading-6 text-[#66574d]">
        <p className="font-black text-[#211915]">Questions?</p>
        <p className="mt-1">
          Contact us at{' '}
          <a
            href={`mailto:${supportEmail}`}
            className="font-bold text-[#211915] underline"
          >
            {supportEmail}
          </a>
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-4 text-sm font-bold text-[#211915]">
        {Object.entries(pages)
          .filter(([p]) => p !== path)
          .map(([p, { title: t }]) => (
            <a key={p} href={p} className="underline underline-offset-4">
              {t}
            </a>
          ))}
        <a href="/" className="underline underline-offset-4">
          Back to MemoryFix AI
        </a>
      </div>
    </div>
  )
}
