import { PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type { NumeralSettings } from "./numerals";
import type RomanNumeralsPlugin from "./main";

export interface Settings extends NumeralSettings {
	/** `render` draws numerals on screen only; `write` stores them in the note. */
	mode: "render" | "write";
	/** In write mode, convert numerals as they are typed. */
	convertAsYouType: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
	mode: "render",
	convertAsYouType: true,
	headings: true,
	lists: true,
	delimiters: ".)",
	markers: true,
	prefix: "{",
	suffix: "}",
	lowercase: false,
	nine: true,
	numberedLists: false,
};

type Key = keyof Settings;

export class RomanNumeralsSettingTab extends PluginSettingTab {
	constructor(private readonly plugin: RomanNumeralsPlugin) {
		super(plugin.app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem<Key>[] {
		return [
			{
				name: "Mode",
				desc: "Render shows numeral characters without changing your notes. Write stores the numeral characters in the note.",
				control: { type: "dropdown", key: "mode", options: { render: "Render", write: "Write" } },
			},
			{
				name: "Convert as you type",
				desc: "Convert a heading or list numeral when you type the space after its delimiter, and a marked numeral when you close its marker. Undo brings the letters back.",
				control: { type: "toggle", key: "convertAsYouType" },
				visible: () => this.plugin.settings.mode === "write",
			},
			{
				type: "group",
				heading: "Where numerals are recognised",
				items: [
					{
						name: "Headings",
						desc: "A numeral at the start of a heading, like ## IV. Methods",
						control: { type: "toggle", key: "headings" },
					},
					{
						name: "List items",
						desc: "A numeral at the start of a list item, like - II) Point",
						control: { type: "toggle", key: "lists" },
					},
					{
						name: "Delimiters",
						desc: "Characters that must follow a heading or list numeral, then a space. This is what tells IV. Methods apart from I think.",
						control: { type: "text", key: "delimiters", validate: validateDelimiters },
					},
					{
						name: "Markers",
						desc: "A numeral wrapped in the prefix and suffix below, anywhere in a note, like {IV}. The markers are hidden or removed.",
						control: { type: "toggle", key: "markers" },
					},
					{
						name: "Marker prefix",
						desc: "Typed before a marked numeral.",
						control: { type: "text", key: "prefix", validate: validateMarker },
					},
					{
						name: "Marker suffix",
						desc: "Typed after a marked numeral.",
						control: { type: "text", key: "suffix", validate: validateMarker },
					},
				],
			},
			{
				type: "group",
				heading: "Numerals",
				items: [
					{
						name: "Include IX",
						desc: "Recognise IX as nine. A lone X is never converted, so maths is safe.",
						control: { type: "toggle", key: "nine" },
					},
					{
						name: "Lowercase",
						desc: "Also recognise lowercase numerals, so i. becomes ⅰ.",
						control: { type: "toggle", key: "lowercase" },
					},
					{
						name: "Numbered lists",
						desc: "Show numbered lists as Ⅰ. Ⅱ. Ⅲ. instead of 1. 2. 3. This is on screen only, in both modes, so the note stays a numbered list in other apps. Numbers from 10 stay as they are.",
						control: { type: "toggle", key: "numberedLists" },
					},
				],
			},
		];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		Object.assign(this.plugin.settings, { [key]: value });
		await this.plugin.saveSettings();
		// Show or hide the settings that depend on the mode.
		this.refreshDomState();
	}
}

function validateDelimiters(value: string): string | void {
	if (!value) return "Add at least one delimiter, or turn off headings and list items.";
	if (/[\sIVXivx]/.test(value)) return "Delimiters can't include spaces or the letters I, V and X.";
}

function validateMarker(value: string): string | void {
	if (!value) return "Markers need both a prefix and a suffix.";
	if (/[IVXivx]/.test(value)) return "Markers can't include the letters I, V and X.";
}
