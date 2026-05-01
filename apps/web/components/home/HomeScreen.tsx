'use client';

import { useState } from 'react';
import { ContinueBand } from './ContinueBand';
import { HomeComposer } from './HomeComposer';
import { HomeHero } from './HomeHero';
import { ModePillRow } from './ModePillRow';
import { SuggestionChips } from './SuggestionChips';

export function HomeScreen() {
  const [goal, setGoal] = useState('');

  return (
    <div className="flex min-h-full flex-col overflow-hidden">
      <div className="flex flex-col items-center px-16 pb-12 pt-[88px]">
        <HomeHero />
        <ModePillRow />
        <HomeComposer onValueChange={setGoal} value={goal} />
        <SuggestionChips onSelect={setGoal} />
      </div>
      <ContinueBand />
    </div>
  );
}
