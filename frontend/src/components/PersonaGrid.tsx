import React from 'react';
import { BookOpen, FileText, BarChart3, ArrowRight } from 'lucide-react';

const personas = [
  {
    id: 'ACADEMIC WRITING', name: 'Academic Writing', icon: FileText,
    desc: 'Draft and refine academic documents with real citations and references.',
    color: 'text-blue-400', bg: 'bg-blue-500/15', ring: 'rgba(79,139,255,.16)',
    grad: 'linear-gradient(90deg,#2563eb,#4f8bff)', hover: 'hover:border-blue-400/60',
    chips: ['Citations', 'Reference management', 'Export to PDF'], cta: 'Start writing',
  },
  {
    id: 'LITERATURE REVIEW', name: 'Literature Review', icon: BookOpen,
    desc: 'Discover relevant literature and organize evidence into structured tables.',
    color: 'text-emerald-400', bg: 'bg-emerald-500/15', ring: 'rgba(16,185,129,.16)',
    grad: 'linear-gradient(90deg,#059669,#10b981)', hover: 'hover:border-emerald-400/60',
    chips: ['Search & extract', 'Evidence tables', 'Compare studies'], cta: 'Explore literature',
  },
  {
    id: 'SCIVIZ', name: 'SciViz', icon: BarChart3,
    desc: 'Turn research findings into scientific figures, posters, slides, and infographics.',
    color: 'text-purple-400', bg: 'bg-purple-500/15', ring: 'rgba(147,51,234,.16)',
    grad: 'linear-gradient(90deg,#7c3aed,#a855f7)', hover: 'hover:border-purple-400/60',
    chips: ['Graphs & charts', 'Posters & slides', 'Graphical abstracts'], cta: 'Create a visualization',
  },
];

// A small themed preview visual per workspace card.
function CardMock({ id }: { id: string }) {
  if (id === 'ACADEMIC WRITING') {
    return (
      <div className="border border-border rounded-xl bg-card/60 p-3 my-3">
        <div className="text-[10px] text-muted-foreground mb-2">Research Paper Draft</div>
        {[100, 100, 60, 100, 55].map((w, i) => <div key={i} className="h-1.5 rounded bg-muted mb-1.5" style={{ width: w + '%' }} />)}
      </div>
    );
  }
  if (id === 'LITERATURE REVIEW') {
    return (
      <div className="border border-border rounded-xl bg-card/60 p-2.5 my-3 overflow-hidden">
        <table className="w-full text-[10px] border-collapse">
          <thead><tr className="text-muted-foreground">{['Paper', 'Year', 'Key Finding'].map((h) => <th key={h} className="text-left font-semibold pb-1 border-b border-border">{h}</th>)}</tr></thead>
          <tbody className="text-foreground/80">
            {[['Zhou et al.', '2023', 'Deep learning…'], ['Patel et al.', '2022', 'Effective for…'], ['Kim et al.', '2021', 'Shows higher…']].map((r) => (
              <tr key={r[0]}>{r.map((c, i) => <td key={i} className="py-1 border-b border-border">{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="border border-border rounded-xl bg-card/60 p-3 my-3 flex items-end gap-2" style={{ minHeight: 84 }}>
      <div className="flex-1 flex items-end gap-1 h-full">{[40, 70, 55, 85, 60].map((h, i) => <span key={i} className="flex-1 bg-purple-400/80 rounded-sm" style={{ height: h + '%' }} />)}</div>
      <div className="w-12 h-12 rounded-md bg-muted shrink-0" />
    </div>
  );
}

export function PersonaGrid({ selectedPersona, onSelectPersona, onActivate }: any) {
  return (
    <div className="w-full relative z-10">
      <h2 className="text-[26px] md:text-3xl font-bold" style={{ fontFamily: 'Georgia, serif' }}>Choose your workspace</h2>
      <p className="text-muted-foreground text-[14px] mt-1.5">Three powerful tools, one seamless research experience.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 mt-6">
        {personas.map((p, i) => {
          const Icon = p.icon;
          const isSelected = selectedPersona === p.id;
          return (
            <div
              key={p.id}
              onClick={() => onActivate(p.id)}
              style={{ animationDelay: `${i * 0.07}s`, boxShadow: `inset 0 0 0 1px ${p.ring}` }}
              className={`pnx-card pnx-fade-up flex flex-col text-left p-5 rounded-2xl border bg-card cursor-pointer ${isSelected ? 'border-blue-500' : 'border-border ' + p.hover}`}
            >
              <div className={`w-11 h-11 rounded-xl ${p.bg} flex items-center justify-center mb-3`}><Icon className={`w-5 h-5 ${p.color}`} /></div>
              <h3 className="font-bold text-foreground text-[18px]">{p.name}</h3>
              <p className="text-[14px] text-muted-foreground leading-relaxed mt-1.5">{p.desc}</p>
              <CardMock id={p.id} />
              <div className="flex flex-wrap gap-1.5 mb-3.5">
                {p.chips.map((c) => <span key={c} className="text-[10.5px] text-muted-foreground/75 bg-muted/50 rounded-full px-2 py-0.5">{c}</span>)}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onActivate(p.id); }}
                className="mt-auto w-full text-white font-semibold text-[13.5px] rounded-xl py-2.5 inline-flex items-center justify-center gap-2 transition-transform hover:-translate-y-0.5"
                style={{ background: p.grad }}>
                {p.cta} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
