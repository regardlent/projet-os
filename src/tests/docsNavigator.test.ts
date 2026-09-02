import test from "node:test";
import assert from "node:assert";
import { navigateDocs, sourcesByCategory } from "../projects/DocsNavigator.js";

test("DocsNavigator: football task resolves to football domain with official sources", () => {
	const info = navigateDocs("Super League suisse, classement et buteurs");
	assert.equal(info.domain, "football");
	assert.ok(info.sources.length > 0);
	assert.ok(info.primary && info.primary.authority === "official");
});

test("DocsNavigator: sourcesByCategory filters STANDINGS for a football task", () => {
	const src = sourcesByCategory("Super League suisse", "standings");
	assert.equal(src.length, 1);
	assert.match(src[0].url, /table|standings/i);
});

test("DocsNavigator: cpp/web detection", () => {
	assert.equal(navigateDocs("Write C++ with Win32").domain, "cpp");
	assert.equal(navigateDocs("Build a React web page").domain, "web");
});

test("DocsNavigator: generic fallback when no domain matches", () => {
	assert.equal(navigateDocs("do something random").domain, "generic");
});
