/**
 * McpServerAdapter — wires the official @modelcontextprotocol/sdk v1.30 Server to
 * the bridge tool registry: initialize, tools/list, tools/call with schema
 * validation, JSON-RPC 2.0. Pure adaptation (no vscode import).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { BRIDGE_TOOLS } from "./BridgeToolRegistry.js";
import type { McpBridge } from "./McpBridge.js";

export interface WireResult {
	server: Server;
	toolsCount: number;
}

/** Create the SDK server bound to a McpBridge. */
export function wireMcpServer(bridge: McpBridge): WireResult {
	const server = new Server({ name: "project-os-bridge", version: "0.1.0" }, { capabilities: { tools: {} } });

	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: BRIDGE_TOOLS.map((t) => ({
			name: t.name,
			description: t.description,
			inputSchema: {
				type: "object",
				properties: t.properties,
				required: t.required,
			},
		})),
	}));

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const name = request.params.name;
		const args = (request.params.arguments as Record<string, unknown>) ?? {};
		const res = await bridge.invokeWrapped(name, args, process.cwd());
		return { content: [{ type: "text" as const, text: res.text }], isError: !res.ok };
	});

	return { server, toolsCount: BRIDGE_TOOLS.length };
}

export type { Server as McpServer };