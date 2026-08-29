import { useEffect, useState } from 'react'

const githubUrl = 'https://github.com/superche/collabhub'
type Language = 'en' | 'zh'

const copy = {
  en: {
    pageTitle: 'CollabHub · Multiplayer for existing React apps', navLabel: 'Primary navigation', homeLabel: 'CollabHub home', how: 'How it works', examples: 'Examples', docs: 'Docs', github: 'GitHub', languageLabel: 'Language',
    kicker: 'OPEN SOURCE · STABLE 1.0', heroTitle: 'Multiplayer, without rewriting your React app.', heroBody: 'Keep your components, data model, store, and REST fallback. Add one client boundary and deploy one collaboration service.', tryDemo: 'Try two-client demo', star: 'Star on GitHub',
    systemLabel: 'Your React app connects to CollabHub through a small SDK boundary', path: 'COLLABORATION PATH', online: 'ONLINE', clientAlice: 'CLIENT / ALICE', clientBob: 'CLIENT / BOB', yourApp: 'Your React app', operations: 'operations', patches: 'patches', infrastructure: 'YOUR INFRASTRUCTURE', service: 'CollabHub service', serviceDetails: 'order · validate · recover',
    proofExamples: 'real examples', proofTests: 'automated tests', proofDependencies: 'npm dependencies to start', proofLicense: 'free and open source',
    keepIndex: '01 / KEEP YOUR APP', keepTitle: 'Collaboration stays at the edge of your codebase.', keepBody: 'Your normal React code still reads business state and sends business commands. WebSocket details, reconnects, and recovery remain inside one integration area.', youKeep: 'YOU KEEP', components: 'Components', componentsBody: 'No collaboration imports in your UI.', domain: 'Domain model', domainBody: 'No migration into a library-owned document type.', rest: 'REST fallback', restBody: 'Turn collaboration off and use the existing path.', adds: 'COLLABHUB ADDS', sync: 'Sync + recovery', syncBody: 'Incremental changes, pending replay, snapshots, and diagnostics.',
    integrationIndex: '02 / TWO THINGS TO ADD', integrationTitle: 'One SDK boundary. One deployable service.', integrationBody: 'Keep validation, linked updates, and conflict choices in one shared model. CollabHub runs it again on the server.', guide: 'Read the integration guide', client: 'CLIENT', server: 'SERVER',
    adaptersIndex: '03 / REAL ADAPTERS', adaptersTitle: 'Typical React collaboration, proven end to end.', todoBody: 'Business commands, linked counters, ordering, REST fallback, and double-write prevention.', blocknoteBody: 'Incremental block updates, coalescing, offline replay, and snapshot recovery.', flowBody: 'Incremental graph edits, one commit per drag, and atomic linked-edge deletion.', live: 'LIVE', openWorkspace: 'Open workspace', viewExample: 'View example',
    sourceIndex: '04 / OPEN SOURCE', sourceTitle: 'Run it where your data already lives.', sourceBody: 'Deploy one persistent AWS VM from $12/month. Bring managed PostgreSQL and Redis when you need multi-node failover.', viewSource: 'View source', openDemo: 'Open live demo', footer: 'Open-source multiplayer infrastructure for existing React applications.',
  },
  zh: {
    pageTitle: 'CollabHub · 为现有 React 应用添加多人协作', navLabel: '主导航', homeLabel: 'CollabHub 首页', how: '工作原理', examples: '案例', docs: '文档', github: 'GitHub', languageLabel: '语言',
    kicker: '开源 · 稳定版 1.0', heroTitle: '无需重写 React 应用，也能多人协作。', heroBody: '保留你的组件、数据模型、状态管理和 REST 单人模式。增加一个客户端边界，再部署一个协同服务即可。', tryDemo: '体验双客户端 Demo', star: '在 GitHub 上加星',
    systemLabel: '你的 React 应用通过一个轻量 SDK 边界连接 CollabHub', path: '协同链路', online: '在线', clientAlice: '客户端 / ALICE', clientBob: '客户端 / BOB', yourApp: '你的 React 应用', operations: '操作', patches: '变更', infrastructure: '你的基础设施', service: 'CollabHub 服务', serviceDetails: '排序 · 校验 · 恢复',
    proofExamples: '个真实案例', proofTests: '项自动化测试', proofDependencies: '个 npm 依赖即可开始', proofLicense: '免费开源',
    keepIndex: '01 / 保留你的应用', keepTitle: '协同逻辑只放在代码边缘。', keepBody: '普通 React 代码继续读取业务状态、发送业务命令。WebSocket、重连和恢复逻辑集中在一个接入目录里。', youKeep: '你继续使用', components: '现有组件', componentsBody: 'UI 组件无需引入 CollabHub。', domain: '业务模型', domainBody: '无需迁移到框架规定的数据类型。', rest: 'REST 单人模式', restBody: '关闭协同后继续走原来的接口。', adds: 'COLLABHUB 提供', sync: '同步与恢复', syncBody: '增量变更、离线重放、快照和诊断。',
    integrationIndex: '02 / 只需增加两部分', integrationTitle: '一个 SDK 接入层，一个可部署服务。', integrationBody: '校验、字段联动和冲突处理集中写在一个共享模型里，CollabHub 会在服务端再次执行。', guide: '阅读接入指南', client: '客户端', server: '服务端',
    adaptersIndex: '03 / 真实接入案例', adaptersTitle: '典型 React 协同场景，均已端到端验证。', todoBody: '业务命令、字段联动、排序、REST 切换与双写保护。', blocknoteBody: '增量块更新、合并提交、离线重放与快照恢复。', flowBody: '增量图编辑、每次拖拽只提交一次，以及联动删除边。', live: '在线', openWorkspace: '打开工作区', viewExample: '查看案例',
    sourceIndex: '04 / 开源部署', sourceTitle: '让数据留在你的基础设施里。', sourceBody: 'AWS 持久化单机版 $12/月起；需要多节点故障切换时再接入托管 PostgreSQL 与 Redis。', viewSource: '查看源码', openDemo: '打开在线 Demo', footer: '为现有 React 应用提供的开源多人协作基础设施。',
  },
} as const

export function LandingPage() {
  const [language, setLanguage] = useState<Language>(() => new URLSearchParams(location.search).get('lang') === 'zh' ? 'zh' : 'en')
  const [roomUrl] = useState(() => `/room?document=graph-${crypto.randomUUID()}`)
  const t = copy[language]
  const docsUrl = `${githubUrl}/blob/main/docs/getting-started${language === 'zh' ? '.zh-CN' : ''}.md`

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    document.title = t.pageTitle
  }, [language, t.pageTitle])

  function changeLanguage(next: Language) {
    setLanguage(next)
    const url = new URL(location.href)
    if (next === 'zh') url.searchParams.set('lang', 'zh')
    else url.searchParams.delete('lang')
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }

  return <div className="landing-page">
    <nav className="landing-nav" aria-label={t.navLabel}>
      <a className="brand" href="/" aria-label={t.homeLabel}><BrandMark /><span>CollabHub</span></a>
      <div className="landing-nav-links">
        <a href="#how-it-works">{t.how}</a><a href="#examples">{t.examples}</a><a href={docsUrl}>{t.docs}</a>
        <div className="language-switch" role="group" aria-label={t.languageLabel}>
          <button type="button" aria-pressed={language === 'en'} onClick={() => changeLanguage('en')}>EN</button><span aria-hidden="true">/</span><button type="button" aria-pressed={language === 'zh'} onClick={() => changeLanguage('zh')}>中文</button>
        </div>
        <a className="nav-github" href={githubUrl} target="_blank" rel="noreferrer">{t.github} <span aria-hidden="true">↗</span></a>
      </div>
    </nav>

    <main className="landing-main">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="landing-kicker"><i /> {t.kicker}</span><h1 id="hero-title">{t.heroTitle}</h1><p>{t.heroBody}</p>
          <div className="hero-actions"><a className="button primary" href="/demo.html">{t.tryDemo}</a><a className="button secondary" href={githubUrl} target="_blank" rel="noreferrer"><StarIcon /> {t.star}</a></div>
          <code className="install-command"><span>$</span> npm create @collabhub/react@1.0.0 my-app</code>
        </div>
        <div className="hero-system" aria-label={t.systemLabel}>
          <div className="system-meta"><span>{t.path}</span><strong>{t.online} <i /></strong></div>
          <SystemClient className="client-alice" label={t.clientAlice} app={t.yourApp} />
          <SystemClient className="client-bob" label={t.clientBob} app={t.yourApp} />
          <div className="system-rail"><span>{t.operations}</span><i /><span>{t.patches}</span></div>
          <div className="system-service"><span>{t.infrastructure}</span><strong>{t.service}</strong><small>{t.serviceDetails}</small></div>
          <div className="version-ticks"><span>v12</span><i /><span>v13</span><i /><span>v14</span></div>
        </div>
      </section>

      <section className="proof-strip" aria-label="Project proof"><div><strong>3</strong><span>{t.proofExamples}</span></div><div><strong>91</strong><span>{t.proofTests}</span></div><div><strong>2</strong><span>{t.proofDependencies}</span></div><div><strong>Apache-2.0</strong><span>{t.proofLicense}</span></div></section>

      <section className="keep-section" id="how-it-works">
        <div className="section-heading"><span className="section-index">{t.keepIndex}</span><h2>{t.keepTitle}</h2><p>{t.keepBody}</p></div>
        <div className="keep-grid"><InfoCard label={t.youKeep} title={t.components} body={t.componentsBody} /><InfoCard label={t.youKeep} title={t.domain} body={t.domainBody} /><InfoCard label={t.youKeep} title={t.rest} body={t.restBody} /><InfoCard label={t.adds} title={t.sync} body={t.syncBody} accent /></div>
      </section>

      <section className="integration-section" id="integration">
        <div className="integration-copy"><span className="section-index">{t.integrationIndex}</span><h2>{t.integrationTitle}</h2><p>{t.integrationBody}</p><a href={docsUrl}>{t.guide} <span aria-hidden="true">→</span></a></div>
        <div className="code-stack" aria-label="CollabHub integration example">
          <div className="code-card"><header><span>src/collab/collabhub.ts</span><b>{t.client}</b></header><pre><code><em>const</em> runtime = createAppCollaboration({`\n  `}documentId, currentUser.id{`\n`})</code></pre></div>
          <div className="code-card service-code"><header><span>deploy/aws</span><b>{t.server}</b></header><pre><code>terraform apply<br /><span className="code-comment"># Lightsail · from $12/month</span></code></pre></div>
        </div>
      </section>

      <section className="examples-section" id="examples">
        <div className="section-heading examples-heading"><span className="section-index">{t.adaptersIndex}</span><h2>{t.adaptersTitle}</h2></div>
        <div className="example-grid"><ExampleCard number="01" title="TODO List" description={t.todoBody} href={`${githubUrl}/tree/main/examples/todo-list-app`} openLabel={t.viewExample} liveLabel={t.live} /><ExampleCard number="02" title="BlockNote" description={t.blocknoteBody} href={`${githubUrl}/tree/main/examples/blocknote-app`} openLabel={t.viewExample} liveLabel={t.live} /><ExampleCard number="03" title="React Flow" description={t.flowBody} href={roomUrl} live openLabel={t.openWorkspace} liveLabel={t.live} /></div>
      </section>

      <section className="open-source-section"><div><span className="section-index light">{t.sourceIndex}</span><h2>{t.sourceTitle}</h2><p>{t.sourceBody}</p></div><div className="open-source-actions"><a className="button light-button" href={githubUrl} target="_blank" rel="noreferrer"><StarIcon /> {t.viewSource}</a><a className="text-link" href="/demo.html">{t.openDemo} →</a></div></section>
    </main>

    <footer className="landing-footer"><a className="brand" href="/"><BrandMark /><span>CollabHub</span></a><p>{t.footer}</p><div><a href={githubUrl}>GitHub</a><a href={docsUrl}>{t.docs}</a><span>Apache-2.0</span></div></footer>
  </div>
}

function SystemClient({ className, label, app }: { className: string; label: string; app: string }) {
  return <div className={`system-client ${className}`}><span>{label}</span><strong>{app}</strong><div className="mini-flow"><b>Brief</b><i /><b>Build</b><i /><b>Ship</b></div></div>
}

function InfoCard({ label, title, body, accent = false }: { label: string; title: string; body: string; accent?: boolean }) {
  return <article className={accent ? 'accent-card' : undefined}><span>{label}</span><h3>{title}</h3><p>{body}</p></article>
}

function ExampleCard({ number, title, description, href, live = false, openLabel, liveLabel }: { number: string; title: string; description: string; href: string; live?: boolean; openLabel: string; liveLabel: string }) {
  return <a className="example-card" href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noreferrer' : undefined}><div><span>{number}</span>{live && <b>{liveLabel}</b>}</div><h3>{title}</h3><p>{description}</p><strong>{openLabel} <span aria-hidden="true">↗</span></strong></a>
}

function BrandMark() {
  return <svg className="brand-mark" viewBox="0 0 48 48" role="img" aria-label="CollabHub mark"><rect x="2" y="2" width="44" height="44" rx="14" fill="#175cd3" /><circle cx="16" cy="24" r="5" fill="#ffffff" /><circle cx="32" cy="15" r="5" fill="#ffd24a" /><circle cx="32" cy="33" r="5" fill="#8fb8ff" /><path d="M20.4 21.5 27.6 17M20.5 26.5l7.2 4.1" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" /></svg>
}

function StarIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 2.7 2.84 5.76 6.36.92-4.6 4.49 1.09 6.33L12 17.21 6.31 20.2l1.09-6.33-4.6-4.49 6.36-.92L12 2.7Z" /></svg>
}
