'use client';

// Public-facing legal page. Content is fixed copy (no data fetching) rendered
// from the SECTIONS array so the table of contents and the body can never drift
// apart. Linked from the app footer.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NextPage } from 'next';
import { Scale } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { clsxm } from '@/lib/utils';

const EFFECTIVE_DATE = 'July 30, 2026';

// ── Small content primitives ──────────────────────────────────────────────────
const P = ({ children }: { children: ReactNode }) => (
  <p className="mb-3 text-sm leading-relaxed text-gray-700 sm:text-[15px]">{children}</p>
);

// Legal boilerplate that is conventionally set in caps (disclaimers, liability
// caps, jury-trial waiver).
const Caps = ({ children }: { children: ReactNode }) => (
  <p className="mb-3 text-xs uppercase leading-relaxed tracking-wide text-gray-700 sm:text-[13px]">
    {children}
  </p>
);

const UL = ({ children }: { children: ReactNode }) => (
  <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm leading-relaxed text-gray-700 marker:text-appPrimary sm:text-[15px]">
    {children}
  </ul>
);

const Callout = ({ children }: { children: ReactNode }) => (
  <div className="my-4 rounded-lg border border-altPrimary bg-altMutedBackground px-4 py-3 text-sm leading-relaxed text-gray-800">
    {children}
  </div>
);

type Section = { id: string; title: string; body: ReactNode };

const SECTIONS: Section[] = [
  {
    id: 'acceptance',
    title: 'Acceptance of Terms',
    body: (
      <>
        <P>
          These Terms of Service (&ldquo;Terms&rdquo;) are a binding agreement between you and
          Gignology (&ldquo;Gignology,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
          &ldquo;our&rdquo;) governing your access to and use of the Gignology Employee mobile
          application, related web applications, and associated services (collectively, the
          &ldquo;App&rdquo;).
        </P>
        <P>
          By creating an account, logging in, or otherwise using the App, you agree to these Terms.
          If you do not agree, do not use the App.
        </P>
      </>
    ),
  },
  {
    id: 'eligibility',
    title: 'Eligibility',
    body: (
      <>
        <P>To use the App, you must:</P>
        <UL>
          <li>Be at least 18 years of age (or the age of majority in your jurisdiction);</li>
          <li>
            Be an employee, worker, or authorized staffing pool member of a staffing organization or
            venue operator that uses the Gignology platform (your &ldquo;Employer&rdquo;); and
          </li>
          <li>Have been issued or invited to create App credentials by your Employer.</li>
        </UL>
        <P>
          Access to the App is provisioned through your Employer. If your relationship with your
          Employer ends, your access to the App may end as well.
        </P>
      </>
    ),
  },
  {
    id: 'relationship',
    title: 'Employment Relationship',
    body: (
      <>
        <Callout>
          <strong className="font-semibold text-gray-900">Important:</strong> Gignology is a
          software provider. Gignology is not your employer, does not offer or assign work, and does
          not determine your pay, schedule, or terms of employment.
        </Callout>
        <P>
          The App is a tool your Employer uses to manage scheduling, timekeeping, communications,
          and related workforce activities. Nothing in these Terms, and nothing in your use of the
          App, creates an employment, agency, joint-employer, or contractor relationship between you
          and Gignology.
        </P>
        <P>
          All questions regarding wages, hours, shift assignments, workplace policies, benefits, and
          employment disputes should be directed to your Employer. Records displayed in the App
          (such as timesheets or pay-period information) are maintained on behalf of your Employer,
          and your Employer&rsquo;s official records govern in the event of a discrepancy.
        </P>
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Accounts & Security',
    body: (
      <>
        <P>
          You are responsible for maintaining the confidentiality of your login credentials and for
          all activity that occurs under your account. You agree to:
        </P>
        <UL>
          <li>
            Provide accurate and current information when registering and keep it up to date;
          </li>
          <li>Not share your credentials with any other person;</li>
          <li>Not access the App using another person&rsquo;s account; and</li>
          <li>
            Notify your Employer or Gignology promptly if you suspect unauthorized access to your
            account.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: 'license',
    title: 'License to Use the App',
    body: (
      <>
        <P>
          Subject to these Terms, Gignology grants you a limited, non-exclusive, non-transferable,
          revocable license to install and use the App on devices you own or control, solely for
          legitimate workforce purposes connected to your Employer. You may not:
        </P>
        <UL>
          <li>Copy, modify, distribute, sell, or lease any part of the App;</li>
          <li>Reverse engineer, decompile, or attempt to extract source code from the App;</li>
          <li>Use the App to build a competing product or service; or</li>
          <li>Use automated tools (bots, scrapers, scripts) to access the App.</li>
        </UL>
      </>
    ),
  },
  {
    id: 'timekeeping',
    title: 'Timekeeping & Clock-In',
    body: (
      <>
        <P>
          The App provides timekeeping features, which may include QR code clock-in, manual punches,
          and timesheet review. You agree to:
        </P>
        <UL>
          <li>Clock in and out only for yourself, and only for time actually worked;</li>
          <li>
            Never scan a QR code, record a punch, or submit time on behalf of another person, or
            permit anyone to do so for you (&ldquo;buddy punching&rdquo;);
          </li>
          <li>
            Review your recorded time and promptly report any errors or missing punches to your
            Employer.
          </li>
        </UL>
        <P>
          Falsifying time records is a violation of these Terms and may also violate your
          Employer&rsquo;s policies and applicable law.
        </P>
      </>
    ),
  },
  {
    id: 'location',
    title: 'Location Data',
    body: (
      <>
        <P>
          Certain features &mdash; such as QR code clock-in verification and venue check-in &mdash;
          may use your device&rsquo;s location to confirm you are at or near the assigned worksite
          at the time of a punch. Location capture occurs in connection with specific actions (for
          example, when you clock in or out); the App does not continuously track your location in
          the background.
        </P>
        <P>
          You may control location permissions through your device settings. However, disabling
          location access may prevent certain features, including clock-in, from functioning, and
          your Employer may require location-verified punches as a condition of using App-based
          timekeeping.
        </P>
      </>
    ),
  },
  {
    id: 'shifts',
    title: 'Shifts, Swaps & Pickups',
    body: (
      <>
        <P>
          The App may allow you to view scheduled shifts, request shift swaps or giveaways with
          other eligible workers, and pick up open shifts. You acknowledge that:
        </P>
        <UL>
          <li>
            All swap, giveaway, and pickup requests are subject to your Employer&rsquo;s rules and
            may require supervisor approval;
          </li>
          <li>Submitting a request does not guarantee it will be granted;</li>
          <li>
            Until a swap or giveaway is approved, you remain responsible for your originally
            assigned shift; and
          </li>
          <li>
            Shift availability, staffing decisions, and schedule changes are made solely by your
            Employer, not by Gignology.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: 'ratings',
    title: 'Performance Ratings',
    body: (
      <P>
        Your Employer may use the App to record performance ratings or scores related to your work
        at particular events or venues. These ratings are created and maintained by your Employer
        and may be used by your Employer in staffing decisions. Gignology provides the rating
        functionality but does not create, review, or make decisions based on individual ratings.
        Questions or disputes about a rating should be directed to your Employer.
      </P>
    ),
  },
  {
    id: 'expenses',
    title: 'Expense Submissions',
    body: (
      <P>
        If your Employer enables expense features, you may submit expense reports and supporting
        documentation (such as receipts) through the App. You agree that all expense submissions
        will be truthful, accurate, and supported by legitimate documentation. Reimbursement
        decisions are made solely by your Employer under its policies.
      </P>
    ),
  },
  {
    id: 'sms',
    title: 'Text Message (SMS) Consent',
    body: (
      <>
        <P>
          By providing your mobile number and using the App, you consent to receive text messages
          related to your work, including shift notifications, schedule changes, clock-in reminders,
          and operational alerts, sent by or on behalf of your Employer through the Gignology
          platform.
        </P>
        <Callout>
          <strong className="font-semibold text-gray-900">Message details:</strong> Message
          frequency varies based on your schedule and Employer activity. Message and data rates may
          apply. Reply <strong className="font-semibold">STOP</strong> to opt out of texts or{' '}
          <strong className="font-semibold">HELP</strong> for assistance. Opting out of text
          messages may affect your receipt of time-sensitive work notifications; alternative
          notification channels may be available through your Employer.
        </Callout>
        <P>
          Consent to receive text messages is not a condition of any purchase. Standard carrier
          charges are your responsibility.
        </P>
      </>
    ),
  },
  {
    id: 'conduct',
    title: 'Acceptable Use',
    body: (
      <>
        <P>You agree not to use the App to:</P>
        <UL>
          <li>Violate any applicable law, regulation, or your Employer&rsquo;s policies;</li>
          <li>
            Submit false, misleading, or fraudulent information, including time records or expenses;
          </li>
          <li>
            Harass, threaten, or abuse any other person, including through in-app messaging;
          </li>
          <li>
            Upload content that is unlawful, infringing, or malicious (including viruses or harmful
            code);
          </li>
          <li>Interfere with or disrupt the operation or security of the App; or</li>
          <li>Access data belonging to other users, Employers, or tenants of the platform.</li>
        </UL>
      </>
    ),
  },
  {
    id: 'privacy',
    title: 'Privacy',
    body: (
      <P>
        Our collection and use of personal information in connection with the App is described in
        the Gignology Privacy Policy. Because the App is provided to you through your Employer, your
        Employer also determines certain uses of your workforce data (such as time records,
        schedules, ratings, and expenses) and acts as the controller of that data. Please review
        your Employer&rsquo;s applicable privacy notices as well.
      </P>
    ),
  },
  {
    id: 'ip',
    title: 'Intellectual Property',
    body: (
      <>
        <P>
          The App, including its software, design, text, graphics, logos, and all related
          intellectual property, is owned by Gignology or its licensors and is protected by
          intellectual property laws. Except for the limited license granted in Section 5, no rights
          in the App are transferred to you. The Gignology name and logo may not be used without our
          prior written permission.
        </P>
        <P>
          If you submit feedback or suggestions about the App, you grant Gignology a perpetual,
          irrevocable, royalty-free license to use them without restriction or compensation.
        </P>
      </>
    ),
  },
  {
    id: 'availability',
    title: 'App Availability & Changes',
    body: (
      <P>
        We may modify, update, suspend, or discontinue the App or any feature at any time, with or
        without notice. We do not guarantee that the App will be available at all times or free of
        interruptions, delays, or errors. Scheduled maintenance, connectivity issues, or events
        beyond our control may affect availability. If the App is unavailable, follow your
        Employer&rsquo;s backup procedures for clocking in, reporting time, or receiving schedule
        information.
      </P>
    ),
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers',
    body: (
      <>
        <Caps>
          The App is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties
          of any kind, whether express, implied, or statutory, including implied warranties of
          merchantability, fitness for a particular purpose, title, and non-infringement. Gignology
          does not warrant that the App will be uninterrupted, error-free, or secure, or that any
          data displayed in the App will be accurate or complete.
        </Caps>
        <P>
          Some jurisdictions do not allow the exclusion of certain warranties, so some of the above
          exclusions may not apply to you.
        </P>
      </>
    ),
  },
  {
    id: 'liability',
    title: 'Limitation of Liability',
    body: (
      <>
        <Caps>
          To the maximum extent permitted by law, Gignology and its officers, directors, employees,
          and agents will not be liable for any indirect, incidental, special, consequential, or
          punitive damages, or for any lost wages, lost profits, lost data, or lost opportunities,
          arising out of or related to your use of or inability to use the App, even if advised of
          the possibility of such damages.
        </Caps>
        <Caps>
          To the maximum extent permitted by law, Gignology&rsquo;s total aggregate liability
          arising out of or relating to these Terms or the App will not exceed one hundred U.S.
          dollars ($100).
        </Caps>
        <P>
          Some jurisdictions do not allow the limitation of liability for certain damages, so some
          of the above limitations may not apply to you.
        </P>
      </>
    ),
  },
  {
    id: 'indemnification',
    title: 'Indemnification',
    body: (
      <P>
        You agree to indemnify and hold harmless Gignology and its affiliates from any claims,
        damages, liabilities, and expenses (including reasonable attorneys&rsquo; fees) arising out
        of your misuse of the App, your violation of these Terms, or your violation of any law or
        the rights of any third party.
      </P>
    ),
  },
  {
    id: 'termination',
    title: 'Suspension & Termination',
    body: (
      <>
        <P>
          We or your Employer may suspend or terminate your access to the App at any time, including
          if you violate these Terms, if your Employer&rsquo;s platform subscription ends, or if
          your relationship with your Employer ends. Upon termination, the license granted in
          Section 5 ends immediately. Sections that by their nature should survive termination
          (including Sections 14, 16, 17, 18, and 20) will survive.
        </P>
        <P>
          Termination of App access does not by itself affect your employment status; employment
          matters are governed by your relationship with your Employer.
        </P>
      </>
    ),
  },
  {
    id: 'disputes',
    title: 'Governing Law & Disputes',
    body: (
      <>
        <P>
          These Terms are governed by the laws of the State of Texas, without regard to its
          conflict-of-laws principles. Any dispute arising out of or relating to these Terms or the
          App that cannot be resolved informally shall be brought exclusively in the state or
          federal courts located in Travis County, Texas, and you consent to the personal
          jurisdiction of those courts.
        </P>
        <Caps>
          To the extent permitted by law, you and Gignology each waive any right to a jury trial and
          agree that any proceedings will be conducted on an individual basis and not as a class,
          collective, or representative action.
        </Caps>
        <P>
          Nothing in this section limits any non-waivable rights you may have under applicable
          employment or consumer protection law.
        </P>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to These Terms',
    body: (
      <P>
        We may update these Terms from time to time. When we do, we will revise the effective date
        above and may provide additional notice through the App. Your continued use of the App after
        changes take effect constitutes acceptance of the revised Terms. If you do not agree to the
        revised Terms, you must stop using the App.
      </P>
    ),
  },
  {
    id: 'contact',
    title: 'Contact Us',
    body: (
      <>
        <P>Questions about these Terms may be directed to:</P>
        <P>
          <strong className="font-semibold text-gray-900">Gignology</strong>
          <br />
          Austin, Texas, USA
          <br />
          Email:{' '}
          <a
            className="font-medium text-appPrimary hover:underline"
            href="mailto:support@getgignology.com"
          >
            support@getgignology.com
          </a>
        </P>
        <P>
          Questions about your employment, pay, schedule, or workplace policies should be directed
          to your Employer.
        </P>
      </>
    ),
  },
];

// Highlights the section currently in view in the desktop table of contents.
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? '');
  const visible = useRef(new Set<string>());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (entry.isIntersecting) visible.current.add(id);
          else visible.current.delete(id);
        }
        // Pick the first section (document order) that is currently on screen.
        const first = ids.find((id) => visible.current.has(id));
        if (first) setActive(first);
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 }
    );

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);

  return active;
}

const TermsPage: NextPage = () => {
  const ids = useRef(SECTIONS.map((s) => s.id)).current;
  const active = useActiveSection(ids);

  return (
    <Layout
      title="Terms of Service"
      description="The terms that govern your use of the Gignology Employee app."
    >
      <div className="mx-auto max-w-5xl pb-8">
        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-7">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-altPrimary bg-altMutedBackground px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-700">
            <Scale className="h-3.5 w-3.5 text-appPrimary" />
            Legal
          </span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Effective date: {EFFECTIVE_DATE}
            <span className="mx-2 hidden sm:inline">&middot;</span>
            <span className="mt-1 block sm:mt-0 sm:inline">
              Applies to the Gignology Employee mobile and web applications
            </span>
          </p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
          {/* ── Table of contents ────────────────────────────────────────── */}
          {/* Collapsed by default on mobile so the copy stays reachable. */}
          <details className="group rounded-xl border border-gray-200 bg-white lg:hidden">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-gray-900 marker:content-none">
              Contents
              <span className="float-right text-gray-400 transition-transform group-open:rotate-180">
                &#9662;
              </span>
            </summary>
            <nav aria-label="Table of contents" className="border-t border-gray-100 px-2 py-2">
              {SECTIONS.map((section, i) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="block rounded-md px-3 py-2 text-sm text-gray-600 active:bg-gray-50"
                >
                  <span className="mr-1.5 tabular-nums text-appPrimary">{i + 1}.</span>
                  {section.title}
                </a>
              ))}
            </nav>
          </details>

          {/* top-20 clears the 4rem sticky app header so the first entries never
              scroll up underneath it; the list scrolls internally past that. */}
          <nav
            aria-label="Table of contents"
            className="sticky top-20 hidden max-h-[calc(100vh-6rem)] self-start overflow-y-auto lg:block"
          >
            <h2 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Contents
            </h2>
            {SECTIONS.map((section, i) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={clsxm(
                  'block border-l-2 py-1.5 pl-3 pr-2 text-[13px] leading-snug transition-colors',
                  active === section.id
                    ? 'border-appPrimary bg-altMutedBackground font-medium text-gray-900'
                    : 'border-gray-200 text-gray-500 hover:border-appPrimary hover:text-gray-900'
                )}
              >
                <span className="mr-1.5 tabular-nums">{i + 1}.</span>
                {section.title}
              </a>
            ))}
          </nav>

          {/* ── Body ─────────────────────────────────────────────────────── */}
          <main className="min-w-0 rounded-xl border border-gray-200 bg-white p-5 sm:p-7">
            {SECTIONS.map((section, i) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-24 border-t border-gray-100 pt-6 first:border-t-0 first:pt-0 [&:not(:last-child)]:pb-6"
              >
                <h2 className="mb-3 text-lg font-semibold tracking-tight text-gray-900">
                  <span className="mr-2 tabular-nums text-appPrimary">{i + 1}.</span>
                  {section.title}
                </h2>
                {section.body}
              </section>
            ))}
          </main>
        </div>
      </div>
    </Layout>
  );
};

export default TermsPage;
