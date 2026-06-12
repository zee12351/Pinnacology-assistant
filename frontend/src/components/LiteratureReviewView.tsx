import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Download, FileText, ChevronRight, ExternalLink } from 'lucide-react';

export function LiteratureReviewView({ messages, loading, structuredPapers }: any) {
  return (
    <div className="flex w-full h-full bg-background overflow-hidden">
      {/* Left Chat Workspace */}
      <div className="w-1/2 flex flex-col border-r border-border h-full">
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {messages.map((m: any, idx: number) => (
            <div key={idx} className={`mb-6 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`${m.role === 'user' ? 'bg-primary text-primary-foreground max-w-[85%]' : 'bg-transparent text-foreground w-full'} rounded-3xl px-5 py-4`}>
                {m.role === 'user' ? (
                  <div className="text-sm">{m.content}</div>
                ) : (
                  <div className="prose prose-sm dark:prose-invert break-words overflow-x-hidden max-w-none custom-scrollbar">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground p-4">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></span>
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100"></span>
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200"></span>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar - Structured Papers */}
      <div className="w-1/2 bg-card flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-border font-semibold flex items-center justify-between text-foreground">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-500" />
            Found Papers
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors text-foreground">
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-muted/30">
          {structuredPapers && structuredPapers.length > 0 ? (
            <div className="flex flex-col gap-4">
              {structuredPapers.map((paper: any, idx: number) => (
                <div key={idx} className="bg-background border border-border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                  <h3 className="font-semibold text-sm text-foreground mb-1 leading-snug">{paper.title || 'Untitled Paper'}</h3>
                  <p className="text-xs text-muted-foreground mb-3">{paper.authors || 'Unknown Authors'}</p>
                  
                  {paper.abstract && (
                    <p className="text-xs text-foreground/80 line-clamp-3 mb-3 leading-relaxed">
                      {paper.abstract}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-border">
                    <span className="text-[10px] font-medium px-2 py-1 bg-muted rounded-md text-muted-foreground">
                      {paper.source || 'Academic Paper'}
                    </span>
                    {paper.url && (
                      <a href={paper.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] font-semibold text-blue-500 hover:text-blue-600 transition-colors">
                        View Source <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-50">
              <FileText className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-sm text-foreground">No papers extracted yet.</p>
              <p className="text-xs text-muted-foreground mt-2">Ask the AI to search for literature to populate this view.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
