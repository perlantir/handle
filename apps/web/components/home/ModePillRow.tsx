import { Brain, Code2, Compass, Globe2, Sparkles } from 'lucide-react';
import { ModePill } from '@/components/design-system';

const modes = [
  { active: true, icon: Sparkles, label: 'Plan' },
  { icon: Globe2, label: 'Research' },
  { icon: Compass, label: 'Operate browser' },
  { icon: Code2, label: 'Build app' },
  { icon: Brain, label: 'Recall memory' },
];

export function ModePillRow() {
  return (
    <div className="mt-8 flex max-w-[720px] flex-wrap justify-center gap-2">
      {modes.map(({ active = false, icon: Icon, label }) => (
        <ModePill key={label} active={active} icon={<Icon className="h-[13px] w-[13px]" strokeWidth={1.8} />}>
          {label}
        </ModePill>
      ))}
    </div>
  );
}
