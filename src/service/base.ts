import type { AIModel } from "@shared/types/Models";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Embeddings } from "@langchain/core/embeddings";

export type ModelParams = {
	temperature?: number;
	model?: string;
	verbose?: boolean;
};

export interface AIProvider {
	chatModel: AIModel | undefined;
	codeModel: AIModel | undefined;
	validateSettings(): Promise<boolean>;
	addMessageToHistory(input: string): void;
	clearChatHistory(): void;
	codeComplete(
		beginning: string,
		ending: string,
		signal: AbortSignal,
		additionalContext?: string,
		recentClipboard?: string,
	): Promise<string>;
	chat(
		prompt: string,
		ragContent: string,
		signal: AbortSignal,
	): AsyncGenerator<string>;
	genCodeDocs(
		prompt: string,
		ragContent: string,
		signal: AbortSignal,
	): Promise<string>;
	refactor(
		prompt: string,
		ragContent: string,
		signal: AbortSignal,
	): Promise<string>;
	getModel(params?: ModelParams): BaseChatModel;
	getEmbedder(): Embeddings;
	getLightweightModel(): BaseChatModel;
}

export interface AIStreamProvider extends AIProvider {
	codeCompleteStream(
		beginning: string,
		ending: string,
		signal: AbortSignal,
		additionalContext?: string,
		recentClipboard?: string,
	): Promise<string>;
}
