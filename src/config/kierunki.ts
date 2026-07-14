import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ścieżka do surowego pliku z listą kierunków (w katalogu głównym repo)
const KIERUNKI_FILE = join(__dirname, '..', '..', 'kierunki_agh');

export interface Kierunek {
  /** Pełna nazwa kierunku, np. "Automatyka i Robotyka" */
  name: string;
  /** Emoji przypisane do kierunku, np. "🤖" */
  emoji: string;
  /** Nazwa roli na Discordzie (nazwa + emoji), używana do wyszukiwania po nazwie */
  roleName: string;
  /** Slug używany jako nazwa kanału (lowercase, myślniki, bez polskich znaków) */
  slug: string;
}

const POLISH_MAP: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  Ą: 'a', Ć: 'c', Ę: 'e', Ł: 'l', Ń: 'n', Ó: 'o', Ś: 's', Ź: 'z', Ż: 'z',
};

/** Zamienia nazwę kierunku na bezpieczny slug kanału Discord. */
export function slugify(input: string): string {
  return input
    .split('')
    .map((ch) => POLISH_MAP[ch] ?? ch)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

/**
 * Parsuje linię typu:
 *   "1. Automatyka i Robotyka 🤖"
 * na obiekt Kierunek. Zwraca null dla pustych/niepasujących linii.
 */
function parseLine(line: string): Kierunek | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Usuń wiodący numer porządkowy "12. "
  const withoutNumber = trimmed.replace(/^\d+\.\s*/, '');

  // Wyodrębnij końcowe emoji (klaster znaków piktograficznych na końcu linii)
  const emojiRe = /(?:[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0F\u200D])+$/u;
  const emojiMatch = withoutNumber.match(emojiRe);
  const emoji = emojiMatch ? emojiMatch[0].trim() : '';
  const name = (emojiMatch ? withoutNumber.slice(0, emojiMatch.index) : withoutNumber).trim();

  if (!name) return null;

  return {
    name,
    emoji,
    roleName: emoji ? `${name} ${emoji}` : name,
    slug: slugify(name),
  };
}

let cache: Kierunek[] | null = null;

/** Wczytuje i parsuje listę kierunków z pliku `kierunki_agh`. */
export function loadKierunki(): Kierunek[] {
  if (cache) return cache;
  const raw = readFileSync(KIERUNKI_FILE, 'utf-8');
  cache = raw
    .split('\n')
    .map(parseLine)
    .filter((k): k is Kierunek => k !== null);
  return cache;
}
