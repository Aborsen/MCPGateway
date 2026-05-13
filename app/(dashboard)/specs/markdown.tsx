"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Markdown renderer. Tailwind doesn't have a typography reset out of the box
// in this project, so each tag gets explicit utility classes for spacing,
// font sizes, and code styling. Matches the dashboard's dark-on-dark palette.
export function Markdown({ source }: { source: string }) {
  return (
    <div className="max-w-[80ch] text-sm leading-7 text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-10 mb-4 border-b border-border pb-2 text-3xl font-semibold tracking-tight first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-10 mb-3 border-b border-border pb-1 text-2xl font-semibold tracking-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-8 mb-2 text-lg font-semibold">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-6 mb-2 text-base font-semibold">{children}</h4>
          ),
          p: ({ children }) => <p className="my-4">{children}</p>,
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-primary underline underline-offset-2 hover:no-underline"
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noreferrer" : undefined}
            >
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="my-4 list-disc space-y-1 pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="my-4 list-decimal space-y-1 pl-6">{children}</ol>,
          li: ({ children }) => <li className="leading-7">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-2 border-primary/60 bg-muted/40 px-4 py-2 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ className, children }) => {
            const isBlock = className?.startsWith("language-");
            if (isBlock) {
              return (
                <code className={`${className} block whitespace-pre`}>{children}</code>
              );
            }
            return (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-4 overflow-x-auto rounded-md border border-border bg-muted/60 p-4 font-mono text-xs leading-relaxed">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
          th: ({ children }) => (
            <th className="border border-border px-3 py-2 text-left font-medium">{children}</th>
          ),
          td: ({ children }) => <td className="border border-border px-3 py-2 align-top">{children}</td>,
          hr: () => <hr className="my-8 border-border" />,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
