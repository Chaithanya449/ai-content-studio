import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowRight, Check, CheckCircle2, Copy, FileText, Loader2, RotateCcw, Sparkles } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000';

const EXAMPLES = [
  'What is RAG and when to use it instead of fine-tuning',
  'What is LangGraph and when should you use it',
  'Why small shops should accept UPI payments',
];

type Step = { who: string; event: 'assigned' | 'submitted' | 'sent_back' | 'accepted'; note: string };
type Result = { research_draft: string; final_article: string; social_post: string; steps?: Step[] };

const NAMES: Record<string, string> = {
  supervisor: 'Supervisor',
  researcher: 'Researcher',
  blog_manager: 'Blog manager',
  social_media_manager: 'Social media manager',
};

const NEXT_LABEL: Record<string, string> = { blog: 'the blog article', social: 'the tweet' };

function stepText(s: Step): string {
  if (s.event === 'assigned') return 'Supervisor sent the topic to the Researcher';
  if (s.event === 'submitted') return `${NAMES[s.who] ?? s.who} submitted work`;
  if (s.event === 'sent_back') return `Supervisor asked for changes: ${s.note}`;
  if (s.note === 'complete') return 'Supervisor accepted the tweet. Workflow complete';
  return `Supervisor accepted it and moved on to ${NEXT_LABEL[s.note] ?? s.note}`;
}

function StepIcon({ event }: { event: Step['event'] }) {
  if (event === 'sent_back') return <RotateCcw className="h-4 w-4 text-amber-600" />;
  if (event === 'accepted') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (event === 'submitted') return <FileText className="h-4 w-4 text-sky-600" />;
  return <ArrowRight className="h-4 w-4 text-slate-500" />;
}

function friendlyError(message: string): string {
  if (message === 'Failed to fetch') return 'Cannot reach the backend. Is the FastAPI server running?';
  if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED'))
    return 'The Gemini free-tier quota is used up. Try again later or switch the model.';
  return message;
}

// Simple styling for markdown (no extra plugin needed)
const markdownStyles: Components = {
  h1: ({ node, ...props }) => <h1 className="mb-3 text-2xl font-bold text-slate-900" {...props} />,
  h2: ({ node, ...props }) => <h2 className="mb-2 mt-6 text-xl font-semibold text-slate-900" {...props} />,
  h3: ({ node, ...props }) => <h3 className="mb-2 mt-4 text-lg font-semibold text-slate-900" {...props} />,
  p: ({ node, ...props }) => <p className="mb-3 leading-relaxed text-slate-700" {...props} />,
  ul: ({ node, ...props }) => <ul className="mb-3 list-disc space-y-1 pl-6 text-slate-700" {...props} />,
  ol: ({ node, ...props }) => <ol className="mb-3 list-decimal space-y-1 pl-6 text-slate-700" {...props} />,
  hr: ({ node, ...props }) => <hr className="my-5 border-slate-200" {...props} />,
  table: ({ node, ...props }) => (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: ({ node, ...props }) => <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold" {...props} />,
  td: ({ node, ...props }) => <td className="border border-slate-200 px-3 py-2 align-top" {...props} />,
};

function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownStyles}>
      {text}
    </ReactMarkdown>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked inside embedded previews. Ignore.
    }
  };

  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function Results({ data }: { data: Result }) {
  const steps = data.steps ?? [];
  const revisions = steps.filter((s) => s.event === 'sent_back').length;
  const tweetLength = data.social_post.length;

  return (
    <div className="space-y-5">
      {steps.length > 0 && (
        <Card
          title="Supervisor review log"
          action={
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                revisions > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {revisions > 0 ? `${revisions} revision${revisions > 1 ? 's' : ''} requested` : 'No revisions needed'}
            </span>
          }
        >
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li
                key={i}
                className={`flex items-start gap-3 rounded-lg px-3 py-2 text-sm ${
                  s.event === 'sent_back' ? 'bg-amber-50 text-amber-900' : 'text-slate-700'
                }`}
              >
                <span className="mt-0.5">
                  <StepIcon event={s.event} />
                </span>
                <span>{stepText(s)}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card title="Blog article" action={<CopyButton text={data.final_article} />}>
        <Markdown text={data.final_article} />
      </Card>

      <Card
        title="Tweet"
        action={
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium ${tweetLength > 280 ? 'text-red-600' : 'text-slate-500'}`}>
              {tweetLength}/280
            </span>
            <CopyButton text={data.social_post} />
          </div>
        }
      >
        <p className="whitespace-pre-wrap font-medium text-slate-800">{data.social_post}</p>
      </Card>

      <details className="rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">Research notes</summary>
        <div className="mt-3">
          <Markdown text={data.research_draft} />
        </div>
      </details>
    </div>
  );
}

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function App() {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [online, setOnline] = useState<boolean | null>(null);

  const checkBackend = useCallback(() => {
    fetch(`${API_URL}/health`)
      .then((r) => setOnline(r.ok))
      .catch(() => setOnline(false));
  }, []);

  useEffect(() => {
    checkBackend();
  }, [checkBackend]);

  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [loading]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || loading) return;

    setLoading(true);
    setData(null);
    setError('');

    try {
      const response = await fetch(`${API_URL}/run-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? `Server error (${response.status})`);
      }
      setData(await response.json());
      setOnline(true);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'Something went wrong.'));
      checkBackend();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500 text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            Content Studio
          </div>
          <button
            onClick={checkBackend}
            title="Click to re-check"
            className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                online === null ? 'bg-slate-300' : online ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            />
            {online === null ? 'Checking backend' : online ? 'Backend connected' : 'Backend not reachable'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <div className="space-y-3 text-center">
          <span className="inline-block rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
            Research → Blog → Social · supervisor review after each step
          </span>
          <h1 className="text-4xl font-bold tracking-tight">AI Content Workflow</h1>
          <p className="mx-auto max-w-xl text-slate-600">
            Enter a topic. A researcher, a blog writer and a social media writer produce an article and a tweet,
            and a supervisor reviews each result and can send it back for changes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex gap-2">
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={loading}
              placeholder="Enter a topic..."
              className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-sky-400 disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={loading || !topic.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            Try:
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                disabled={loading}
                onClick={() => setTopic(example)}
                className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {example}
              </button>
            ))}
          </div>
        </form>

        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-500" />
            <p className="mt-3 text-sm font-medium text-slate-700">Running the workflow... {formatTime(elapsed)}</p>
            <p className="mt-1 text-xs text-slate-500">
              Research, writing and review can take a few minutes. The result appears when everything is done.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {data && <Results data={data} />}
      </main>

      <footer className="pb-8 text-center text-xs text-slate-500">
        LangGraph, Tavily and Gemini
      </footer>
    </div>
  );
}
