// Visible reserved-rights line (spec §2.4.1). Embedded IPTC/XMP metadata is invisible to a
// casual viewer; this footer is what communicates the closed door to someone who only
// *looks*. Tertiary tone, body font, no design cost. Self-injecting so every page gets it
// from one place — pages just import this module.

const YEAR = new Date().getFullYear();

function mountFooter() {
  if (document.querySelector('.site-rights')) return; // idempotent

  const style = document.createElement('style');
  style.textContent = `
    .site-rights{
      font-family: var(--font-body);
      font-size: .72rem;
      letter-spacing: .04em;
      color: var(--text-3);
      text-align: center;
      padding: 2.2rem 1rem 1.4rem;
      opacity: .8;
    }
    .site-rights a{ color: inherit; text-decoration: none; border-bottom: 1px solid var(--hairline); }
    .site-rights a:hover{ color: var(--text-2); }
  `;
  document.head.appendChild(style);

  const footer = document.createElement('footer');
  footer.className = 'site-rights';
  footer.innerHTML =
    `© ${YEAR} Jeremy Ivan · <a href="/license.html">All rights reserved</a>`;
  document.body.appendChild(footer);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountFooter);
} else {
  mountFooter();
}
