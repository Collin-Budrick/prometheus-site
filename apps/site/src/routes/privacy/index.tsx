import { $, component$ } from '@builder.io/qwik'
import type { DocumentHead, RequestHandler } from '@builder.io/qwik-city'
import { templateBranding } from '@prometheus/template-config'
import { StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand } from '../../site-config'
import { buildGlobalStylesheetLinks } from '../../shell/core/global-style-assets'
import { StaticPageRoot } from '../../shell/core/StaticPageRoot'
import { createCacheHandler, PUBLIC_SWR_CACHE } from '../route-utils'
import privacyModuleStyles from './privacy.module.css'

const privacyClass = {
  body: privacyModuleStyles['privacy-body'],
  notice: privacyModuleStyles['privacy-notice'],
  noticeLabel: privacyModuleStyles['privacy-notice-label'],
  highlights: privacyModuleStyles['privacy-highlights'],
  highlightCard: privacyModuleStyles['privacy-highlight-card'],
  section: privacyModuleStyles['privacy-section'],
  list: privacyModuleStyles['privacy-list'],
  contactCard: privacyModuleStyles['privacy-contact-card'],
  contactLink: privacyModuleStyles['privacy-contact-link']
} as const

const contactEmail = templateBranding.notifications.contactEmail
const policyDescription = `This Privacy Policy explains how ${siteBrand.name} collects, uses, protects, and discloses information when you use our website, authentication flows, and related services.`

export const onGet: RequestHandler = createCacheHandler(PUBLIC_SWR_CACHE)

export const head: DocumentHead = {
  title: `Privacy Policy | ${siteBrand.name}`,
  meta: [
    {
      name: 'description',
      content: policyDescription
    }
  ],
  links: buildGlobalStylesheetLinks()
}

export default component$(() => {
  const contactPrivacyTeam = $(() => {
    if (typeof window === 'undefined') return
    window.location.href = `mailto:${contactEmail}?subject=${encodeURIComponent(`${siteBrand.name} privacy request`)}`
  })

  return (
    <StaticPageRoot>
      <StaticRouteTemplate
        metaLine="Trust and transparency"
        title="Privacy Policy"
        description={policyDescription}
        actionLabel="Contact privacy team"
        closeLabel="Close"
        onAction$={contactPrivacyTeam}
        size="big"
      >
        <div class={privacyClass.body}>
          <div class={privacyClass.notice}>
            <span class={privacyClass.noticeLabel}>Last updated</span>
            <strong>March 30, 2026</strong>
            <p>
              This policy applies to the site and related services available through
              <code> prometheus.dev </code>
              and
              <code> prometheus.prod </code>
              . It is designed to explain what information we handle, why we handle it, and the choices
              available to you.
            </p>
          </div>

          <div class={privacyClass.highlights}>
            <article class={privacyClass.highlightCard}>
              <h2>What we collect</h2>
              <p>
                We may collect account information, authentication details, technical diagnostics, and
                information you choose to submit while using the site.
              </p>
            </article>
            <article class={privacyClass.highlightCard}>
              <h2>Why we use it</h2>
              <p>
                We use information to operate the service, secure accounts, diagnose issues, improve the
                experience, and communicate important updates.
              </p>
            </article>
            <article class={privacyClass.highlightCard}>
              <h2>How we handle it</h2>
              <p>
                We limit access to information to authorized systems, protect it with reasonable security
                measures, and disclose it only when necessary to run the service or comply with law.
              </p>
            </article>
          </div>

          <section class={privacyClass.section}>
            <h2>Information we collect</h2>
            <ul class={privacyClass.list}>
              <li>
                Account and profile details such as your name, email address, user identifier, and basic
                profile metadata associated with an account you create or connect.
              </li>
              <li>
                Authentication details when you sign in using email, passkeys, or a supported identity
                provider such as Google, Facebook, X, or GitHub.
              </li>
              <li>
                Device, browser, and usage information such as IP address, approximate location inferred
                from network data, browser type, operating system, timestamps, pages viewed, and diagnostic
                events.
              </li>
              <li>
                Content, files, messages, or other materials you voluntarily submit through the site or
                related product workflows.
              </li>
            </ul>
          </section>

          <section class={privacyClass.section}>
            <h2>How we use information</h2>
            <ul class={privacyClass.list}>
              <li>Provide, maintain, and improve the site and its core product functionality.</li>
              <li>Authenticate users, prevent fraud, monitor abuse, and protect the security of accounts.</li>
              <li>Personalize the experience, preserve session state, and remember user preferences.</li>
              <li>Respond to support requests, service notices, legal requests, and account-related communications.</li>
              <li>Analyze performance, reliability, and feature adoption so we can improve the product responsibly.</li>
            </ul>
          </section>

          <section class={privacyClass.section}>
            <h2>Third-party authentication</h2>
            <p>
              If you choose to sign in through a third-party provider, we may receive limited account data
              from that provider, such as your name, email address, profile image, and provider-specific
              identifier. The information shared with us depends on the provider and the permissions you
              approve during sign-in.
            </p>
          </section>

          <section class={privacyClass.section}>
            <h2>Sharing and disclosure</h2>
            <p>
              We may disclose information to trusted infrastructure providers, analytics vendors,
              authentication partners, and professional advisers who help us operate the service. We may
              also disclose information when required by law, to enforce our terms, to protect users and the
              service, or as part of a merger, acquisition, financing, or asset transfer.
            </p>
          </section>

          <section class={privacyClass.section}>
            <h2>Retention and security</h2>
            <p>
              We retain information for as long as needed to operate the service, meet legal obligations,
              resolve disputes, and enforce agreements. We use administrative, technical, and organizational
              safeguards intended to protect information against unauthorized access, loss, misuse, or
              alteration. No method of transmission or storage is completely secure, so we cannot guarantee
              absolute security.
            </p>
          </section>

          <section class={privacyClass.section}>
            <h2>Your choices</h2>
            <ul class={privacyClass.list}>
              <li>You may review, update, or remove profile details that are editable through the site.</li>
              <li>You may stop using the service at any time and request account assistance from our team.</li>
              <li>
                You may disable cookies or local storage through browser controls, although some features may
                not function correctly as a result.
              </li>
              <li>
                Where applicable, you may contact us to request access, correction, deletion, or clarification
                regarding your personal information.
              </li>
            </ul>
          </section>

          <section class={privacyClass.section}>
            <h2>Children&apos;s privacy</h2>
            <p>
              The site is not directed to children under 13, and we do not knowingly collect personal
              information from children under 13. If you believe a child has provided personal information to
              us, contact us and we will investigate and take appropriate action.
            </p>
          </section>

          <section class={privacyClass.section}>
            <h2>Policy updates</h2>
            <p>
              We may update this Privacy Policy from time to time to reflect changes to the service, legal
              requirements, or our data practices. When we make material changes, we will update the date at
              the top of this page and post the revised policy here.
            </p>
          </section>

          <section class={[privacyClass.section, privacyClass.contactCard].join(' ')}>
            <h2>Contact</h2>
            <p>
              If you have questions about this Privacy Policy or want to submit a privacy-related request,
              contact us at
              {' '}
              <a class={privacyClass.contactLink} href={`mailto:${contactEmail}`}>
                {contactEmail}
              </a>
              .
            </p>
          </section>
        </div>
      </StaticRouteTemplate>
    </StaticPageRoot>
  )
})
