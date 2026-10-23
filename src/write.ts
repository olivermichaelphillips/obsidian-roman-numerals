/**
 * Write mode: numeral characters are stored in the note itself, either as
 * you type or by running a command over the whole note.
 */

import { isolateHistory } from "@codemirror/commands";
import { type Extension, Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { Editor } from "obsidian";
import { findNumerals, type Match, type NumeralSettings } from "./numerals";

/**
 * Converts numerals while you type. Each conversion is its own undo step,
 * so undo brings the letters back.
 *
 * The check runs after the editor has applied the keystroke, so it sees the
 * result even when Obsidian handles the key itself, as when typing `}` steps
 * over an auto-paired bracket.
 */
export function convertAsYouType(settings: NumeralSettings): Extension {
	let typedIn: EditorView | null = null;

	return [
		// Highest precedence so this sees every keystroke before other handlers can claim it.
		Prec.highest(
			EditorView.inputHandler.of((view) => {
				typedIn = view;
				return false;
			}),
		),
		EditorView.updateListener.of(({ view, state }) => {
			if (typedIn !== view) return;
			typedIn = null;

			const cursor = state.selection.main;
			if (!cursor.empty) return;

			// A heading or list numeral converts on the space after its delimiter, so
			// typing `I.e.` never catches the I. A marked numeral converts as its
			// suffix is completed.
			const typed = state.sliceDoc(cursor.head - 1, cursor.head);
			const closesMarker = settings.markers && typed === settings.suffix.slice(-1);
			if (typed !== " " && !closesMarker) return;
			const end = typed === " " ? cursor.head - 1 : cursor.head;

			// Only the note up to the end of this line can affect the match.
			const text = state.sliceDoc(0, state.doc.lineAt(cursor.head).to);
			const match = findNumerals(text, settings).find((found) => found.to === end);
			if (!match) return;

			// The editor can't take a new change while it is still applying this one.
			queueMicrotask(() =>
				view.dispatch({
					changes: { from: match.from, to: match.to, insert: match.text },
					annotations: isolateHistory.of("full"),
				}),
			);
		}),
	];
}

/** Replaces every match in the open note in one undoable step, and returns how many there were. */
export function applyToNote(editor: Editor, matches: Match[]): number {
	editor.transaction({
		changes: matches.map(({ from, to, text }) => ({ from: editor.offsetToPos(from), to: editor.offsetToPos(to), text })),
	});
	return matches.length;
}
