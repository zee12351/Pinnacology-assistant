import React from 'react';
import { BookOpen, FileText, Stethoscope, FileSignature, ShieldCheck, Beaker, GraduationCap, Microscope, BadgeHelp } from 'lucide-react';

const personas = [
  { id: 'ACADEMIC WRITING', name: 'Academic Writing', icon: FileText, desc: 'Write, cite, and peer-review research papers with a dedicated workspace.', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { id: 'LITERATURE REVIEW', name: 'Literature Review', icon: BookOpen, desc: 'Discover and synthesize papers in a structured data table view.', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { id: 'MEDICAL WRITING', name: 'Medical Writing', icon: Stethoscope, desc: 'Draft clinical documents with strict medical terminology compliance.', color: 'text-purple-500', bg: 'bg-purple-500/10' },
  { id: 'CLINICAL WRITING', name: 'Clinical Writing', icon: FileSignature, desc: 'Generate clinical trial protocols and investigator brochures.', color: 'text-orange-500', bg: 'bg-orange-500/10' },
  { id: 'REGULATORY WRITING', name: 'Regulatory Writing', icon: ShieldCheck, desc: 'Prepare submissions and regulatory documents for health authorities.', color: 'text-red-500', bg: 'bg-red-500/10' },
  { id: 'PHARMACEUTICAL WRITING', name: 'Pharma Writing', icon: Beaker, desc: 'Create drug safety reports and pharmaceutical marketing copy.', color: 'text-teal-500', bg: 'bg-teal-500/10' },
  { id: 'RESEARCH & PUBLICATION SUPPORT', name: 'Publication Support', icon: GraduationCap, desc: 'Format manuscripts and handle journal submission requirements.', color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  { id: 'GRANT & FUNDING WRITING', name: 'Grant Writing', icon: BadgeHelp, desc: 'Craft persuasive grant proposals to secure research funding.', color: 'text-pink-500', bg: 'bg-pink-500/10' },
  { id: 'SPECIALIZED BIOMEDICAL WRITING', name: 'Biomedical Writing', icon: Microscope, desc: 'Translate complex biological data into accessible scientific text.', color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
];

export function PersonaGrid({ selectedPersona, onSelectPersona, onActivate }: any) {
  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center md:mt-[-5vh] pt-4 md:pt-0">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-3 tracking-tight">What would you like to do today?</h1>
        <p className="text-muted-foreground text-sm max-w-xl mx-auto">Select a specialized persona to configure your workspace, or just start typing below for a general search.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full px-4 md:px-6 mb-8">
        {personas.map((persona) => {
          const Icon = persona.icon;
          const isSelected = selectedPersona === persona.id;
          return (
            <button
              key={persona.id}
              onClick={() => {
                onSelectPersona(persona.id);
                onActivate(persona.id);
              }}
              className={`flex flex-col text-left p-5 rounded-2xl border transition-all ${isSelected ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-500/5' : 'border-border bg-card hover:border-blue-400/50 hover:shadow-sm'}`}
            >
              <div className={`w-10 h-10 rounded-xl ${persona.bg} flex items-center justify-center mb-4`}>
                <Icon className={`w-5 h-5 ${persona.color}`} />
              </div>
              <h3 className="font-semibold text-foreground text-base mb-1">{persona.name}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{persona.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
