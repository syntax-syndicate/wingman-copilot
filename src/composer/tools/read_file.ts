import { tool } from "@langchain/core/tools";
import fs, { promises } from "node:fs";
import path from "node:path";
import { baseFileSchema } from "./schemas";
import type { CodeParser } from "../../server/files/parser";
import { getTextDocumentFromPath } from "../../server/files/utils";

export const readFileSchema = baseFileSchema.extend({
	// Additional read-specific properties would go here
});

/**
 * Creates a tool that reads file contents
 */
export const createReadFileTool = (
	workspace: string,
	codeParser: CodeParser,
) => {
	return tool(
		async (input, config) => {
			const filePath = path.isAbsolute(input.path)
				? input.path
				: path.join(workspace, input.path);

			if (!fs.existsSync(filePath)) {
				return "File does not exist (create if required).";
			}

			const textDocument = await getTextDocumentFromPath(filePath);

			if (!textDocument) {
				return "Unable to read file contents. Text document could not be created.";
			}

			const { importEdges, exportEdges } =
				await codeParser.createNodesFromDocument(textDocument);

			return {
				id: config.toolCall.id,
				content: textDocument.getText(),
				path: path.relative(workspace, input.path),
				explanation: input.explanation,
				importedBy: importEdges,
				exportedTo: exportEdges,
			};
		},
		{
			name: "read_file",
			description:
				"Reads the contents of a specific file, includes file path, files that depend on this file (imported by), and files that consume this file (exported to) in response.",
			schema: readFileSchema,
		},
	);
};
