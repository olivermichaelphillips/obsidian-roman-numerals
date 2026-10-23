import type { Extension } from "@codemirror/state";
import { Notice, Plugin } from "obsidian";
import { findNumeralCharacters, findNumerals } from "./numerals";
import { editorNumerals, readingViewNumerals } from "./render";
import { DEFAULT_SETTINGS, RomanNumeralsSettingTab, type Settings } from "./settings";
import { applyToNote, convertAsYouType } from "./write";

export default class RomanNumeralsPlugin extends Plugin {
	settings: Settings = { ...DEFAULT_SETTINGS };

	// Obsidian keeps a reference to this array, so it is emptied and refilled rather than replaced.
	private readonly editorExtensions: Extension[] = [];

	async onload() {
		Object.assign(this.settings, await this.loadData());

		this.registerEditorExtension(this.editorExtensions);
		this.updateEditors();

		this.registerMarkdownPostProcessor((section) => {
			readingViewNumerals(section, this.settings, this.settings.mode === "render");
		});

		this.addCommand({
			id: "convert-note",
			name: "Write numeral characters into this note",
			editorCallback: (editor) => {
				const count = applyToNote(editor, findNumerals(editor.getValue(), this.settings));
				new Notice(`Converted ${count} ${count === 1 ? "numeral" : "numerals"}.`);
			},
		});

		this.addCommand({
			id: "revert-note",
			name: "Change numeral characters in this note back to letters",
			editorCallback: (editor) => {
				const count = applyToNote(editor, findNumeralCharacters(editor.getValue()));
				new Notice(`Reverted ${count} ${count === 1 ? "numeral" : "numerals"}.`);
			},
		});

		this.addSettingTab(new RomanNumeralsSettingTab(this));
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.updateEditors();
	}

	/** Loads the editor behaviour for the current mode into every open editor. */
	private updateEditors() {
		const { mode } = this.settings;
		this.editorExtensions.length = 0;
		this.editorExtensions.push(editorNumerals(this.settings, mode === "render"));
		if (mode === "write" && this.settings.convertAsYouType) this.editorExtensions.push(convertAsYouType(this.settings));
		this.app.workspace.updateOptions();
	}
}
