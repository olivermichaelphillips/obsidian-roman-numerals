/**
 * How numerals look on screen, in Live Preview and in Reading view.
 *
 * In render mode, letter numerals are drawn as numeral characters while the
 * note keeps its letters. Numbered lists can be drawn with numerals in either
 * mode. In both modes, numeral characters are given the `roman-numeral`
 * class, because in many fonts Ⅳ looks just like IV.
 */

import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { editorLivePreviewField } from "obsidian";
import {
	findNumberedLists,
	findNumeralCharacters,
	findNumerals,
	matchLeading,
	matchMarked,
	numberToNumeral,
	type Match,
	type NumeralSettings,
} from "./numerals";

const NUMERAL_CLASS = "roman-numeral";
const numeralMark = Decoration.mark({ class: NUMERAL_CLASS });

class NumeralWidget extends WidgetType {
	constructor(private readonly text: string) {
		super();
	}

	eq(other: NumeralWidget): boolean {
		return other.text === this.text;
	}

	toDOM(): HTMLElement {
		return createSpan({ cls: NUMERAL_CLASS, text: this.text });
	}
}

/**
 * Styles numeral characters in the editor and draws numerals in Live Preview:
 * letter numerals when `render` is on, and numbered lists when that setting
 * is on. What is underneath shows again while the cursor is on it.
 */
export function editorNumerals(settings: NumeralSettings, render: boolean) {
	// The cursor and the editor mode only matter when numerals are being drawn.
	const draws = render || settings.numberedLists !== "off";

	return ViewPlugin.fromClass(
		class {
			/** Every numeral in the note, found once per edit rather than on every cursor move. */
			private characters: Match[] = [];
			private drawn: Match[] = [];
			decorations: DecorationSet = Decoration.none;

			constructor(view: EditorView) {
				this.scan(view);
				this.decorations = this.decorate(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged) this.scan(update.view);

				const modeChanged = update.state.field(editorLivePreviewField) !== update.startState.field(editorLivePreviewField);
				if (update.docChanged || update.viewportChanged || (draws && (update.selectionSet || modeChanged))) {
					this.decorations = this.decorate(update.view);
				}
			}

			private scan(view: EditorView) {
				const note = view.state.doc.toString();
				this.characters = findNumeralCharacters(note);
				this.drawn = [...(render ? findNumerals(note, settings) : []), ...findNumberedLists(note, settings)];
			}

			/** Decorates only what is on screen, so long notes stay fast. */
			private decorate(view: EditorView): DecorationSet {
				const onScreen = ({ from, to }: Match) => view.visibleRanges.some((range) => from < range.to && to > range.from);
				const decorations = this.characters.filter(onScreen).map(({ from, to }) => numeralMark.range(from, to));

				// Source mode always shows the note exactly as written.
				if (view.state.field(editorLivePreviewField)) {
					const cursors = view.state.selection.ranges;
					for (const match of this.drawn.filter(onScreen)) {
						const isBeingEdited = cursors.some((cursor) => cursor.from <= match.to && cursor.to >= match.from);
						if (!isBeingEdited) {
							decorations.push(Decoration.replace({ widget: new NumeralWidget(match.text) }).range(match.from, match.to));
						}
					}
				}

				return Decoration.set(decorations, true);
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	);
}

/** The Reading view counterpart of `editorNumerals`, run on each rendered section. */
export function readingViewNumerals(section: HTMLElement, settings: NumeralSettings, render: boolean): void {
	if (render) drawLetterNumerals(section, settings);

	if (settings.numberedLists !== "off") drawListNumbers(section, settings);

	for (const node of textNodes(section)) {
		if (node.parentElement?.closest(`code, pre, .math, .${NUMERAL_CLASS}`)) continue;
		replaceText(node, findNumeralCharacters(node.data));
	}
}

function drawLetterNumerals(section: HTMLElement, settings: NumeralSettings): void {
	const starts: HTMLElement[] = [];
	if (settings.headings) starts.push(...section.findAll("h1, h2, h3, h4, h5, h6"));
	if (settings.lists) starts.push(...section.findAll("li"));

	for (const element of starts) {
		const first = textNodes(element).find((node) => node.data.trim() !== "");
		if (!first) continue;
		const indent = first.data.length - first.data.trimStart().length;
		const match = matchLeading(first.data.slice(indent), settings, indent);
		if (match) replaceText(first, [match]);
	}

	// Code and maths are separate elements in Reading view, so they are easy to skip.
	if (settings.markers) {
		for (const node of textNodes(section)) {
			if (node.parentElement?.closest("code, pre, .math")) continue;
			replaceText(node, matchMarked(node.data, settings));
		}
	}
}

/**
 * Reading view draws list numbers as markers, outside the text, so each item
 * carries its numeral in a data attribute that styles.css shows as the marker.
 */
function drawListNumbers(section: HTMLElement, settings: NumeralSettings): void {
	for (const list of section.findAll("ol")) {
		const first = (list as HTMLOListElement).start;
		list.findAll(":scope > li").forEach((item, index) => {
			const numeral = numberToNumeral(first + index, settings);
			if (numeral) item.dataset.romanNumeral = `${numeral}. `;
		});
	}
}

function textNodes(root: HTMLElement): Text[] {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	while (walker.nextNode()) nodes.push(walker.currentNode as Text);
	return nodes;
}

/** Swaps each match in a text node for a numeral span. Works from the end so earlier positions stay valid. */
function replaceText(node: Text, matches: Match[]): void {
	for (const match of [...matches].reverse()) {
		const matched = node.splitText(match.from);
		matched.splitText(match.to - match.from);
		matched.replaceWith(createSpan({ cls: NUMERAL_CLASS, text: match.text }));
	}
}
