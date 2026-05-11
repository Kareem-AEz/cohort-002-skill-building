import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { MyUIMessage } from '../api/chat.ts';

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export const Wrapper = (props: {
  messages: React.ReactNode;
  input: React.ReactNode;
}) => {
  return (
    <div className="flex flex-col h-screen w-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-2">
          <h1 className="text-xs font-medium text-muted-foreground">
            Skill Building
          </h1>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-8 pt-6 scrollbar-thin scrollbar-track-background scrollbar-thumb-muted hover:scrollbar-thumb-muted-foreground">
        <div className="max-w-3xl mx-auto space-y-6">
          {props.messages}
        </div>
      </div>
      {props.input}
    </div>
  );
};

export const Message = ({
  role,
  parts,
}: {
  role: string;
  parts: MyUIMessage['parts'];
}) => {
  const isUser = role === 'user';

  return (
    <div className={cn('flex w-full', isUser && 'justify-end')}>
      <div className="flex flex-col gap-2 max-w-[60ch] w-full">
        <div
          className={cn(
            'transition-colors',
            isUser
              ? 'rounded-lg bg-accent text-accent-foreground border border-border shadow-sm px-4 py-3'
              : 'text-foreground px-4',
          )}
        >
          {parts.map((part) => {
            if (part.type === 'text') {
              return (
                <div className="prose prose-sm prose-invert max-w-none">
                  <ReactMarkdown>{part.text}</ReactMarkdown>
                </div>
              );
            }

            if (part.type === 'data-emails')
              return <EmailSources emails={part.data} />;

            if (part.type === 'data-keywords')
              return <KeywordsBadge keywords={part.data} />;
            return '';
          })}
        </div>
      </div>
    </div>
  );
};

export const KeywordsBadge = ({
  keywords,
}: {
  keywords: string[];
}) => {
  if (!keywords.length) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap py-2">
      <span className="text-xs text-muted-foreground font-medium shrink-0">
        Searching for:
      </span>
      {keywords.map((kw) => (
        <span
          key={kw}
          className="text-xs px-2 py-0.5 rounded-full bg-accent/50 text-accent-foreground border border-border/50"
        >
          {kw}
        </span>
      ))}
    </div>
  );
};

interface EmailSource {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
}

export const EmailSources = ({
  emails,
}: {
  emails: (EmailSource & { score: number })[];
}) => {
  const [open, setOpen] = React.useState(false);
  const [expandedBody, setExpandedBody] = React.useState<
    Record<string, boolean>
  >({});

  if (!emails.length) return null;

  return (
    <div className="my-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 group"
      >
        <span>
          {open ? 'Hide' : 'Show'} {emails.length} source
          {emails.length !== 1 ? 's' : ''}
        </span>
        <svg
          className={cn(
            'w-3.5 h-3.5 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin scrollbar-track-background scrollbar-thumb-muted pr-1">
          {emails.map((email) => {
            const isBodyOpen =
              expandedBody[email.id] ?? false;
            const pct = Math.min(email.score, 1);

            return (
              <div key={email.id}>
                <button
                  onClick={() =>
                    setExpandedBody((prev) => ({
                      ...prev,
                      [email.id]: !prev[email.id],
                    }))
                  }
                  className="w-full text-left rounded-md border border-border/60 bg-card/50 hover:bg-card transition-colors overflow-hidden"
                >
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <div
                      className="shrink-0 w-1 h-8 rounded-full"
                      style={{
                        background:
                          pct > 0.8
                            ? 'var(--color-green-500, #22c55e)'
                            : pct > 0.4
                              ? 'var(--color-amber-500, #f59e0b)'
                              : 'var(--color-red-500, #ef4444)',
                        opacity: 0.7 + pct * 0.3,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-foreground truncate">
                        {email.subject || '(no subject)'}
                      </div>
                      <div className="text-[10px] text-muted-foreground flex gap-2 mt-0.5">
                        <span className="opacity-70">
                          {email.from}
                        </span>
                        <span className="opacity-40">
                          → {email.to}
                        </span>
                        <span className="opacity-60 ml-auto tabular-nums">
                          {(pct * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <svg
                      className={cn(
                        'w-3 h-3 text-muted-foreground/50 shrink-0 transition-transform',
                        isBodyOpen && 'rotate-180',
                      )}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                  {isBodyOpen && (
                    <div className="px-2.5 pb-2.5 border-t border-border/30">
                      <div className="prose prose-sm prose-invert max-w-none text-xs pt-2 leading-relaxed">
                        <ReactMarkdown>
                          {email.body}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const ChatInput = ({
  input,
  onChange,
  onSubmit,
  disabled,
}: {
  input: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  disabled?: boolean;
}) => (
  <div className="flex-shrink-0 w-full border-t border-border bg-background/80 backdrop-blur-sm">
    <div className="max-w-3xl mx-auto p-4">
      <form onSubmit={onSubmit} className="relative">
        <AutoExpandingTextarea
          value={input}
          placeholder={
            disabled
              ? 'Please handle tool calls first...'
              : 'Ask a question...'
          }
          onChange={onChange}
          disabled={disabled}
          autoFocus
        />
      </form>
    </div>
  </div>
);

const AutoExpandingTextarea = ({
  value,
  onChange,
  placeholder,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      className={cn(
        'w-full rounded-lg border border-input bg-card px-4 py-3 text-sm shadow-sm transition-all resize-none max-h-[6lh]',
        'overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-accent',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        !disabled && 'hover:border-ring/50',
      )}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.form?.requestSubmit();
        }
      }}
      disabled={disabled}
      autoFocus={autoFocus}
    />
  );
};
