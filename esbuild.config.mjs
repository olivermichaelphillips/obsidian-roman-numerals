import esbuild from "esbuild";

const production = process.argv[2] === "production";

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	// Obsidian supplies these at runtime, so they stay out of the bundle.
	external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
	format: "cjs",
	target: "es2022",
	sourcemap: production ? false : "inline",
	minify: production,
	outfile: "main.js",
	logLevel: "info",
});

if (production) {
	await context.rebuild();
	await context.dispose();
} else {
	await context.watch();
}
