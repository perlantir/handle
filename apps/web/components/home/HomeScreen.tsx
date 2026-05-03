"use client";

import { useState } from "react";
import { Suspense } from "react";
import { ContinueBand } from "./ContinueBand";
import { HomeComposer } from "./HomeComposer";
import { HomeHero } from "./HomeHero";
import { ModePillRow } from "./ModePillRow";
import { SuggestionChips } from "./SuggestionChips";

export function HomeScreen() {
  const [goal, setGoal] = useState("");

  return (
    <div className="flex min-h-full flex-col overflow-hidden">
      <div className="flex flex-col items-center px-16 pb-12 pt-[88px]">
        <HomeHero />
        <ModePillRow />
        <Suspense
          fallback={
            <div className="mx-auto mt-6 h-[180px] w-full max-w-[720px] rounded-[18px] border border-border-subtle bg-bg-surface" />
          }
        >
          <HomeComposer onValueChange={setGoal} value={goal} />
        </Suspense>
        <SuggestionChips onSelect={setGoal} />
      </div>
      <ContinueBand />
    </div>
  );
}
