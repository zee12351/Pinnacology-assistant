import React from 'react';
import { BookOpen, FileText, BarChart3 } from 'lucide-react';

const personas = [
  { id: 'ACADEMIC WRITING', name: 'Academic Writing', icon: FileText, desc: 'Write, cite, and peer-review research papers with a dedicated workspace.', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { id: 'LITERATURE REVIEW', name: 'Literature Review', icon: BookOpen, desc: 'Discover and synthesize papers in a structured data table view.', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { id: 'SCIVIZ', name: 'SciViz', icon: BarChart3, desc: 'Turn any paper into posters, slides, infographics, and graphical abstracts.', color: 'text-purple-500', bg: 'bg-purple-500/10' },
];

export function PersonaGrid({ selectedPersona, onSelectPersona, onActivate }: any) {
  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center pt-2 relative z-10">
      <div className="text-center mb-5">
        <h1 className="text-3xl font-bold tracking-tight">What would you like to <span className="pnx-gradient-text">do today?</span></h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 w-full px-4 md:px-6 mb-4">
        {personas.map((persona, i) => {
          const Icon = persona.icon;
          const isSelected = selectedPersona === persona.id;
          return (
            <button
              key={persona.id}
              onClick={() => {
                onActivate(persona.id);
              }}
              style={{ animationDelay: `${i * 0.07}s` }}
              className={`pnx-card pnx-fade-up flex flex-col text-left p-6 rounded-2xl border ${isSelected ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-500/5' : 'border-border bg-card hover:border-blue-400/60'}`}
            >
              <div className={`w-12 h-12 rounded-xl ${persona.bg} flex items-center justify-center mb-4`}>
                <Icon className={`w-6 h-6 ${persona.color}`} />
              </div>
              <h3 className="font-bold text-foreground text-[17px] mb-1.5">{persona.name}</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{persona.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
