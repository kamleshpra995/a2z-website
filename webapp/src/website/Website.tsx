/**
 * The public marketing website. It is rendered to static HTML at build time (see render.tsx and
 * the prerender plugin in vite.config.ts), so search engines receive the full content and the
 * page ships without a JavaScript bundle.
 */
import {
  airConditioning,
  business,
  clients,
  reasons,
  refrigeration,
  type ServiceCard,
} from './content.ts';
import { Icon } from './icons.tsx';

function Header() {
  return (
    <header>
      <div className="wrap nav">
        <a href="#" className="brand">
          <img src="/logo.png" alt="A2Z Power Solution logo" />
          <span>
            <span className="a2z">A2Z</span> <span className="ps">Power Solution</span>
          </span>
        </a>
        <nav className="nav-links">
          <a href="#services">Services</a>
          <a href="#clients">Clients</a>
          <a href="#why">Why Us</a>
          <a href="#contact">Contact</a>
        </nav>
        <div className="nav-actions">
          <a className="login-btn" href={business.portal} title="Customer & staff login">
            <Icon name="user" width="15" height="15" fill="currentColor" />
            Login
          </a>
          <a className="call-btn" href={`tel:${business.phone}`} aria-label="Call now">
            <Icon name="phone" width="15" height="15" fill="currentColor" />
            <span className="btn-label">Call Now</span>
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="wrap">
        <span className="tag">PAN-INDIA SERVICE</span>
        <h1>
          Commercial Refrigeration &amp; <em>HVAC Repair Services</em> You Can Rely On
        </h1>
        <p>
          From ice machines and cold rooms to VRF and ductable AC systems — A2Z Power Solution keeps
          your kitchen, store and facility running cool. Trusted by leading food &amp; retail
          brands.
        </p>
        <div className="hero-ctas">
          <a className="btn btn-red" href={`tel:${business.phone}`}>
            <Icon name="phone" />
            {business.phoneDisplay}
          </a>
          <a className="btn btn-wa" href={business.whatsapp} target="_blank" rel="noopener">
            <Icon name="whatsapp" />
            WhatsApp Us
          </a>
        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  return (
    <div className="strip">
      <div className="wrap">
        <span>
          <Icon name="shield" /> GST Registered
        </span>
        <span>
          <Icon name="shield" /> MSME (Udyam) Registered
        </span>
        <span>
          <Icon name="sun" /> Serving Since 2021
        </span>
        <span>
          <Icon name="star" /> Trusted by Leading Brands
        </span>
      </div>
    </div>
  );
}

function ServiceGrid({
  title,
  cards,
  blue,
}: {
  title: string;
  cards: ServiceCard[];
  blue?: boolean;
}) {
  return (
    <div className={blue ? 'svc-group blue' : 'svc-group'}>
      <h3>{title}</h3>
      <div className="grid">
        {cards.map((card) => (
          <div className="card" key={card.title}>
            <img
              className="thumb"
              src={card.image}
              alt={card.alt}
              loading="lazy"
              data-hide-on-error=""
            />
            <div className="ico">
              <Icon name={card.icon} />
            </div>
            <h4>{card.title}</h4>
            <p>{card.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Services() {
  return (
    <section id="services">
      <div className="wrap">
        <div className="sec-head">
          <span className="kicker">Our Services</span>
          <h2>Complete Cooling Care for Commercial Kitchens &amp; Facilities</h2>
          <p>
            Installation, repair, maintenance and AMC for all commercial refrigeration and
            air-conditioning equipment.
          </p>
        </div>
        <ServiceGrid title="Commercial Refrigeration" cards={refrigeration} />
        <ServiceGrid title="Air Conditioning & Cooling Systems" cards={airConditioning} blue />
      </div>
    </section>
  );
}

function Clients() {
  return (
    <section id="clients" className="clients">
      <div className="wrap">
        <div className="sec-head">
          <span className="kicker">Our Clients</span>
          <h2>Trusted by Leading Food &amp; Retail Brands</h2>
          <p>
            We service the equipment behind some of India&apos;s best-known kitchens and stores.
          </p>
        </div>
        <div className="logo-row">
          {clients.map((client) => (
            <div className="client-chip" key={client.name}>
              <img
                className="clogo"
                src={`https://www.google.com/s2/favicons?domain=${client.domain}&sz=128`}
                alt={`${client.name} logo`}
                loading="lazy"
                data-hide-on-error=""
              />
              <span>{client.name}</span>
              <small>{client.detail}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhyUs() {
  return (
    <section id="why" className="why">
      <div className="wrap">
        <div className="sec-head">
          <span className="kicker">Why A2Z</span>
          <h2>Why Businesses Choose Us</h2>
        </div>
        <div className="grid">
          {reasons.map((reason) => (
            <div className="card" key={reason.title}>
              <div className="ico">
                <Icon name={reason.icon} />
              </div>
              <h4>{reason.title}</h4>
              <p>{reason.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contact" className="contact">
      <div className="wrap">
        <div className="sec-head">
          <span className="kicker">Get In Touch</span>
          <h2>Book a Service Call Today</h2>
          <p>Available for breakdown calls, installations and AMC enquiries across India.</p>
        </div>
        <div className="c-grid">
          <a className="c-card" href={`tel:${business.phone}`}>
            <Icon name="phone" />
            <div className="label">Call Us</div>
            <div className="val">{business.phoneDisplay}</div>
          </a>
          <a className="c-card" href={business.whatsapp} target="_blank" rel="noopener">
            <Icon name="whatsappSolid" />
            <div className="label">WhatsApp</div>
            <div className="val">Message Us</div>
          </a>
          <a className="c-card" href={`mailto:${business.email}`}>
            <Icon name="mail" />
            <div className="label">Email</div>
            <div className="val">{business.email}</div>
          </a>
          <div className="c-card">
            <Icon name="pin" />
            <div className="label">Address</div>
            <div className="val">{business.address}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ year }: { year: number }) {
  return (
    <footer>
      <div className="wrap">
        <div>
          <strong>{business.name}</strong> · {business.tagline}
          <br />© <span id="yr">{year}</span> {business.name}. All rights reserved.
          <br />
          <a className="portal-link" href={business.portal}>
            Customer &amp; staff login →
          </a>
        </div>
        <div className="reg">
          <span>
            <Icon name="check" /> GSTIN: {business.gstin}
          </span>
          <span>
            <Icon name="check" /> {business.udyam}
          </span>
        </div>
      </div>
    </footer>
  );
}

export default function Website({ year = new Date().getFullYear() }: { year?: number }) {
  return (
    <>
      <Header />
      <Hero />
      <TrustStrip />
      <Services />
      <Clients />
      <WhyUs />
      <Contact />
      <Footer year={year} />
      <a
        className="wa-float"
        href={business.whatsapp}
        target="_blank"
        rel="noopener"
        aria-label="Chat on WhatsApp"
      >
        <Icon name="whatsappSolid" />
      </a>
    </>
  );
}
