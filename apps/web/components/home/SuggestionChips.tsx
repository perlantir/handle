const suggestions = [
  'Write a Python script that fetches the top 10 Hacker News stories from https://news.ycombinator.com and saves them as JSON to /tmp/hn.json, then run the script once and show me the contents.',
  'Summarize unread Slack since Friday',
  'Prep brief for Thursday Lattice review',
];

interface SuggestionChipsProps {
  onSelect: (suggestion: string) => void;
}

export function SuggestionChips({ onSelect }: SuggestionChipsProps) {
  return (
    <div className="mt-4 flex max-w-[760px] flex-wrap justify-center gap-2.5">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          className="h-8 max-w-[280px] truncate rounded-2xl border border-border-subtle px-[14px] text-left text-[12.5px] text-text-secondary transition-colors duration-fast hover:bg-bg-subtle"
          onClick={() => onSelect(suggestion)}
          type="button"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
