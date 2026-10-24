import { useEffect, useState } from 'react'
import './Policies.css'

const SUPPORT_EMAIL = 'uniabujamarket@gmail.com'

const policies = {
  '/acceptable-use': {
    title: 'Acceptable Use Policy',
    updated: '15 October 2026',
    sections: [
      {
        heading: '1. About UniAbuja Market',
        content: `UniAbuja Market is an online marketplace designed to connect buyers with independent vendors, particularly within the University of Abuja community.

The platform allows vendors to list products and customers to browse, purchase, and track orders.`,
      },
      {
        heading: '2. Vendor responsibilities',
        content: `Vendors are responsible for providing accurate registration and store information, honest product descriptions, accurate prices and stock availability, and lawful products.

Vendors must fulfil accepted orders, communicate honestly with customers, provide accurate payout information when required, and cooperate with applicable identity-verification and compliance checks.

UniAbuja Market may restrict or suspend vendor access where there is evidence of fraud, misleading listings, abuse, or violations of platform rules.`,
      },
      {
        heading: '3. Customer responsibilities',
        content: `Customers must provide accurate order and contact information, pay through the available checkout process, and use the marketplace lawfully.

Customers must not submit fraudulent orders, abuse refund procedures, or knowingly provide false delivery confirmations.`,
      },
      {
        heading: '4. Prohibited activities',
        content: `Users must not engage in fraud, impersonation, payment manipulation, or unauthorised access to another user's account.

Users must not list counterfeit, stolen, illegal, or prohibited products; exploit technical vulnerabilities; interfere with platform operations; or use the marketplace for unlawful financial activities.

Harassment, threats, and deceptive conduct are prohibited.`,
      },
      {
        heading: '5. Payments and commission',
        content: `Customer payments are processed through the payment methods supported by UniAbuja Market.

The standard vendor commission is 10% of the product sale amount, subject to applicable transaction terms. Vendor delivery fees are treated separately from the product-sale commission.

Applicable payment-processing and payout fees will be handled according to the relevant payment arrangements.`,
      },
      {
        heading: '6. Orders and delivery',
        content: `Vendors are responsible for fulfilling their orders. They may deliver products themselves or arrange delivery through an available delivery partner.

Customers do not select individual riders through the marketplace checkout process.

Where delivery verification is required, the customer should provide the designated delivery code only after receiving the order.`,
      },
      {
        heading: '7. Account restrictions',
        content: `UniAbuja Market may investigate suspected violations, restrict access, suspend accounts, or remove listings where reasonably necessary to protect users and the platform.`,
      },
      {
        heading: '8. Policy updates',
        content: `UniAbuja Market may update this policy as the marketplace develops. Updated versions will be published on the platform.`,
      },
      {
        heading: '9. Contact',
        content: `For questions or reports concerning this policy, contact ${SUPPORT_EMAIL}.`,
      },
    ],
  },

  '/shipping-policy': {
    title: 'Shipping and Delivery Policy',
    updated: '15 October 2026',
    sections: [
      {
        heading: '1. Delivery model',
        content: `UniAbuja Market is an online marketplace. Products are supplied by independent vendors rather than from a central marketplace warehouse.

Vendors are responsible for preparing and fulfilling customer orders.`,
      },
      {
        heading: '2. Delivery arrangements',
        content: `Depending on the order, delivery may be handled by the vendor or by a delivery partner arranged by the vendor.

Customers do not select individual riders during checkout.`,
      },
      {
        heading: '3. Delivery charges',
        content: `Applicable vendor delivery charges are shown during checkout before the customer completes payment.

Any separate arrangement between a vendor and a delivery partner is handled outside the customer's marketplace checkout.

A vendor should not increase an agreed delivery charge after payment without obtaining the customer's agreement and arranging any necessary additional payment or adjustment.`,
      },
      {
        heading: '4. Delivery times',
        content: `Estimated delivery times may vary according to vendor availability, product preparation, delivery arrangements, customer location, and other circumstances.

Vendors should communicate material delays to affected customers. Displayed delivery times are estimates unless expressly stated otherwise.`,
      },
      {
        heading: '5. Order tracking',
        content: `Customers may use the marketplace's order-status information to follow order progress.

Vendors are responsible for keeping order statuses accurate as orders progress through fulfilment.`,
      },
      {
        heading: '6. Delivery verification',
        content: `Where a delivery verification code is provided, the customer should share it only after the order has been delivered.

The code confirms delivery and may determine whether an order becomes eligible for vendor payout under the applicable payout arrangements.

Customers should not confirm delivery before receiving their orders.`,
      },
      {
        heading: '7. Failed delivery',
        content: `If delivery cannot be completed, the customer should contact the vendor or UniAbuja Market.

The circumstances should be reviewed to determine the appropriate next step, which may include rearranging delivery or reviewing cancellation and refund eligibility.`,
      },
      {
        heading: '8. Missing, damaged, or incorrect products',
        content: `Customers should report missing, damaged, or incorrect items promptly and provide relevant order details and supporting evidence where available.

The vendor and UniAbuja Market will review the circumstances under the applicable returns and refunds policy.`,
      },
      {
        heading: '9. Contact',
        content: `For delivery-related questions or complaints, contact ${SUPPORT_EMAIL}.`,
      },
    ],
  },

  '/refund-policy': {
    title: 'Returns, Refunds and Cancellations Policy',
    updated: '15 October 2026',
    sections: [
      {
        heading: '1. Purpose',
        content: `UniAbuja Market facilitates transactions between buyers and independent vendors. This policy explains how order cancellations, returns, refunds, and disputes are intended to be handled.`,
      },
      {
        heading: '2. Order cancellations',
        content: `Customers should contact the vendor or UniAbuja Market as soon as possible to request cancellation.

Cancellation depends on the order's status and whether the vendor has prepared, dispatched, or delivered the product. Submitting a request does not mean it has been approved.

If an order cannot be fulfilled, the circumstances will be reviewed to determine whether cancellation and a refund are appropriate.`,
      },
      {
        heading: '3. Refund eligibility',
        content: `A refund may be considered where a product differs materially from its listing, arrives damaged or defective, is incorrect or incomplete, or where a vendor cannot fulfil a paid order.

Confirmed duplicate or incorrect payments may also qualify for a refund.

Eligibility is assessed according to the circumstances, applicable law, and the agreed transaction terms.`,
      },
      {
        heading: '4. Reporting a problem',
        content: `Customers should report problems promptly and provide the order reference, a description of the issue, and relevant photographs or other evidence where available.`,
      },
      {
        heading: '5. Review and resolution',
        content: `UniAbuja Market may review order details, payment records, delivery status, communications, and supporting evidence.

Depending on the circumstances, a resolution may include correcting or replacing an order, rearranging delivery, cancelling an unfulfilled order, or issuing an appropriate full or partial refund.`,
      },
      {
        heading: '6. Refund processing',
        content: `Approved refunds must be processed through the appropriate payment-processing procedure.

Changing an order's status does not itself return money to a customer. The actual refund must be initiated and its status verified through the payment provider.

The time required for a refund to appear depends on the payment provider, payment method, and financial institution.`,
      },
      {
        heading: '7. Delivery charges',
        content: `Delivery charges will be reviewed as part of a cancellation or refund where relevant.

Whether delivery charges are refundable depends on the circumstances, services already provided, applicable law, and the agreed terms.`,
      },
      {
        heading: '8. Buyer-vendor disputes',
        content: `Customers and vendors should first attempt to resolve order-related concerns through clear communication.

Where a dispute remains unresolved, UniAbuja Market may review the available evidence and facilitate a resolution.

Nothing in this policy removes rights available under applicable law.`,
      },
      {
        heading: '9. Fraud and misuse',
        content: `UniAbuja Market may investigate suspected fraudulent refund requests, false delivery claims, or other misuse of the marketplace and may apply appropriate account restrictions where justified.`,
      },
      {
        heading: '10. Contact',
        content: `For cancellation, return, refund, or dispute enquiries, contact ${SUPPORT_EMAIL}.`,
      },
    ],
  },
}

const normalizePath = (pathname) =>
  pathname.replace(/\/+$/, '') || '/'

export default function Policies({ onBack }) {
  const [path, setPath] = useState(() =>
    normalizePath(window.location.pathname)
  )

  useEffect(() => {
    const handlePopState = () => {
      const currentPath = normalizePath(window.location.pathname)

      if (currentPath === '/') {
        // Leave the policy component and return to the actual marketplace.
        window.location.replace('/')
        return
      }

      setPath(currentPath)
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  const navigate = (nextPath) => {
    if (!policies[nextPath]) return

    window.history.pushState(
      { uniAbujaMarketPolicy: true },
      '',
      nextPath
    )

    setPath(nextPath)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const goBackToMarketplace = () => {
    if (onBack) {
      onBack()
    } else {
      window.location.assign('/')
    }
  }

  const policy = policies[path]

  if (!policy) {
    return (
      <main className="policy-page">
        <div className="policy-container">
          <button
            type="button"
            className="policy-back"
            onClick={goBackToMarketplace}
          >
            ← Back to marketplace
          </button>

          <h1>UniAbuja Market Policies</h1>
          <p>Select a policy to read:</p>

          {Object.entries(policies).map(([url, item]) => (
            <button
              type="button"
              className="policy-link"
              key={url}
              onClick={() => navigate(url)}
            >
              {item.title} →
            </button>
          ))}
        </div>
      </main>
    )
  }

  return (
    <main className="policy-page">
      <article className="policy-container">
        <a
          className="policy-brand"
          href="/"
          onClick={(event) => {
            event.preventDefault()
            goBackToMarketplace()
          }}
        >
          UniAbuja Market
        </a>

        <p className="policy-label">MARKETPLACE POLICY</p>

        <h1>{policy.title}</h1>

        <p className="policy-updated">
          Last updated: {policy.updated}
        </p>

        {policy.sections.map((section) => (
          <section
            className="policy-section"
            key={section.heading}
          >
            <h2>{section.heading}</h2>

            {section.content.split('\n\n').map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </section>
        ))}

        <footer className="policy-footer">
          UniAbuja Market · Questions? Contact{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
        </footer>

        <nav
          className="policy-navigation"
          aria-label="Other marketplace policies"
        >
          {Object.entries(policies)
            .filter(([url]) => url !== path)
            .map(([url, item]) => (
              <button
                type="button"
                key={url}
                onClick={() => navigate(url)}
              >
                {item.title}
              </button>
            ))}
        </nav>

        <button
          type="button"
          className="policy-back"
          onClick={goBackToMarketplace}
        >
          ← Back to marketplace
        </button>
      </article>
    </main>
  )
}