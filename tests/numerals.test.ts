import assert from "node:assert/strict";
import { test } from "node:test";
import { findNumberedLists, findNumeralCharacters, findNumerals, toNumeral, type NumeralSettings } from "../src/numerals.ts";

const settings: NumeralSettings = {
	headings: true,
	lists: true,
	delimiters: ".)",
	markers: true,
	prefix: "{",
	suffix: "}",
	lowercase: false,
	nine: true,
	numberedLists: true,
};

type Matches = typeof findNumerals;

/** Applies the matches to the note, the way write mode does or render mode shows them. */
function convert(note: string, options: Partial<NumeralSettings> = {}, find: Matches = findNumerals): string {
	const matches = find(note, { ...settings, ...options });
	return matches.reduceRight((text, { from, to, text: numeral }) => text.slice(0, from) + numeral + text.slice(to), note);
}

test("each numeral from one to nine becomes its single character", () => {
	const tokens = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
	assert.deepEqual(tokens.map((token) => toNumeral(token, settings)), ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ", "Ⅸ"]);
});

test("invalid or out-of-range tokens are not numerals", () => {
	for (const token of ["IIII", "VV", "IIV", "X", "XI", "Iv", ""]) {
		assert.equal(toNumeral(token, settings), null, token);
	}
});

test("headings and list items convert when the numeral is followed by a delimiter", () => {
	assert.equal(convert("# I. Introduction"), "# Ⅰ. Introduction");
	assert.equal(convert("### IV) Results"), "### Ⅳ) Results");
	assert.equal(convert("- II. Point"), "- Ⅱ. Point");
	assert.equal(convert("  * VIII. Nested"), "  * Ⅷ. Nested");
	assert.equal(convert("1. III. Inside a numbered list"), "1. Ⅲ. Inside a numbered list");
	assert.equal(convert("- [ ] V. A task"), "- [ ] Ⅴ. A task");
	assert.equal(convert("## IX."), "## Ⅸ.");
});

test("headings and list items inside blockquotes and callouts convert", () => {
	assert.equal(convert("> # I. Quoted"), "> # Ⅰ. Quoted");
	assert.equal(convert("> [!note]\n> - II. In a callout"), "> [!note]\n> - Ⅱ. In a callout");
	assert.equal(convert(">> - III) Nested"), ">> - Ⅲ) Nested");
	assert.equal(convert("> I. Just a quote"), "> I. Just a quote");
});

test("the pronoun I is left alone", () => {
	for (const note of ["# I think so", "- I agree.", "It was him and I.", "I. Started a sentence", "## I", "- I.e. this", "# I.B.M."]) {
		assert.equal(convert(note), note);
	}
});

test("a lone X is left alone, so maths is safe", () => {
	for (const note of ["- X. Unknown", "# X) Axis", "Solve for X.", "- X marks the spot"]) {
		assert.equal(convert(note), note);
	}
});

test("only the configured delimiters count", () => {
	assert.equal(convert("# IV: Results"), "# IV: Results");
	assert.equal(convert("# IV: Results", { delimiters: ":" }), "# Ⅳ: Results");
	assert.equal(convert("# IV. Results", { delimiters: ":" }), "# IV. Results");
});

test("headings and lists can be switched off separately", () => {
	assert.equal(convert("# I. Heading\n- I. Item", { headings: false }), "# I. Heading\n- Ⅰ. Item");
	assert.equal(convert("# I. Heading\n- I. Item", { lists: false }), "# Ⅰ. Heading\n- I. Item");
});

test("marked numerals convert anywhere and drop their markers", () => {
	assert.equal(convert("See part {IV} and {ii}."), "See part Ⅳ and {ii}.");
	assert.equal(convert("See part {IV} and {ii}.", { lowercase: true }), "See part Ⅳ and ⅱ.");
	assert.equal(convert("Not a numeral: {X} or {IIII}"), "Not a numeral: {X} or {IIII}");
	assert.equal(convert("See {IV}", { markers: false }), "See {IV}");
	assert.equal(convert("See [[IV]]", { prefix: "[[", suffix: "]]" }), "See Ⅳ");
	assert.equal(convert("See {IV}", { suffix: "" }), "See {IV}");
});

test("lowercase numerals only convert when switched on", () => {
	assert.equal(convert("- iv. Point"), "- iv. Point");
	assert.equal(convert("- iv. Point", { lowercase: true }), "- ⅳ. Point");
});

test("IX can be switched off", () => {
	assert.equal(convert("# IX. Ninth", { nine: false }), "# IX. Ninth");
});

test("code, maths and frontmatter are never touched", () => {
	const note = [
		"---",
		"title: {IV}",
		"---",
		"```",
		"# I. Not a heading",
		"```",
		"$$",
		"- V. Not a list",
		"$$",
		"$${II}$$",
		"Inline `{III}` and $x = {IV}$ stay, {V} changes",
		"# VI. Back to normal",
	].join("\n");

	const expected = note.replace("{V} changes", "Ⅴ changes").replace("# VI.", "# Ⅵ.");
	assert.equal(convert(note), expected);
});

test("a horizontal rule partway through a note is not frontmatter", () => {
	assert.equal(convert("Text\n---\n# I. Heading"), "Text\n---\n# Ⅰ. Heading");
});

test("numbered lists from one to nine show as numerals", () => {
	const lists = (note: string, options: Partial<NumeralSettings> = {}) => convert(note, options, findNumberedLists);
	assert.equal(lists("1. One\n2) Two\n  3. Nested\n> 4. Quoted"), "Ⅰ. One\nⅡ) Two\n  Ⅲ. Nested\n> Ⅳ. Quoted");
	assert.equal(lists("9. Nine\n10. Ten\n0. Zero"), "Ⅸ. Nine\n10. Ten\n0. Zero");
	assert.equal(lists("9. Nine", { nine: false }), "9. Nine");
	assert.equal(lists("1. One", { numberedLists: false }), "1. One");
	assert.equal(lists("1.5 is a number\n2.no space\n```\n3. code\n```"), "1.5 is a number\n2.no space\n```\n3. code\n```");
});

test("numbered lists are never part of what write mode converts", () => {
	assert.equal(convert("1. I. First"), "1. Ⅰ. First");
});

test("numeral characters revert to the letters they stand for", () => {
	const note = "# Ⅳ. Results and ⅱ";
	const reverted = findNumeralCharacters(note).reduceRight(
		(text, { from, to, text: letters }) => text.slice(0, from) + letters + text.slice(to),
		note,
	);
	assert.equal(reverted, "# IV. Results and ii");
});
