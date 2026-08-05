import type { Faction } from '../../../../../shared/games/gwent/engine/types';

/**
 * Gwent-0d §3: the player-info panel's faction emblem — no faction-crest
 * asset exists in the repo (checked), so these are hand-authored, monochrome
 * (`currentColor`) SVGs, same convention as boardIcons.tsx. A shared shield
 * outline, one distinguishing glyph per faction inside it.
 */
const SHIELD_PATH = 'M12 2 L20 5 V11 C20 17 16 20.5 12 22 C8 20.5 4 17 4 11 V5 Z';

function Shield({ children }: { children?: React.ReactNode }) {
  return (
    <svg width="1.1em" height="1.1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={SHIELD_PATH} />
      {children}
    </svg>
  );
}

function NorthernRealmsIcon() {
  return (
    <Shield>
      <path d="M12 6 L12 17 M9 9 Q12 6 15 9 M8.5 13 Q12 10 15.5 13" />
    </Shield>
  );
}

function NilfgaardIcon() {
  return (
    <Shield>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 6.5V8M12 16v1.5M7 12h1.5M15.5 12H17M8.5 8.5l1 1M14.5 14.5l1 1M8.5 15.5l1-1M14.5 9.5l1-1" />
    </Shield>
  );
}

function ScoiatealIcon() {
  return (
    <Shield>
      <path d="M12 7c-2.2 1.5-3 3.3-3 5 0 1.6 1.3 2.5 3 2.5s3-.9 3-2.5c0-1.7-.8-3.5-3-5Z" />
      <path d="M12 14.5V19" />
    </Shield>
  );
}

function MonstersIcon() {
  return (
    <Shield>
      <path d="M8 7l2.5 9M12 6.5v9M16 7l-2.5 9" />
    </Shield>
  );
}

const FACTION_ICON_COMPONENTS: Record<Faction, () => React.JSX.Element> = {
  NorthernRealms: NorthernRealmsIcon,
  Nilfgaard: NilfgaardIcon,
  Monsters: MonstersIcon,
  Scoiatael: ScoiatealIcon,
};

export function FactionIcon({ faction }: { faction: Faction }) {
  const Icon = FACTION_ICON_COMPONENTS[faction];
  return <Icon />;
}
