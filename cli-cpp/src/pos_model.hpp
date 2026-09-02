// pos_model.hpp — Project OS CLI model + I/O (read metadata, list projects).
#pragma once
#include <algorithm>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include "pos_json.hpp"

namespace pos {

// Managed project summary read from the hub registry JSON.
struct ProjectInfo {
	std::string slug;
	std::string name;
	std::string projectId;
	std::string projectType;
	std::string status;
	std::string workspaceRoot;
	std::string goalObjective;
	int goalProgress = 0;
	std::string goalStatus;
};

inline std::string readFile(const std::string& path) {
	std::ifstream f(path, std::ios::binary);
	if (!f) return {};
	std::ostringstream ss; ss << f.rdbuf(); return ss.str();
}

// Parse registry JSON { projects: [...] } into ProjectInfo list.
inline std::vector<ProjectInfo> parseRegistry(const std::string& jsonText) {
	std::vector<ProjectInfo> out;
	JValue root;
	try { root = parseJson(jsonText); } catch (...) { return out; }
	auto* arr = root.get("projects");
	if (!arr || arr->kind != JKind::Array) return out;
	for (auto& e : arr->arr) {
		ProjectInfo pi;
		if (auto* s = e.get("slug")) pi.slug = s->asString();
		if (auto* s = e.get("name")) pi.name = s->asString();
		if (auto* s = e.get("projectId")) pi.projectId = s->asString();
		if (auto* s = e.get("projectType")) pi.projectType = s->asString();
		if (auto* s = e.get("status")) pi.status = s->asString();
		if (auto* s = e.get("workspaceRoot")) pi.workspaceRoot = s->asString();
		if (auto* g = e.get("goal")) {
			if (auto* s = g->get("objective")) pi.goalObjective = s->asString();
			if (auto* s = g->get("status")) pi.goalStatus = s->asString();
			if (auto* s = g->get("progress")) { pi.goalProgress = static_cast<int>(s->number); }
		}
		out.push_back(pi);
	}
	return out;
}

// Goal from project goal.json.
struct GoalInfo { std::string status; std::string objective; int progress = 0; };
inline GoalInfo parseGoal(const std::string& jsonText) {
	GoalInfo g;
	try {
		auto root = parseJson(jsonText);
		if (auto* s = root.get("status")) g.status = s->asString();
		if (auto* s = root.get("objective")) g.objective = s->asString();
		if (auto* s = root.get("progress")) g.progress = static_cast<int>(s->number);
	} catch (...) {}
	return g;
}

// Todo item { key, label, state } from todo.json { items: [...] }.
struct TodoItem { std::string key; std::string label; std::string state; bool done() const { return state == "done"; } };
inline std::vector<TodoItem> parseTodo(const std::string& jsonText) {
	std::vector<TodoItem> out;
	try {
		auto root = parseJson(jsonText);
		auto* items = root.get("items");
		if (items && items->kind == JKind::Array) {
			for (auto& e : items->arr) {
				TodoItem t;
				if (auto* s = e.get("key")) t.key = s->asString();
				if (auto* s = e.get("label")) t.label = s->asString();
				if (auto* s = e.get("state")) t.state = s->asString();
				out.push_back(t);
			}
		}
	} catch (...) {}
	return out;
}

// Escape for a shell argument (Windows cmd / node). Minimal: wrap in double quotes.
inline std::string shellQuote(const std::string& s) {
	std::string out = "\"";
	for (char c : s) { if (c == '"') out += "\\\""; else out += c; }
	out += "\"";
	return out;
}

} // namespace pos
