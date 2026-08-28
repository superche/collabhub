const githubUrl = 'https://github.com/superche/collabhub'
const docsUrl = `${githubUrl}/blob/main/docs/getting-started.md`

export function LandingPage() {
  const roomUrl = `/room?document=graph-${crypto.randomUUID()}`

  return <div className="landing-page">
    <nav className="landing-nav" aria-label="Primary navigation">
      <a className="brand" href="/" aria-label="CollabHub home">
        <BrandMark />
        <span>CollabHub</span>
      </a>
      <div className="landing-nav-links">
        <a href="#how-it-works">How it works</a>
        <a href="#examples">Examples</a>
        <a href={docsUrl}>Docs</a>
        <a className="nav-github" href={githubUrl} target="_blank" rel="noreferrer">GitHub <span aria-hidden="true">↗</span></a>
      </div>
    </nav>

    <main className="landing-main">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="landing-kicker"><i /> OPEN SOURCE · TECHNICAL PREVIEW</span>
          <h1 id="hero-title">Multiplayer, without rewriting your React app.</h1>
          <p>Keep your components, data model, store, and REST fallback. Add one client boundary and deploy one collaboration service.</p>
          <div className="hero-actions">
            <a className="button primary" href="/demo.html">Try two-client demo</a>
            <a className="button secondary" href={githubUrl} target="_blank" rel="noreferrer"><StarIcon /> Star on GitHub</a>
          </div>
          <code className="install-command"><span>$</span> npm create @collabhub/react@0.1.3 my-app</code>
        </div>

        <div className="hero-system" aria-label="Your React app connects to CollabHub through a small SDK boundary">
          <div className="system-meta"><span>COLLABORATION PATH</span><strong>ONLINE <i /></strong></div>
          <div className="system-client client-alice">
            <span>CLIENT / ALICE</span>
            <strong>Your React app</strong>
            <div className="mini-flow"><b>Brief</b><i /><b>Build</b><i /><b>Ship</b></div>
          </div>
          <div className="system-client client-bob">
            <span>CLIENT / BOB</span>
            <strong>Your React app</strong>
            <div className="mini-flow"><b>Brief</b><i /><b>Build</b><i /><b>Ship</b></div>
          </div>
          <div className="system-rail"><span>operations</span><i /><span>patches</span></div>
          <div className="system-service">
            <span>YOUR INFRASTRUCTURE</span>
            <strong>CollabHub service</strong>
            <small>order · validate · recover</small>
          </div>
          <div className="version-ticks"><span>v12</span><i /><span>v13</span><i /><span>v14</span></div>
        </div>
      </section>

      <section className="proof-strip" aria-label="Project proof">
        <div><strong>3</strong><span>real examples</span></div>
        <div><strong>65</strong><span>automated tests</span></div>
        <div><strong>2</strong><span>npm dependencies to start</span></div>
        <div><strong>Apache-2.0</strong><span>free and open source</span></div>
      </section>

      <section className="keep-section" id="how-it-works">
        <div className="section-heading">
          <span className="section-index">01 / KEEP YOUR APP</span>
          <h2>Collaboration stays at the edge of your codebase.</h2>
          <p>Your normal React code still reads business state and sends business commands. WebSocket details, reconnects, and recovery remain inside one integration area.</p>
        </div>
        <div className="keep-grid">
          <article><span>YOU KEEP</span><h3>Components</h3><p>No collaboration imports in your UI.</p></article>
          <article><span>YOU KEEP</span><h3>Domain model</h3><p>No migration into a library-owned document type.</p></article>
          <article><span>YOU KEEP</span><h3>REST fallback</h3><p>Turn collaboration off and use the existing path.</p></article>
          <article className="accent-card"><span>COLLABHUB ADDS</span><h3>Sync + recovery</h3><p>Incremental changes, pending replay, snapshots, and diagnostics.</p></article>
        </div>
      </section>

      <section className="integration-section" id="integration">
        <div className="integration-copy">
          <span className="section-index">02 / TWO THINGS TO ADD</span>
          <h2>One SDK boundary. One deployable service.</h2>
          <p>Put custom validation, linked-field updates, and conflict decisions in your server Domain Pack—not across every component.</p>
          <a href={docsUrl}>Read the integration guide <span aria-hidden="true">→</span></a>
        </div>
        <div className="code-stack" aria-label="CollabHub integration example">
          <div className="code-card">
            <header><span>src/collab/create-runtime.ts</span><b>CLIENT</b></header>
            <pre><code><em>const</em> runtime = createCollabRuntime({'{'}{`\n  `}wsUrl, documentId,{`\n  `}store, commands{`\n`}{'}'})</code></pre>
          </div>
          <div className="code-card service-code">
            <header><span>your infrastructure</span><b>SERVER</b></header>
            <pre><code>docker run -p 8080:8080 \<br />  ghcr.io/superche/collabhub:0.1.3</code></pre>
          </div>
        </div>
      </section>

      <section className="examples-section" id="examples">
        <div className="section-heading examples-heading">
          <span className="section-index">03 / REAL ADAPTERS</span>
          <h2>Typical React collaboration, proven end to end.</h2>
        </div>
        <div className="example-grid">
          <ExampleCard number="01" title="TODO List" description="Business commands, linked counters, ordering, REST fallback, and double-write prevention." href={`${githubUrl}/tree/main/examples/todo-list-app`} />
          <ExampleCard number="02" title="BlockNote" description="Incremental block updates, coalescing, offline replay, and snapshot recovery." href={`${githubUrl}/tree/main/examples/blocknote-app`} />
          <ExampleCard number="03" title="React Flow" description="Incremental graph edits, one commit per drag, and atomic linked-edge deletion." href={roomUrl} live />
        </div>
      </section>

      <section className="open-source-section">
        <div>
          <span className="section-index light">04 / OPEN SOURCE</span>
          <h2>Run it where your data already lives.</h2>
          <p>Start with Docker. Scale with PostgreSQL and Redis. AWS, Alibaba Cloud, and Kubernetes baselines are included.</p>
        </div>
        <div className="open-source-actions">
          <a className="button light-button" href={githubUrl} target="_blank" rel="noreferrer"><StarIcon /> View source</a>
          <a className="text-link" href="/demo.html">Open live demo →</a>
        </div>
      </section>
    </main>

    <footer className="landing-footer">
      <a className="brand" href="/"><BrandMark /><span>CollabHub</span></a>
      <p>Open-source multiplayer infrastructure for existing React applications.</p>
      <div><a href={githubUrl}>GitHub</a><a href={docsUrl}>Docs</a><span>Apache-2.0</span></div>
    </footer>
  </div>
}

function ExampleCard({ number, title, description, href, live = false }: { number: string; title: string; description: string; href: string; live?: boolean }) {
  return <a className="example-card" href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noreferrer' : undefined}>
    <div><span>{number}</span>{live && <b>LIVE</b>}</div>
    <h3>{title}</h3>
    <p>{description}</p>
    <strong>{live ? 'Open workspace' : 'View example'} <span aria-hidden="true">↗</span></strong>
  </a>
}

function BrandMark() {
  return <svg className="brand-mark" viewBox="0 0 48 48" role="img" aria-label="CollabHub mark">
    <rect x="2" y="2" width="44" height="44" rx="14" fill="#237a53" />
    <circle cx="16" cy="24" r="5" fill="#edf1ed" />
    <circle cx="32" cy="15" r="5" fill="#f0c766" />
    <circle cx="32" cy="33" r="5" fill="#70e3a9" />
    <path d="M20.4 21.5 27.6 17M20.5 26.5l7.2 4.1" stroke="#edf1ed" strokeWidth="3.2" strokeLinecap="round" />
  </svg>
}

function StarIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 2.7 2.84 5.76 6.36.92-4.6 4.49 1.09 6.33L12 17.21 6.31 20.2l1.09-6.33-4.6-4.49 6.36-.92L12 2.7Z" /></svg>
}
