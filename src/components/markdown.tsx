import ReactMarkdown from "react-markdown";

/**
 * A post's body. Raw HTML is dropped, unsafe URLs (javascript: and the like)
 * are emptied by react-markdown's default URL transform, and links open in a
 * new tab without passing on the page's authority or its address.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-3 break-words [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        skipHtml
        components={{
          a: ({ node: _node, children: text, ...props }) => (
            <a
              {...props}
              rel="nofollow ugc noopener noreferrer"
              target="_blank"
            >
              {text}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
