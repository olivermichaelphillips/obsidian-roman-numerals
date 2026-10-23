/**
 * Finds Roman numerals in Markdown and works out what should replace them.
 *
 * Everything here is plain string handling with no Obsidian imports, so the
 * render and write modes follow exactly the same rules and the rules can be
 * tested on their own.
 */

export interface NumeralSettings {
	/** Recognise a numeral at the start of a heading: `## IV. Methods`. */
	headings: boolean;
	/** Recognise a numeral at the start of a list item: `- II) Point`. */
	lists: boolean;
	/** Characters that must follow a heading or list numeral, such as `.` or `)`. */
	delimiters: string;
	/** Recognise numerals wrapped in a prefix and suffix anywhere: `{IV}`. */
	markers: boolean;
	prefix: string;
	suffix: string;
	/** Also recognise lowercase numerals: `i.` becomes `ⅰ.`. */
	lowercase: boolean;
	/** Recognise IX. A lone X is never a numeral, as it is too often maths. */
	nine: boolean;
	/** Show the numbers of numbered lists as lowercase numerals, on screen only: `2.` looks like `ⅱ.`. */
	numberedLists: boolean;
}

/** The text that should take the place of `from`–`to` in a note. */
export interface Match {
	from: number;
	to: number;
	text: string;
}

const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

// Unicode has a single character for each numeral from one to twelve,
// starting at Ⅰ (U+2160) for capitals and ⅰ (U+2170) for lowercase.
const UPPERCASE_ONE = 0x2160;
const LOWERCASE_ONE = 0x2170;

// Either may sit inside a blockquote or callout, behind one or more `>`.
const QUOTE = String.raw`^(?:[ \t]*>[ \t]?)*`;
const HEADING = new RegExp(QUOTE + String.raw`#{1,6}[ \t]+`);
const LIST_ITEM = new RegExp(QUOTE + String.raw`[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[.\][ \t]+)?`);
const NUMBERED_ITEM = new RegExp(QUOTE + String.raw`[ \t]*(\d+)([.)])(?=[ \t])`);
const LEADING_NUMERAL = /^([IVXivx]+)(\S)(?=\s|$)/;
const BLOCK_FENCE = /^[ \t]*(`{3,}|~{3,}|\$\$)/;
const INLINE_CODE_OR_MATHS = /(`+).*?\1|\$[^$]+\$/g;

/** Returns the numeral character for a token such as `IV`, or null if it isn't one we convert. */
export function toNumeral(token: string, settings: NumeralSettings): string | null {
	const upper = token.toUpperCase();
	const isLower = token === token.toLowerCase();
	if (token !== upper && !isLower) return null;
	if (isLower && !settings.lowercase) return null;

	return numeralFor(NUMERALS.indexOf(upper) + 1, isLower, settings);
}

/** Returns the numeral character a numbered list shows for a number, or null if it stays a number. */
export function numberToNumeral(value: number, settings: NumeralSettings): string | null {
	return numeralFor(value, true, settings);
}

function numeralFor(value: number, lowercase: boolean, settings: NumeralSettings): string | null {
	if (value < 1 || value > NUMERALS.length || (value === 9 && !settings.nine)) return null;
	return String.fromCodePoint((lowercase ? LOWERCASE_ONE : UPPERCASE_ONE) + value - 1);
}

/**
 * Matches a numeral and its delimiter at the very start of `text`, as in
 * `IV. Methods`. The delimiter must be followed by a space or the end of the
 * text, so `I.e.` and `I.B.M.` are left alone.
 */
export function matchLeading(text: string, settings: NumeralSettings, offset = 0): Match | null {
	const found = LEADING_NUMERAL.exec(text);
	if (!found) return null;

	const [whole, token, delimiter] = found;
	if (!settings.delimiters.includes(delimiter)) return null;

	const numeral = toNumeral(token, settings);
	if (!numeral) return null;

	return { from: offset, to: offset + whole.length, text: numeral + delimiter };
}

/** Matches every marked numeral in `text`, such as `{IV}`, skipping inline code and maths. */
export function matchMarked(text: string, settings: NumeralSettings, offset = 0): Match[] {
	const { prefix, suffix } = settings;
	if (!prefix || !suffix) return [];

	// Blank out code and maths so their contents can't match, keeping positions intact.
	const searchable = text.replace(INLINE_CODE_OR_MATHS, (span) => " ".repeat(span.length));
	const marked = new RegExp(escapeRegExp(prefix) + "([IVXivx]+)" + escapeRegExp(suffix), "g");

	const matches: Match[] = [];
	for (const found of searchable.matchAll(marked)) {
		const numeral = toNumeral(found[1], settings);
		if (!numeral) continue;
		const from = offset + found.index;
		matches.push({ from, to: from + found[0].length, text: numeral });
	}
	return matches;
}

/** Finds every numeral in a note, in document order. */
export function findNumerals(note: string, settings: NumeralSettings): Match[] {
	const matches: Match[] = [];

	for (const { line, lineStart } of proseLines(note)) {
		const start = (settings.headings && HEADING.exec(line)) || (settings.lists && LIST_ITEM.exec(line));
		if (start) {
			const length = start[0].length;
			const leading = matchLeading(line.slice(length), settings, lineStart + length);
			if (leading) matches.push(leading);
		}

		if (settings.markers) matches.push(...matchMarked(line, settings, lineStart));
	}

	return matches;
}

/**
 * Finds the numbers one to nine that start numbered list items, paired with
 * the numerals to show in their place: `2.` becomes `ⅱ.`. These are only
 * ever drawn on screen, because other Markdown editors would no longer see
 * a numbered list if the file held `ⅱ.`.
 */
export function findNumberedLists(note: string, settings: NumeralSettings): Match[] {
	if (!settings.numberedLists) return [];
	const matches: Match[] = [];

	for (const { line, lineStart } of proseLines(note)) {
		const found = NUMBERED_ITEM.exec(line);
		if (!found) continue;

		const [whole, number, delimiter] = found;
		const numeral = numberToNumeral(Number(number), settings);
		if (!numeral) continue;

		const from = lineStart + whole.length - number.length - delimiter.length;
		matches.push({ from, to: from + number.length + delimiter.length, text: numeral + delimiter });
	}

	return matches;
}

/** Yields each line of a note that is ordinary text, skipping frontmatter, code blocks and maths blocks. */
function* proseLines(note: string): Generator<{ line: string; lineStart: number }> {
	const lines = note.split("\n");
	// The fence that opened the block we are in, if any. Frontmatter counts as one.
	let openFence = lines[0] === "---" ? "---" : null;
	let offset = 0;

	for (const [index, line] of lines.entries()) {
		const lineStart = offset;
		offset += line.length + 1;

		if (openFence) {
			if (index > 0 && line.trim().startsWith(openFence)) openFence = null;
			continue;
		}

		const fence = BLOCK_FENCE.exec(line);
		if (fence) {
			const trimmed = line.trim();
			const isOneLineMaths = fence[1] === "$$" && trimmed.length > 4 && trimmed.endsWith("$$");
			if (!isOneLineMaths) openFence = fence[1];
			continue;
		}

		yield { line, lineStart };
	}
}

/** Finds every numeral character in a note, paired with the letters it stands for. */
export function findNumeralCharacters(note: string): Match[] {
	const matches: Match[] = [];
	for (const found of note.matchAll(/[Ⅰ-Ⅸⅰ-ⅸ]/g)) {
		const code = found[0].codePointAt(0)!;
		const isLower = code >= LOWERCASE_ONE;
		const letters = NUMERALS[code - (isLower ? LOWERCASE_ONE : UPPERCASE_ONE)];
		matches.push({ from: found.index, to: found.index + 1, text: isLower ? letters.toLowerCase() : letters });
	}
	return matches;
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
