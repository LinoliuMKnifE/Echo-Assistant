import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity,
  Archive,
  ArrowLeft,
  Bell,
  Brain,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  CloudOff,
  Download,
  Eye,
  FolderKanban,
  History,
  KeyRound,
  Laptop,
  LockKeyhole,
  Menu,
  MessageCircle,
  MessagesSquare,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  UserRound,
  WandSparkles,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react';
import { navLabels, type Memory, type MemoryMode, type Page, type Theme } from './model';
import { completeOnboarding, credentialStatus, onboardingStatus, storeApiKey } from './secure';
import {
  createApplicationAdapter,
  type ApplicationAdapter,
  type ApplicationSnapshot,
} from './application';
import echoMark from '../assets/echo-mark.svg';

const navIcons: Record<Page, typeof MessageCircle> = {
  chat: MessageCircle,
  conversations: MessagesSquare,
  profile: UserRound,
  memories: Brain,
  projects: FolderKanban,
  skills: WandSparkles,
  schedules: CalendarClock,
  tools: Wrench,
  audit: Activity,
  settings: Settings,
  backup: Archive,
};

type Toast = { id: number; message: string };
type Dialog = {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  onConfirm: () => void;
};

function EchoMark() {
  return <img className="echo-mark" src={echoMark} alt="" aria-hidden="true" />;
}

function App() {
  const [adapter] = useState(createApplicationAdapter);
  const [snapshot, setSnapshot] = useState<ApplicationSnapshot | null>(null);
  const [loadError, setLoadError] = useState('');
  const [setup, setSetup] = useState<boolean | null>(() =>
    '__TAURI_INTERNALS__' in window ? null : localStorage.getItem('luma.setupComplete') === 'yes',
  );
  const [page, setPage] = useState<Page>('chat');
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('luma.theme') as Theme) || 'dark',
  );
  const [online, setOnline] = useState(navigator.onLine);
  const [sidebar, setSidebar] = useState(false);
  const [query, setQuery] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('luma.theme', theme);
  }, [theme]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    addEventListener('online', update);
    addEventListener('offline', update);
    return () => {
      removeEventListener('online', update);
      removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (setup !== null) return;
    void onboardingStatus().then(setSetup, () => setSetup(false));
  }, [setup]);
  const reload = async () => {
    try {
      setSnapshot(await adapter.load());
      setLoadError('');
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Echo could not open your local information.',
      );
    }
  };
  useEffect(() => {
    if (setup) void reload();
  }, [setup]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setDialog(null);
        setSidebar(false);
      }
    };
    addEventListener('keydown', shortcut);
    return () => removeEventListener('keydown', shortcut);
  }, []);

  const toast = (message: string) => {
    const id = Date.now();
    setToasts((items) => [...items, { id, message }]);
    setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3000);
  };
  if (setup === null)
    return (
      <main className="setup-shell" aria-busy="true">
        <div className="setup-card">
          <div className="empty-state">
            <RefreshCw className="spin" />
            <h1>Opening Echo…</h1>
          </div>
        </div>
      </main>
    );
  if (!setup)
    return (
      <FirstRun
        adapter={adapter}
        onComplete={() => {
          setSetup(true);
          toast('Setup complete — welcome to Echo');
        }}
      />
    );
  if (loadError)
    return (
      <main className="setup-shell">
        <div className="setup-card">
          <div className="empty-state">
            <CircleHelp />
            <h1>Echo couldn’t open your information</h1>
            <p>{loadError}</p>
            <button className="button primary" onClick={() => void reload()}>
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  if (!snapshot)
    return (
      <main className="setup-shell" aria-busy="true">
        <div className="setup-card">
          <div className="empty-state">
            <RefreshCw className="spin" />
            <h1>Opening your local workspace…</h1>
            <p>Your information stays on this device.</p>
          </div>
        </div>
      </main>
    );

  const go = (next: Page) => {
    setPage(next);
    setSidebar(false);
    setQuery('');
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className={sidebar ? 'sidebar open' : 'sidebar'} aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark">
            <EchoMark />
          </span>
          <strong>echo</strong>
          <button
            className="icon-button close-nav"
            onClick={() => setSidebar(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>
        </div>
        <nav>
          {(Object.keys(navLabels) as Page[]).map((item) => {
            const Icon = navIcons[item];
            return (
              <button
                key={item}
                className={page === item ? 'nav-item active' : 'nav-item'}
                aria-current={page === item ? 'page' : undefined}
                onClick={() => go(item)}
              >
                <Icon size={18} />
                <span>{navLabels[item]}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className={online ? 'status-pill online' : 'status-pill offline'}>
            {online ? (
              <>
                <span className="pulse" /> Ready
              </>
            ) : (
              <>
                <WifiOff size={14} /> Offline mode
              </>
            )}
          </div>
          <button className="account-card" onClick={() => go('settings')}>
            <span className="avatar">JD</span>
            <span>
              <strong>Jane</strong>
              <small>Local workspace</small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      {sidebar && (
        <button className="scrim" onClick={() => setSidebar(false)} aria-label="Close navigation" />
      )}
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setSidebar(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <div className="global-search">
            <Search size={17} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search everything"
              placeholder="Search everything…"
            />
            <kbd>⌘ K</kbd>
          </div>
          <button className="icon-button" aria-label="Notifications">
            <Bell />
            <span className="notification-dot" />
          </button>
          <ThemeButton theme={theme} setTheme={setTheme} />
        </header>
        <main id="main-content" tabIndex={-1}>
          {!online && (
            <div className="offline-banner" role="status">
              <CloudOff size={17} />
              <span>
                You’re offline. Your local information is available; new AI replies will wait for a
                connection.
              </span>
            </div>
          )}
          {query ? (
            <SearchResults query={query} go={go} snapshot={snapshot} />
          ) : (
            <PageContent
              page={page}
              online={online}
              toast={toast}
              dialog={setDialog}
              snapshot={snapshot}
              adapter={adapter}
              reload={reload}
            />
          )}
        </main>
      </div>
      <div className="toast-region" aria-live="polite">
        {toasts.map((item) => (
          <div className="toast" key={item.id}>
            <Check size={17} />
            {item.message}
          </div>
        ))}
      </div>
      {dialog && <ConfirmDialog dialog={dialog} close={() => setDialog(null)} />}
    </div>
  );
}

function ThemeButton({ theme, setTheme }: { theme: Theme; setTheme: (theme: Theme) => void }) {
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Laptop;
  return (
    <button
      className="icon-button"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${theme}. Switch to ${next}`}
      title={`Theme: ${theme}`}
    >
      <Icon />
    </button>
  );
}

function PageContent({
  page,
  online,
  toast,
  dialog,
  snapshot,
  adapter,
  reload,
}: {
  page: Page;
  online: boolean;
  toast: (s: string) => void;
  dialog: (d: Dialog) => void;
  snapshot: ApplicationSnapshot;
  adapter: ApplicationAdapter;
  reload: () => Promise<void>;
}) {
  switch (page) {
    case 'chat':
      return (
        <Chat online={online} toast={toast} adapter={adapter} reload={reload} snapshot={snapshot} />
      );
    case 'conversations':
      return <Conversations toast={toast} dialog={dialog} records={snapshot.conversations} />;
    case 'profile':
      return <Profile toast={toast} dialog={dialog} records={snapshot.memories} />;
    case 'memories':
      return (
        <Memories
          toast={toast}
          dialog={dialog}
          records={snapshot.memories}
          adapter={adapter}
          reload={reload}
        />
      );
    case 'projects':
      return <Projects toast={toast} records={snapshot.projects} />;
    case 'skills':
      return (
        <SkillsLegacy
          toast={toast}
          dialog={dialog}
          records={snapshot.skills}
          adapter={adapter}
          reload={reload}
        />
      );
    case 'schedules':
      return (
        <Schedules
          toast={toast}
          dialog={dialog}
          records={snapshot.schedules}
          adapter={adapter}
          reload={reload}
        />
      );
    case 'tools':
      return <Tools toast={toast} />;
    case 'audit':
      return <Audit records={snapshot.audit} />;
    case 'settings':
      return (
        <SettingsPage
          toast={toast}
          settings={snapshot.settings}
          adapter={adapter}
          reload={reload}
        />
      );
    case 'backup':
      return <Backup toast={toast} dialog={dialog} adapter={adapter} />;
  }
}

function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </div>
  );
}

function Chat({
  online,
  toast,
  adapter,
  reload,
  snapshot,
}: {
  online: boolean;
  toast: (s: string) => void;
  adapter: ApplicationAdapter;
  reload: () => Promise<void>;
  snapshot: ApplicationSnapshot;
}) {
  const [messages, setMessages] = useState<
    Array<{ who: string; text: string; memory: string; provenance: string[] }>
  >([
    {
      who: 'luma',
      text: 'What would you like to work on?',
      memory: '',
      provenance: [],
    },
  ]);
  const [draft, setDraft] = useState(() => sessionStorage.getItem('luma.draft') || '');
  const [thinking, setThinking] = useState(false);
  const [sources, setSources] = useState<string[]>([]);
  useEffect(() => {
    sessionStorage.setItem('luma.draft', draft);
  }, [draft]);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMessages((m) => [...m, { who: 'you', text, memory: '', provenance: [] }]);
    setDraft('');
    if (!online) {
      toast('Message kept as a draft until you’re online');
      return;
    }
    setThinking(true);
    try {
      const result = await adapter.chat(text, 'Thank-you Card Studio');
      setMessages((m) => [
        ...m,
        {
          who: 'luma',
          text: result.reply,
          memory: result.provenance.length
            ? `Used ${result.provenance.length} local source${result.provenance.length === 1 ? '' : 's'}.`
            : '',
          provenance: result.provenance,
        },
      ]);
      await reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Echo could not complete that message');
    } finally {
      setThinking(false);
    }
  };
  return (
    <div className="chat-page">
      <div className="chat-heading">
        <div>
          <p className="eyebrow">New conversation</p>
          <h1>What can I help with?</h1>
        </div>
        <button className="button secondary">
          <FolderKanban size={17} /> Thank-you Card Studio <ChevronDown size={15} />
        </button>
      </div>
      <div className="messages" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`message-row ${m.who}`}>
            <div className="message-avatar">{m.who === 'luma' ? <EchoMark /> : 'JD'}</div>
            <div className="bubble">
              <strong>{m.who === 'luma' ? 'Echo' : 'You'}</strong>
              <p>{m.text}</p>
              {m.memory && (
                <button className="memory-note" onClick={() => setSources(m.provenance)}>
                  <Brain size={14} />
                  {m.memory}
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="message-row luma">
            <div className="message-avatar">
              <EchoMark />
            </div>
            <div className="bubble thinking" aria-label="Echo is thinking">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
      </div>
      {sources.length > 0 && (
        <aside className="source-details" aria-label="Sources used">
          <div className="section-title">
            <h2>Sources used</h2>
            <button
              className="icon-button"
              aria-label="Close sources"
              onClick={() => setSources([])}
            >
              <X />
            </button>
          </div>
          {sources.map((id) => {
            const memory = snapshot.memories.find((item) => item.id === id);
            const conversation = snapshot.conversations.find((item) => item.id === id);
            return (
              <article key={id}>
                <strong>{memory?.title || conversation?.title || 'Local source'}</strong>
                <p>{memory?.content || conversation?.summary || id}</p>
                <small>
                  {memory
                    ? `${memory.source} · learned ${memory.learned} · ${memory.confidence}% confidence`
                    : conversation
                      ? `Conversation · ${conversation.when}`
                      : 'Stored locally'}
                </small>
              </article>
            );
          })}
        </aside>
      )}
      <form className="composer" onSubmit={send}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message Echo…"
          aria-label="Message Echo"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="composer-bottom">
          <span>
            <LockKeyhole size={14} /> Private and stored locally
          </span>
          <button className="send-button" disabled={!draft.trim()} aria-label="Send message">
            <Sparkles size={18} />
          </button>
        </div>
      </form>
      <div className="suggestions">
        <button onClick={() => setDraft('What did we decide about the eBay thank-you cards?')}>
          Recall a decision
        </button>
        <button onClick={() => setDraft('Help me plan my day in short steps')}>Plan my day</button>
        <button onClick={() => setDraft('Draft a warm, concise customer reply')}>
          Draft a reply
        </button>
      </div>
    </div>
  );
}

function Conversations({
  toast,
  dialog,
  records,
}: {
  toast: (s: string) => void;
  dialog: (d: Dialog) => void;
  records: ApplicationSnapshot['conversations'];
}) {
  const [filter, setFilter] = useState('');
  const rows = records.filter((c) =>
    `${c.title} ${c.summary}`.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <section>
      <PageHeader
        title="Conversations"
        description="Everything you and Echo have worked through, kept locally on this device."
        actions={
          <button className="button primary">
            <Plus /> New conversation
          </button>
        }
      />
      <div className="toolbar">
        <label className="field-search">
          <Search />
          <input
            aria-label="Search conversations"
            placeholder="Search conversations"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <button className="button secondary">
          <Archive /> Archived
        </button>
      </div>
      <div className="list-card">
        {rows.length ? (
          rows.map((c) => (
            <article className="conversation-row" key={c.id}>
              <span className="item-icon">
                <MessageCircle />
              </span>
              <div>
                <h3>{c.title}</h3>
                <p>{c.summary}</p>
                <div className="meta">
                  <span>{c.when}</span>
                  <span>{c.project}</span>
                  <span>{c.cost}</span>
                </div>
              </div>
              <div className="row-actions">
                <button
                  className="icon-button"
                  aria-label={`Archive ${c.title}`}
                  onClick={() => toast('Conversation archived')}
                >
                  <Archive />
                </button>
                <button
                  className="icon-button danger-icon"
                  aria-label={`Delete ${c.title}`}
                  onClick={() =>
                    dialog({
                      title: 'Delete this conversation?',
                      body: 'This removes the conversation and its messages. Memories already approved remain separate.',
                      confirm: 'Delete conversation',
                      danger: true,
                      onConfirm: () => toast('Conversation deleted'),
                    })
                  }
                >
                  <Trash2 />
                </button>
              </div>
            </article>
          ))
        ) : (
          <Empty
            icon={<MessagesSquare />}
            title="No conversations found"
            text="Try a different search phrase."
          />
        )}
      </div>
    </section>
  );
}

function Profile({
  toast,
  dialog,
  records,
}: {
  toast: (s: string) => void;
  dialog: (d: Dialog) => void;
  records: Memory[];
}) {
  const profile = records.filter((m) => m.type === 'Profile');
  return (
    <section>
      <PageHeader
        eyebrow="Built with your permission"
        title="Your profile"
        description="The things Echo understands about you. Every item shows where it came from and stays under your control."
        actions={
          <button className="button secondary" onClick={() => toast('USER.md exported')}>
            <Download /> Export USER.md
          </button>
        }
      />
      <div className="summary-grid">
        <Stat label="Confirmed details" value="8" note="Last reviewed today" />
        <Stat label="Needs your review" value="2" note="Uncertain or outdated" accent />
        <Stat label="Sensitive details" value="0" note="None saved" />
      </div>
      <div className="section-title">
        <h2>Communication preferences</h2>
        <button className="button text">
          <Plus /> Add detail
        </button>
      </div>
      <div className="cards-grid">
        {profile.map((m) => (
          <MemoryCard key={m.id} item={m} toast={toast} dialog={dialog} profile />
        ))}
      </div>
      <div className="review-panel">
        <span className="item-icon amber">
          <CircleHelp />
        </span>
        <div>
          <h3>One detail may need your review</h3>
          <p>
            “Usually works on shop orders in the morning” was inferred and has not been confirmed.
          </p>
        </div>
        <button className="button primary" onClick={() => toast('Profile detail confirmed')}>
          Review now
        </button>
      </div>
    </section>
  );
}

function Memories({
  toast,
  dialog,
  records,
  adapter,
  reload,
}: {
  toast: (s: string) => void;
  dialog: (d: Dialog) => void;
  records: Memory[];
  adapter: ApplicationAdapter;
  reload: () => Promise<void>;
}) {
  const resolve = (id: string, resolution: 'newer' | 'older') =>
    void adapter
      .resolveContradiction(id, resolution)
      .then(reload)
      .then(() => toast('Contradiction resolved'));
  const forget = (item: Memory) =>
    dialog({
      title: `Forget “${item.title}”?`,
      body: 'Echo will stop using this memory.',
      confirm: 'Forget it',
      danger: true,
      onConfirm: () =>
        void adapter
          .forget(item.id)
          .then(reload)
          .then(() => toast('Memory forgotten')),
    });
  return (
    <section>
      <PageHeader title="Memories" description="Inspectable local memories and their sources." />
      {records.length ? (
        <div className="cards-grid">
          {records.map((item) => (
            <article className="memory-card" key={item.id}>
              <span className={`badge ${item.status.toLowerCase()}`}>{item.status}</span>
              <h3>{item.title}</h3>
              <p>{item.content}</p>
              <dl>
                <div>
                  <dt>Source</dt>
                  <dd>{item.source}</dd>
                </div>
                <div>
                  <dt>Confidence</dt>
                  <dd>{item.confidence}%</dd>
                </div>
              </dl>
              <div className="card-actions">
                {item.status === 'Contradiction' && (
                  <>
                    <button
                      className="button small primary"
                      onClick={() => resolve(item.id, 'newer')}
                    >
                      Keep newer
                    </button>
                    <button
                      className="button small secondary"
                      onClick={() => resolve(item.id, 'older')}
                    >
                      Keep older
                    </button>
                  </>
                )}
                <button
                  className="button small secondary"
                  onClick={() => toast(`Source: ${item.source}`)}
                >
                  <Eye /> Inspect source
                </button>
                <button className="button small text danger" onClick={() => forget(item)}>
                  <Trash2 /> Forget
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={<Brain />}
          title="No memories yet"
          text="Explicitly remembered details will appear here."
        />
      )}
    </section>
  );
}

function MemoryCard({
  item,
  toast,
  dialog,
  profile,
  onDelete,
}: {
  item: Memory;
  toast: (s: string) => void;
  dialog: (d: Dialog) => void;
  profile?: boolean;
  onDelete?: () => void;
}) {
  return (
    <article className="memory-card">
      <div className="card-top">
        <span className={`badge ${item.status.toLowerCase()}`}>{item.status}</span>
        <button className="icon-button" aria-label={`More options for ${item.title}`}>
          <MoreHorizontal />
        </button>
      </div>
      <h3>{item.title}</h3>
      <p className="memory-content">{item.content}</p>
      <dl>
        <div>
          <dt>Confidence</dt>
          <dd>{item.confidence}%</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{item.source}</dd>
        </div>
        <div>
          <dt>Learned</dt>
          <dd>{item.learned}</dd>
        </div>
        <div>
          <dt>Sensitivity</dt>
          <dd>{item.sensitivity}</dd>
        </div>
        {item.expires && (
          <div>
            <dt>Expires</dt>
            <dd>{item.expires}</dd>
          </div>
        )}
      </dl>
      <div className="card-actions">
        {item.status === 'Proposed' && (
          <button className="button small primary" onClick={() => toast('Memory confirmed')}>
            <Check /> Confirm
          </button>
        )}
        <button className="button small secondary" onClick={() => toast('Memory editor opened')}>
          <Pencil /> Edit
        </button>
        <button
          className="button small text danger"
          onClick={
            onDelete ||
            (() =>
              dialog({
                title: 'Delete this profile detail?',
                body: 'Echo will stop using this detail in future answers.',
                confirm: 'Delete',
                danger: true,
                onConfirm: () => toast('Profile detail deleted'),
              }))
          }
        >
          <Trash2 /> {profile ? 'Delete' : 'Forget'}
        </button>
      </div>
    </article>
  );
}

function Projects({
  toast,
  records,
}: {
  toast: (s: string) => void;
  records: ApplicationSnapshot['projects'];
}) {
  return (
    <section>
      <PageHeader
        title="Projects"
        description="Keep conversations, memories, files, and reusable ways of working in the right context."
        actions={
          <button className="button primary" onClick={() => toast('New project form opened')}>
            <Plus /> New project
          </button>
        }
      />
      {records.length ? (
        <div className="project-grid">
          {records.map((p) => (
            <article className="project-card" key={p.name}>
              <div className="project-art">
                <FolderKanban />
                <span className={`badge ${p.status.toLowerCase()}`}>{p.status}</span>
              </div>
              <div className="project-body">
                <h2>{p.name}</h2>
                <p>{p.goal}</p>
                <div className="progress-label">
                  <span>Progress</span>
                  <strong>{p.progress}%</strong>
                </div>
                <div className="progress">
                  <span style={{ width: `${p.progress}%` }} />
                </div>
                <div className="project-meta">
                  <span>{p.notes} notes</span>
                  <span>{p.memories} memories</span>
                  <span>Updated {p.updated.toLowerCase()}</span>
                </div>
                <button className="button secondary full">
                  Open project <ChevronRight />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={<FolderKanban />}
          title="No projects yet"
          text="Create a project when you want conversations and memories to share a focused context."
        />
      )}
    </section>
  );
}

function SkillsLegacy({
  toast,
  dialog,
  records,
  adapter,
  reload,
}: {
  toast: (s: string) => void;
  dialog: (d: Dialog) => void;
  records: ApplicationSnapshot['skills'];
  adapter: ApplicationAdapter;
  reload: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<ApplicationSnapshot['skills'][number] | null>(null);
  const recordEdit = (skill: ApplicationSnapshot['skills'][number]) => {
    const before = prompt('Original reply')?.trim();
    const after = prompt('Your edited reply')?.trim();
    if (before && after)
      void adapter
        .recordSkillEdit(skill.name, before, after)
        .then(reload)
        .then(() => toast('Edit recorded as skill evidence'));
  };
  return (
    <section>
      <PageHeader
        title="Skills"
        description="Reusable ways of working that Echo can improve only with evidence and your approval."
        actions={
          <button className="button primary">
            <Plus /> Create skill
          </button>
        }
      />
      {records.some((s) => s.status === 'Proposed') && (
        <div className="notice">
          <Sparkles />
          <div>
            <strong>A skill improvement is ready to review</strong>
            <p>A proposed skill revision has evidence ready for inspection.</p>
          </div>
          <button
            className="button secondary"
            onClick={() => setSelected(records.find((s) => s.status === 'Proposed') || null)}
          >
            Review proposal
          </button>
        </div>
      )}
      {records.length ? (
        <div className="cards-grid">
          {records.map((skill) => (
            <article className="skill-card" key={skill.name}>
              <div className="card-top">
                <span className={`badge ${skill.status.toLowerCase()}`}>{skill.status}</span>
                <span className="version">v{skill.version}</span>
              </div>
              <h3>{skill.name}</h3>
              <p>{skill.description}</p>
              <div className="skill-scope">
                <FolderKanban />
                {skill.scope}
              </div>
              <div className="success">
                <span>
                  <strong>{skill.success}%</strong> successful
                </span>
                <span>Measured runs</span>
              </div>
              <div className="card-actions">
                <button className="button small secondary" onClick={() => setSelected(skill)}>
                  <History /> Version history
                </button>
                <button className="button small text" onClick={() => recordEdit(skill)}>
                  Record an edit
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={<WandSparkles />}
          title="No skills yet"
          text="Skills can be created manually or proposed after repeated successful work."
        />
      )}
      {selected && (
        <div className="drawer-scrim" onClick={() => setSelected(null)}>
          <aside
            className="drawer"
            onClick={(e) => e.stopPropagation()}
            aria-label="Skill version history"
          >
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Version history</p>
                <h2>{selected.name}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setSelected(null)}
                aria-label="Close version history"
              >
                <X />
              </button>
            </div>
            <div className="version-list">
              {selected.evidence?.length ? (
                <article className="version-entry">
                  <span>Evidence</span>
                  <h3>Repeated edits</h3>
                  <ul>
                    {selected.evidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ) : null}
              {selected.evaluation ? (
                <article className="version-entry">
                  <span>Evaluation</span>
                  <h3>{selected.evaluation.sampleSize} saved scenarios</h3>
                  <p>
                    Proposed {selected.evaluation.successRate}% · current{' '}
                    {selected.evaluation.baselineSuccessRate}%
                  </p>
                </article>
              ) : null}
              <article className="version-entry current">
                <span>Current</span>
                <h3>Version {selected.version}</h3>
                <p>{selected.description}</p>
                <small>Success rate {selected.success}%</small>
              </article>
              {(selected.versions || []).map((version) => (
                <article className="version-entry" key={version.id}>
                  <span>Previous</span>
                  <h3>Version {version.version}</h3>
                  <p>{version.description}</p>
                  <small>Success rate {version.success}%</small>
                  <button
                    className="button secondary full"
                    onClick={() =>
                      dialog({
                        title: 'Restore this skill version?',
                        body: 'The current version will remain in history, so you can switch back later.',
                        confirm: 'Restore version',
                        onConfirm: () => {
                          void adapter
                            .rollbackSkill(selected.name, version.version)
                            .then(reload)
                            .then(() => {
                              toast('Previous skill version restored');
                              setSelected(null);
                            });
                        },
                      })
                    }
                  >
                    <RotateCcw /> Restore this version
                  </button>
                </article>
              ))}
              {selected.status === 'Proposed' && (
                <article className="version-entry">
                  <span>Your decision</span>
                  <p>The proposal is not active until you approve it.</p>
                  <div className="card-actions">
                    <button
                      className="button primary"
                      onClick={() =>
                        void adapter
                          .reviewSkillProposal(selected.name, 'approve')
                          .then(reload)
                          .then(() => {
                            toast('Skill proposal approved');
                            setSelected(null);
                          })
                      }
                    >
                      Approve proposal
                    </button>
                    <button
                      className="button secondary"
                      onClick={() =>
                        void adapter
                          .reviewSkillProposal(selected.name, 'reject')
                          .then(reload)
                          .then(() => {
                            toast('Skill proposal rejected');
                            setSelected(null);
                          })
                      }
                    >
                      Reject proposal
                    </button>
                  </div>
                </article>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

function Schedules({
  toast,
  dialog,
  records,
  adapter,
  reload,
}: {
  toast: (s: string) => void;
  dialog: (d: Dialog) => void;
  records: ApplicationSnapshot['schedules'];
  adapter: ApplicationAdapter;
  reload: () => Promise<void>;
}) {
  return (
    <section>
      <PageHeader
        title="Scheduled tasks"
        description="Reminders and recurring work that run while Echo is available."
        actions={
          <button className="button primary">
            <Plus /> New task
          </button>
        }
      />
      <div className="info-strip">
        <Clock3 />
        <span>
          Times are shown in your selected time zone. Missed tasks follow your configured policy.
        </span>
      </div>
      {records.length ? (
        <div className="list-card">
          {records.map((task) => (
            <article className="schedule-row" key={task.id}>
              <button
                className={`switch ${task.enabled ? 'on' : ''}`}
                role="switch"
                aria-checked={task.enabled}
                aria-label={`${task.enabled ? 'Disable' : 'Enable'} ${task.title}`}
                onClick={() =>
                  void adapter
                    .setScheduleEnabled(task.id, !task.enabled)
                    .then(reload)
                    .then(() => toast('Scheduled task updated'))
                }
              >
                <span />
              </button>
              <span className="item-icon">
                <CalendarClock />
              </span>
              <div>
                <h3>{task.title}</h3>
                <p>{task.schedule}</p>
                <div className="meta">
                  <span>Next: {task.next}</span>
                  <span>{task.project}</span>
                </div>
              </div>
              <button
                className="button small secondary"
                onClick={() => toast('Scheduled task editor opened')}
              >
                Edit
              </button>
              <button
                className="icon-button danger-icon"
                aria-label={`Delete ${task.title}`}
                onClick={() =>
                  dialog({
                    title: 'Delete this scheduled task?',
                    body: 'It will no longer run or notify you.',
                    confirm: 'Delete task',
                    danger: true,
                    onConfirm: () => toast('Scheduled task deleted'),
                  })
                }
              >
                <Trash2 />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={<CalendarClock />}
          title="No scheduled tasks"
          text="Create a one-time reminder or recurring task when you need one."
        />
      )}
    </section>
  );
}

function Tools({ toast }: { toast: (s: string) => void }) {
  const toolRows = [
    {
      name: 'Local notes',
      detail: 'Read and organize notes you create in Echo',
      risk: 'Low',
      value: 'Always allow',
    },
    {
      name: 'Read a chosen file',
      detail: 'Read only a file you select',
      risk: 'Low',
      value: 'Ask every time',
    },
    {
      name: 'Write a local file',
      detail: 'Create or change a file after you approve',
      risk: 'Medium',
      value: 'Ask every time',
    },
    {
      name: 'Open a web address',
      detail: 'Open a link in your browser',
      risk: 'Medium',
      value: 'Ask every time',
    },
    {
      name: 'Clipboard',
      detail: 'Read only after an explicit action',
      risk: 'Medium',
      value: 'Always deny',
    },
    {
      name: 'Calculator',
      detail: 'Perform calculations locally',
      risk: 'Low',
      value: 'Always allow',
    },
  ];
  return (
    <section>
      <PageHeader
        title="Tools & permissions"
        description="Choose exactly what Echo may do. Changes take effect immediately."
      />
      <div className="safety-card">
        <ShieldCheck />
        <div>
          <h3>You stay in control</h3>
          <p>
            Echo never runs shell commands. Actions that change files or leave the app require your
            permission.
          </p>
        </div>
      </div>
      <div className="list-card">
        {toolRows.map((tool) => (
          <article className="tool-row" key={tool.name}>
            <span className="item-icon">
              <Wrench />
            </span>
            <div>
              <h3>{tool.name}</h3>
              <p>{tool.detail}</p>
            </div>
            <span className={`risk ${tool.risk.toLowerCase()}`}>{tool.risk} risk</span>
            <select
              aria-label={`Permission for ${tool.name}`}
              defaultValue={tool.value}
              onChange={() => toast(`${tool.name} permission updated`)}
            >
              <option>Ask every time</option>
              <option>Allow this session</option>
              <option>Always allow</option>
              <option>Always deny</option>
            </select>
          </article>
        ))}
      </div>
      <div className="section-title">
        <h2>Project exceptions</h2>
        <button className="button text">
          <Plus /> Add exception
        </button>
      </div>
      <Empty
        icon={<LockKeyhole />}
        title="No project exceptions"
        text="All projects currently use the permissions above."
      />
    </section>
  );
}

function Audit({ records }: { records: ApplicationSnapshot['audit'] }) {
  const [kind, setKind] = useState('Everything');
  const events = records.map((record) => ({
    ...record,
    icon:
      record.type === 'Memory'
        ? Brain
        : record.type === 'Skill'
          ? WandSparkles
          : record.type === 'Backup'
            ? RefreshCw
            : Activity,
  }));
  const visible = kind === 'Everything' ? events : events.filter((e) => e.type === kind);
  return (
    <section>
      <PageHeader
        title="Activity"
        description="A plain-language record of what Echo changed, used, or requested."
        actions={
          <button className="button secondary">
            <Download /> Export activity
          </button>
        }
      />
      <div className="toolbar">
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter activity">
          <option>Everything</option>
          <option>Memory</option>
          <option>Conversation</option>
          <option>Skill</option>
          <option>Settings</option>
          <option>Backup</option>
        </select>
        <label className="date-field">
          Since <input type="date" defaultValue="2026-07-01" />
        </label>
      </div>
      {visible.length ? (
        <div className="timeline">
          {visible.map((event, i) => {
            const Icon = event.icon;
            return (
              <article className="timeline-row" key={event.id || i}>
                <span className="timeline-icon">
                  <Icon />
                </span>
                <div>
                  <h3>{event.title}</h3>
                  <p>{event.detail}</p>
                  <div className="meta">
                    <span>{event.when}</span>
                    <span>{event.type}</span>
                    <span>{event.model}</span>
                  </div>
                </div>
                <button className="button small text">
                  <Eye /> Details
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          icon={<Activity />}
          title="No activity yet"
          text="Actions will appear here as you use Echo."
        />
      )}
    </section>
  );
}

function SettingsPage({
  toast,
  settings,
  adapter,
  reload,
}: {
  toast: (s: string) => void;
  settings: ApplicationSnapshot['settings'];
  adapter: ApplicationAdapter;
  reload: () => Promise<void>;
}) {
  const [memoryMode, setMemoryMode] = useState<MemoryMode>(settings.memoryMode);
  const [budget, setBudget] = useState(String(settings.monthlyBudget));
  const [assistantName, setAssistantName] = useState(settings.assistantName);
  return (
    <section>
      <PageHeader title="Settings" description="Personalize Echo, models, privacy, and spending." />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <button className="active">General</button>
          <button>AI models</button>
          <button>Memory & privacy</button>
          <button>Costs</button>
          <button>Advanced</button>
        </nav>
        <div className="settings-content">
          <SettingsGroup title="Assistant">
            <label className="form-field">
              <span>Assistant name</span>
              <input
                value={assistantName}
                onChange={(event) => setAssistantName(event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>Language</span>
              <select defaultValue="English (US)">
                <option>English (US)</option>
                <option>English (UK)</option>
              </select>
            </label>
          </SettingsGroup>
          <SettingsGroup title="Memory behavior">
            <div className="radio-stack">
              {(
                [
                  {
                    id: 'ask',
                    title: 'Ask before saving everything',
                    text: 'You approve each new memory.',
                  },
                  {
                    id: 'low-risk',
                    title: 'Automatically save low-risk information',
                    text: 'Sensitive or uncertain details still require approval.',
                  },
                  {
                    id: 'explicit',
                    title: 'Save only when I explicitly ask',
                    text: 'Nothing is remembered automatically.',
                  },
                ] as const
              ).map((m) => (
                <label key={m.id}>
                  <input
                    type="radio"
                    name="memory"
                    checked={memoryMode === m.id}
                    onChange={() => setMemoryMode(m.id)}
                  />
                  <span>
                    <strong>{m.title}</strong>
                    <small>{m.text}</small>
                  </span>
                </label>
              ))}
            </div>
          </SettingsGroup>
          <SettingsGroup title="Models">
            <label className="form-field">
              <span>Default routing</span>
              <select defaultValue="Automatic (recommended)">
                <option>Automatic (recommended)</option>
                <option>Always standard</option>
                <option>Always powerful</option>
              </select>
            </label>
            <div className="model-grid">
              <label>
                Reasoning model
                <input defaultValue="gpt-5.4" />
              </label>
              <label>
                Conversation model
                <input defaultValue="gpt-5.4-mini" />
              </label>
              <label>
                Fast processing
                <input defaultValue="gpt-5.4-nano" />
              </label>
              <label>
                Embeddings
                <input defaultValue="text-embedding-3-small" />
              </label>
            </div>
          </SettingsGroup>
          <SettingsGroup title="Costs">
            <div className="usage-head">
              <div>
                <strong>$7.82</strong>
                <span>of ${budget} this month</span>
              </div>
              <span>31%</span>
            </div>
            <div className="progress">
              <span style={{ width: '31%' }} />
            </div>
            <label className="form-field inline">
              <span>Monthly budget</span>
              <span className="money-input">
                $
                <input
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  inputMode="decimal"
                />
              </span>
            </label>
            <label className="check-row">
              <input type="checkbox" defaultChecked /> Pause background processing when the budget
              is reached
            </label>
          </SettingsGroup>
          <SettingsGroup title="About">
            <p>Echo version 0.1.0</p>
          </SettingsGroup>
          <button
            className="button primary"
            onClick={() =>
              void adapter
                .saveSettings({
                  ...settings,
                  assistantName,
                  memoryMode,
                  monthlyBudget: Number(budget),
                })
                .then(reload)
                .then(() => toast('Settings saved'))
            }
          >
            Save settings
          </button>
        </div>
      </div>
    </section>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Backup({
  toast,
  adapter,
}: {
  toast: (s: string) => void;
  dialog: (d: Dialog) => void;
  adapter: ApplicationAdapter;
}) {
  const MIN_LENGTH = 12;
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [createError, setCreateError] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [pendingRestoreFile, setPendingRestoreFile] = useState<File | null>(null);
  const [pairingToken, setPairingToken] = useState('');
  const [copied, setCopied] = useState(false);
  const failed = (error: unknown) =>
    toast(error instanceof Error ? error.message : 'Operation failed');

  const createBackup = () => {
    if (password.length < MIN_LENGTH) {
      setCreateError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setCreateError('Passwords do not match.');
      return;
    }
    setCreateError('');
    void adapter
      .createBackup(password)
      .then((result) => {
        toast(`Encrypted backup created · ${result.bytes} bytes`);
        setPassword('');
        setConfirmPassword('');
      })
      .catch(failed);
  };

  const chooseFile = (file?: File) => {
    if (!file) return;
    setPendingRestoreFile(file);
    setRestorePassword('');
    setRestoreError('');
  };

  const restore = () => {
    if (!pendingRestoreFile) return;
    if (restorePassword.length < MIN_LENGTH) {
      setRestoreError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    setRestoreError('');
    const reader = new FileReader();
    reader.onerror = () => failed(reader.error);
    reader.onload = () =>
      void adapter
        .restoreBackup(String(reader.result), restorePassword)
        .then(() => {
          toast('Backup restored after validation');
          setPendingRestoreFile(null);
          setRestorePassword('');
        })
        .catch(failed);
    reader.readAsDataURL(pendingRestoreFile);
  };

  const copyToken = () => {
    void navigator.clipboard?.writeText(pairingToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section>
      <PageHeader
        title="Backup & restore"
        description="Authenticated, portable backups of the local SQLite database."
      />
      <div className="backup-hero">
        <span className="backup-shield">
          <ShieldCheck />
        </span>
        <div>
          <h2>Encrypted backups</h2>
          <label className="form-field">
            <span>Backup password</span>
            <input
              type="password"
              minLength={MIN_LENGTH}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setCreateError('');
              }}
              aria-describedby="backup-password-error"
            />
          </label>
          <label className="form-field">
            <span>Confirm password</span>
            <input
              type="password"
              minLength={MIN_LENGTH}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setCreateError('');
              }}
              aria-describedby="backup-password-error"
            />
          </label>
          {createError && (
            <span className="field-error" id="backup-password-error" role="alert">
              {createError}
            </span>
          )}
        </div>
        <button className="button primary" onClick={createBackup}>
          <Download /> Back up now
        </button>
      </div>
      <div className="backup-grid">
        <article className="action-card">
          <Upload />
          <h3>Restore</h3>
          <p>Restore is staged and integrity checked before commit.</p>
          <label className="button secondary full">
            Choose backup
            <input
              hidden
              type="file"
              accept=".luma-backup"
              onChange={(e) => chooseFile(e.target.files?.[0])}
            />
          </label>
          {pendingRestoreFile && (
            <>
              <label className="form-field">
                <span>Backup password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={restorePassword}
                  onChange={(e) => {
                    setRestorePassword(e.target.value);
                    setRestoreError('');
                  }}
                  aria-describedby="restore-password-error"
                  autoFocus
                />
              </label>
              {restoreError && (
                <span className="field-error" id="restore-password-error" role="alert">
                  {restoreError}
                </span>
              )}
              <button className="button primary full" onClick={restore}>
                Restore {pendingRestoreFile.name}
              </button>
            </>
          )}
        </article>
        <article className="action-card">
          <KeyRound />
          <h3>Firefox pairing</h3>
          <p>Issue a token, then paste it into the Firefox extension’s pairing field.</p>
          <button
            className="button secondary full"
            onClick={() => void adapter.issuePairing().then(setPairingToken).catch(failed)}
          >
            Issue new token
          </button>
          {pairingToken && (
            <>
              <code>{pairingToken}</code>
              <small>Store this in the Firefox extension now — it will not be shown again.</small>
              <button className="button secondary full" onClick={copyToken}>
                {copied ? <Check /> : null} {copied ? 'Copied' : 'Copy token'}
              </button>
            </>
          )}
          <button
            className="button text full"
            onClick={() =>
              void adapter
                .revokePairing()
                .then(() => {
                  setPairingToken('');
                  toast('Pairing revoked');
                })
                .catch(failed)
            }
          >
            Revoke pairing
          </button>
        </article>
      </div>
    </section>
  );
}

function generateRecoveryKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ponytail: excludes ambiguous chars, no library needed
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `ECHO-${chars.match(/.{1,4}/g)!.join('-')}`;
}

function FirstRun({
  adapter,
  onComplete,
}: {
  adapter: ApplicationAdapter;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('Echo');
  const [key, setKey] = useState('');
  const [recoveryKey] = useState(generateRecoveryKey);
  const [mode, setMode] = useState<MemoryMode>('low-risk');
  const [sensitive, setSensitive] = useState(false);
  const [model, setModel] = useState('Automatic (recommended)');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [existingKey, setExistingKey] = useState(false);
  const [reuseExistingKey, setReuseExistingKey] = useState(false);
  useEffect(() => {
    void credentialStatus().then(setExistingKey, () => setExistingKey(false));
  }, []);
  const next = async () => {
    if (step === 1) {
      if (!reuseExistingKey && (!key.startsWith('sk-') || key.length < 12)) {
        setError('That key does not look complete.');
        return;
      }
      setError('');
    }
    if (step === 4) {
      setChecking(true);
      setError('');
      try {
        if (!reuseExistingKey) await storeApiKey(key);
        await adapter.saveSettings({
          assistantName: name.trim() || 'Echo',
          memoryMode: mode,
          monthlyBudget: 25,
          offline: false,
        });
        await completeOnboarding();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'We could not validate that key.');
        setChecking(false);
        setStep(1);
        return;
      }
      setChecking(false);
    }
    if (step < 4) setStep(step + 1);
    else onComplete();
  };
  const labels = ['Welcome', 'Connect', 'Memory', 'Recovery', 'Check'];
  return (
    <main className="setup-shell">
      <div className="setup-card">
        <div className="setup-brand">
          <span className="brand-mark">
            <EchoMark />
          </span>
          <strong>{name || 'Echo'}</strong>
        </div>
        <ol className="setup-progress" aria-label="Setup progress">
          {labels.map((label, i) => (
            <li key={label} className={i < step ? 'done' : i === step ? 'current' : ''}>
              <span>{i < step ? <Check /> : i + 1}</span>
              <small>{label}</small>
            </li>
          ))}
        </ol>
        <div className="setup-content">
          {step === 0 && (
            <>
              <span className="hero-icon">
                <Sparkles />
              </span>
              <p className="eyebrow">Your private personal assistant</p>
              <h1>Meet an assistant that remembers on your terms.</h1>
              <p className="lead">
                Your conversations and memories stay on this device by default. You can inspect,
                change, export, or forget anything at any time.
              </p>
              <div className="promise-grid">
                <div>
                  <LockKeyhole />
                  <strong>Stored locally</strong>
                  <span>Your information lives on this device.</span>
                </div>
                <div>
                  <Eye />
                  <strong>Fully inspectable</strong>
                  <span>See what is remembered and why.</span>
                </div>
                <div>
                  <ShieldCheck />
                  <strong>You decide</strong>
                  <span>Sensitive details always need approval.</span>
                </div>
              </div>
              <label className="form-field setup-name">
                <span>What would you like to call your assistant?</span>
                <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </label>
            </>
          )}
          {step === 1 && (
            <>
              <span className="hero-icon">
                <KeyRound />
              </span>
              <p className="eyebrow">Connect securely</p>
              <h1>Add your OpenAI API key</h1>
              <p className="lead">
                The key unlocks AI replies. It is saved in your operating system’s secure credential
                store—not in Echo’s database, settings, or logs.
              </p>
              <label className="form-field">
                <span>OpenAI API key</span>
                <input
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="sk-…"
                  autoComplete="off"
                  autoFocus
                  aria-describedby="key-help key-error"
                />
                <small id="key-help">
                  In browser preview, this key is validated but never stored.
                </small>
                {error && (
                  <span className="field-error" id="key-error" role="alert">
                    {error}
                  </span>
                )}
              </label>
              {existingKey && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={reuseExistingKey}
                    onChange={(event) => setReuseExistingKey(event.target.checked)}
                  />
                  Use the OpenAI key already saved on this device
                </label>
              )}
              <a
                className="help-link"
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
              >
                Where do I find my API key? <ChevronRight />
              </a>
            </>
          )}
          {step === 2 && (
            <>
              <span className="hero-icon">
                <Brain />
              </span>
              <p className="eyebrow">Memory controls</p>
              <h1>Choose how {name} remembers</h1>
              <p className="lead">
                You can change this at any time. Sensitive and uncertain information receives extra
                protection.
              </p>
              <div className="choice-stack">
                {(
                  [
                    {
                      id: 'ask',
                      title: 'Ask before saving everything',
                      text: 'Review every proposed memory.',
                    },
                    {
                      id: 'low-risk',
                      title: 'Automatically save low-risk information',
                      text: 'Recommended. Sensitive or inferred details still need approval.',
                    },
                    {
                      id: 'explicit',
                      title: 'Save only when I explicitly ask',
                      text: 'Only “remember this” requests are saved.',
                    },
                  ] as const
                ).map((m) => (
                  <label className={mode === m.id ? 'choice selected' : 'choice'} key={m.id}>
                    <input type="radio" checked={mode === m.id} onChange={() => setMode(m.id)} />
                    <span>
                      <strong>{m.title}</strong>
                      <small>{m.text}</small>
                    </span>
                    {mode === m.id && <Check />}
                  </label>
                ))}
              </div>
              <label className="sensitive-choice">
                <input
                  type="checkbox"
                  checked={sensitive}
                  onChange={(e) => setSensitive(e.target.checked)}
                />
                <span>
                  <strong>Allow sensitive categories to be proposed</strong>
                  <small>
                    {name} must still ask before saving health, financial, relationship, or other
                    sensitive details.
                  </small>
                </span>
              </label>
              <label className="form-field">
                <span>Default model</span>
                <select value={model} onChange={(e) => setModel(e.target.value)}>
                  <option>Automatic (recommended)</option>
                  <option>Standard model</option>
                  <option>Powerful model</option>
                </select>
              </label>
            </>
          )}
          {step === 3 && (
            <>
              <span className="hero-icon">
                <LockKeyhole />
              </span>
              <p className="eyebrow">Protect your information</p>
              <h1>Create a backup recovery key</h1>
              <p className="lead">
                Encrypted backups can move safely between Windows and macOS. Keep this recovery key
                somewhere separate from this computer.
              </p>
              <div className="recovery-key">
                <code>{recoveryKey}</code>
                <button
                  className="button secondary"
                  onClick={() => navigator.clipboard?.writeText(recoveryKey)}
                >
                  <Download /> Copy
                </button>
              </div>
              <div className="warning-box">
                <ShieldCheck />
                <span>
                  <strong>Echo cannot recover this key for you.</strong> A printable recovery sheet
                  will be offered after setup.
                </span>
              </div>
              <label className="check-row">
                <input type="checkbox" required defaultChecked /> I saved my recovery key somewhere
                safe
              </label>
            </>
          )}
          {step === 4 && (
            <>
              <span className="hero-icon success-icon">
                <Check />
              </span>
              <p className="eyebrow">Ready to go</p>
              <h1>Everything looks good</h1>
              <p className="lead">
                {name} is ready. Your information is local, your key is protected, and you can
                change every choice later.
              </p>
              <div className="system-checks">
                <div>
                  <Check />
                  <span>
                    <strong>Secure credential storage</strong>
                    <small>Available</small>
                  </span>
                </div>
                <div>
                  <Check />
                  <span>
                    <strong>Local database</strong>
                    <small>Ready and encrypted backups enabled</small>
                  </span>
                </div>
                <div>
                  <Check />
                  <span>
                    <strong>AI connection</strong>
                    <small>{reuseExistingKey ? 'Existing key selected' : 'Key accepted'}</small>
                  </span>
                </div>
                <div>
                  <Check />
                  <span>
                    <strong>Memory behavior</strong>
                    <small>
                      {mode === 'low-risk'
                        ? 'Low-risk automatic'
                        : mode === 'ask'
                          ? 'Ask every time'
                          : 'Explicit only'}
                    </small>
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="setup-actions">
          {step > 0 ? (
            <button className="button text" onClick={() => setStep(step - 1)}>
              <ArrowLeft /> Back
            </button>
          ) : (
            <span />
          )}
          <button
            className="button primary large"
            onClick={next}
            disabled={(step === 1 && !key && !reuseExistingKey) || checking}
          >
            {checking ? (
              <>
                <RefreshCw className="spin" /> Checking securely…
              </>
            ) : step === 4 ? (
              <>
                Open {name} <Sparkles />
              </>
            ) : (
              <>
                Continue <ChevronRight />
              </>
            )}
          </button>
        </div>
      </div>
      <p className="setup-foot">
        <LockKeyhole /> Private by default · No information is sold or used for advertising
      </p>
    </main>
  );
}

function SearchResults({
  query,
  go,
  snapshot,
}: {
  query: string;
  go: (p: Page) => void;
  snapshot: ApplicationSnapshot;
}) {
  const q = query.toLowerCase();
  const results = [
    ...snapshot.conversations.map((x) => ({
      title: x.title,
      text: x.summary,
      page: 'conversations' as Page,
      type: 'Conversation',
    })),
    ...snapshot.memories.map((x) => ({
      title: x.title,
      text: x.content,
      page: 'memories' as Page,
      type: 'Memory',
    })),
    ...snapshot.projects.map((x) => ({
      title: x.name,
      text: x.goal,
      page: 'projects' as Page,
      type: 'Project',
    })),
    ...snapshot.skills.map((x) => ({
      title: x.name,
      text: x.description,
      page: 'skills' as Page,
      type: 'Skill',
    })),
  ].filter((x) => `${x.title} ${x.text}`.toLowerCase().includes(q));
  return (
    <section>
      <PageHeader
        eyebrow="Search"
        title={`Results for “${query}”`}
        description={`${results.length} matching items across your local information.`}
      />
      <div className="list-card">
        {results.length ? (
          results.map((r, i) => (
            <button className="search-result" key={`${r.type}-${i}`} onClick={() => go(r.page)}>
              <span className="badge">{r.type}</span>
              <div>
                <h3>{r.title}</h3>
                <p>{r.text}</p>
              </div>
              <ChevronRight />
            </button>
          ))
        ) : (
          <Empty
            icon={<Search />}
            title="Nothing found"
            text="Try a name, topic, or phrase from an earlier conversation."
          />
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <article className={accent ? 'stat accent' : 'stat'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
function Empty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function ConfirmDialog({ dialog, close }: { dialog: Dialog; close: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  return (
    <div className="modal-scrim" role="presentation" onMouseDown={close}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className={dialog.danger ? 'modal-icon danger' : 'modal-icon'}>
          {dialog.danger ? <Trash2 /> : <CircleHelp />}
        </span>
        <h2 id="dialog-title">{dialog.title}</h2>
        <p>{dialog.body}</p>
        <div>
          <button ref={first} className="button secondary" onClick={close}>
            Cancel
          </button>
          <button
            className={dialog.danger ? 'button danger-button' : 'button primary'}
            onClick={() => {
              dialog.onConfirm();
              close();
            }}
          >
            {dialog.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
