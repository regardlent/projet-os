import test from "node:test";
import assert from "node:assert";
import { toRouterModel, enduranceProjectCreationRoute, hasProjectCreationRoute, PROJECT_CREATION_CAPABILITIES } from "../projects/EnduranceRouter.js";

test("endurance router: a FLASH_READY model with proven caps is selected", () => {
	const route = enduranceProjectCreationRoute([
		{ modelId: "granite-4.2-3b-flash", alias: "granite-4.2-3b-flash", status: "FLASH_READY", provenCapabilities: ["CODING", "TOOLS", "GENERAL", "JSON"] },
	]);
	assert.equal(route.primary, "granite-4.2-3b-flash");
	assert.equal(hasProjectCreationRoute([{ modelId: "g", alias: "g", status: "FLASH_READY", provenCapabilities: ["CODING", "TOOLS", "GENERAL", "JSON"] }]), true);
});

test("endurance router: unproven/not-flash-ready are excluded with GPU_BLOCKED / CAPABILITY_UNPROVEN", () => {
	const route = enduranceProjectCreationRoute([
		{ modelId: "prepared", alias: "prepared", status: "PREPARED_VERIFIED", provenCapabilities: ["CODING"] },
		{ modelId: "flash-unproven", alias: "flash-unproven", status: "FLASH_READY", provenCapabilities: ["CODING"] },
	]);
	assert.equal(route.primary, null);
	assert.ok(route.excluded.some((e) => e.modelId === "prepared" && e.reason === "GPU_BLOCKED"));
	assert.ok(route.excluded.some((e) => e.modelId === "flash-unproven" && e.reason === "CAPABILITY_UNPROVEN"));
	assert.equal(hasProjectCreationRoute([{ modelId: "p", alias: "p", status: "PREPARED_VERIFIED", provenCapabilities: ["CODING"] }]), false);
});

test("endurance router: a MODEL_READY_CPU model is excluded (no CPU escape)", () => {
	const route = enduranceProjectCreationRoute([
		{ modelId: "deepseek", alias: "deepseek-r1-1.5b-flash", status: "MODEL_READY_CPU", provenCapabilities: ["CODING", "REASONING", "MATH"] },
	]);
	assert.equal(route.primary, null);
	assert.ok(route.excluded.some((e) => e.modelId === "deepseek" && e.reason === "GPU_BLOCKED"));
});

test("endurance router: toRouterModel maps a capabilityDetail BLOCKED_DEPENDENCY correctly", () => {
	const m = toRouterModel({ modelId: "x", alias: "x", status: "FLASH_READY", provenCapabilities: ["CODING"], capabilityDetail: { GENERAL: "BLOCKED_DEPENDENCY" } });
	assert.equal(m.capability.GENERAL, "BLOCKED_DEPENDENCY");
	assert.equal(m.capability.CODING, "PROVEN");
	assert.equal(PROJECT_CREATION_CAPABILITIES.length, 4);
});
