import {
	DocumentSymbol,
	Location,
	LocationLink,
} from "vscode-languageclient/node";
import { Range } from "vscode-languageserver-textdocument";

export const mapLocation = (location: Location | LocationLink) => {
	if ("targetUri" in location) {
		// Handle LocationLink
		return {
			uri: location.targetUri.toString(),
			range: {
				start: {
					line: location.targetRange.start.line,
					character: location.targetRange.start.character,
				},
				end: {
					line: location.targetRange.end.line,
					character: location.targetRange.end.character,
				},
			},
		};
	} else {
		// Handle Location
		return {
			uri: location.uri.toString(),
			range: {
				start: {
					line: location.range.start.line,
					character: location.range.start.character,
				},
				end: {
					line: location.range.end.line,
					character: location.range.end.character,
				},
			},
		};
	}
};

export const mapSymbol = (symbol: DocumentSymbol): DocumentSymbol => ({
	name: symbol.name,
	kind: symbol.kind,
	range: mapRange(symbol.range),
	selectionRange: mapRange(symbol.selectionRange),
	children: symbol.children
		? symbol.children.map((child) => ({
				name: child.name,
				kind: child.kind,
				range: mapRange(child.range),
				selectionRange: mapRange(child.selectionRange),
				children: [], // Assuming no nested children for simplicity
		  }))
		: [],
});

export const mapRange = (range: Range): Range => ({
	start: {
		line: range.start.line,
		character: range.start.character,
	},
	end: {
		line: range.end.line,
		character: range.end.character,
	},
});