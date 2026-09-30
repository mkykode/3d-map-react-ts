import { defineConfig } from "cf/config";

export default defineConfig({
	// monkeykode account; this login spans several client accounts.
	accountId: "561ba4939b67d590e3dbfeb0b4d700da",
	worker: {
		name: "trace-topography",
		compatibilityDate: "2026-08-20",
		assets: {
			notFoundHandling: "single-page-application",
		},
		domains: ["trace.monkeykode.com"],
	},
});
