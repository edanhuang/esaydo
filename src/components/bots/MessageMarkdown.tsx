import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * 把消息按 Markdown 渲染成 HTML（标题、列表、任务列表、表格、代码块）。
 * 消息里夹带的原始 HTML 不会被执行：页面能调用 EasyDo 的本地命令，不能让 Bot 的输出注入脚本。
 */
export function MessageMarkdown({ content }: { content: string }) {
  return (
    <div className="message-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // App 里点链接会把整个界面导航走，这里只展示，完整地址放在悬停提示里
          a: ({ href, children }) => (
            <span className="message-markdown-link" title={href}>
              {children}
            </span>
          ),
          img: ({ alt }) => <span className="text-easydo-textMuted">[图片{alt ? `：${alt}` : ""}]</span>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
