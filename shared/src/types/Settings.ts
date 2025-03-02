import { IndexerSettings } from "./Indexer";
import { ChatMessages } from "./Message";

export const defaultMaxTokens = -1;

export interface WorkspaceSettings {
	indexerSettings: IndexerSettings;
	chatMessages: ChatMessages;
}

export interface AppState {
	settings: WorkspaceSettings;
	theme: number;
	workspaceFolder: string;
	totalFiles: number;
}

interface BaseServiceSettings {
	chatModel: string;
	codeModel: string;
	baseUrl: string;
}

export interface BaseEmbeddingServiceSettings {
	embeddingModel: string;
	dimensions: string;
	enabled: boolean;
}

export interface ValidationSettings {
	validationCommand?: string;
}

export interface InteractionSettings {
	codeCompletionEnabled: boolean;
	codeStreaming: boolean;
	codeContextWindow: number;
	codeMaxTokens: number;
	chatContextWindow: number;
	chatMaxTokens: number;
}

export const AiProviders = [
	"Ollama",
	"HuggingFace",
	"OpenAI",
	"Anthropic",
	"AzureAI",
] as const;
export const AiProvidersList: string[] = [...AiProviders];

// Create a type for AiProviders
export type AiProviders = (typeof AiProviders)[number];

export const EmbeddingProviders = ["Ollama", "OpenAI", "AzureAI"] as const;
export const EmbeddingProvidersList: string[] = [...EmbeddingProviders];

// Create a type for EmbeddingProviders
export type EmbeddingProviders = (typeof EmbeddingProviders)[number];

export type OllamaSettingsType = BaseServiceSettings & {
	apiPath: string;
	modelInfoPath: string;
};

export type OllamaEmbeddingSettingsType = BaseEmbeddingServiceSettings & {
	baseUrl: string;
};

export type OpenAIEmbeddingSettingsType = BaseEmbeddingServiceSettings & {
	apiKey: string;
};

export type AzureAIEmbeddingSettingsType = BaseEmbeddingServiceSettings & {
	apiKey: string;
	apiVersion: string;
	instanceName: string;
};

export type ApiSettingsType = BaseServiceSettings & {
	apiKey: string;
};

export type AzureAISettingsType = Omit<ApiSettingsType, "baseUrl"> & {
	apiVersion: string;
	instanceName: string;
};

export const defaultInteractionSettings: InteractionSettings = {
	codeCompletionEnabled: true,
	codeStreaming: false,
	codeContextWindow: 256,
	codeMaxTokens: 128,
	chatContextWindow: 4096,
	chatMaxTokens: 4096,
};

export const defaultValidationSettings: ValidationSettings = {
	validationCommand: "",
};

export const defaultOllamaSettings: OllamaSettingsType = {
	codeModel: "deepseek-coder-v2:16b-lite-base-q4_0",
	chatModel: "deepseek-coder-v2:16b-lite-instruct-q4_0",
	baseUrl: "http://localhost:11434",
	apiPath: "/api/generate",
	modelInfoPath: "/api/show",
};

export const defaultOllamaEmbeddingSettings: OllamaEmbeddingSettingsType = {
	embeddingModel: "mxbai-embed-large",
	baseUrl: "http://localhost:11434",
	dimensions: "1024",
	enabled: true,
};

export const defaultHfSettings: ApiSettingsType = {
	codeModel: "codellama/CodeLlama-7b-hf",
	chatModel: "mistralai/Mixtral-8x7B-Instruct-v0.1",
	baseUrl: "https://api-inference.huggingface.co/models/",
	apiKey: "",
};

export const defaultOpenAISettings: ApiSettingsType = {
	chatModel: "gpt-4o-2024-08-06",
	codeModel: "gpt-4o-2024-08-06",
	baseUrl: "https://api.openai.com/v1/chat/completions",
	apiKey: "",
};

export const defaultOpenAIEmbeddingSettings: OpenAIEmbeddingSettingsType = {
	embeddingModel: "text-embedding-ada-002",
	dimensions: "1536",
	apiKey: "",
	enabled: true,
};

export const defaultAzureAIEmbeddingSettings: AzureAIEmbeddingSettingsType = {
	embeddingModel: "text-embedding-ada-002",
	dimensions: "1536",
	apiKey: "",
	apiVersion: "",
	instanceName: "",
	enabled: true,
};

export const defaultAnthropicSettings: ApiSettingsType = {
	chatModel: "claude-3-5-sonnet-latest",
	codeModel: "claude-3-5-haiku-latest",
	baseUrl: "https://api.anthropic.com/v1",
	apiKey: "",
};

export const defaultAzureAISettings: AzureAISettingsType = {
	chatModel: "gpt-4o",
	codeModel: "gpt-4o",
	instanceName: "",
	apiKey: "",
	apiVersion: "2024-06-01",
};

export type Settings = {
	aiProvider: (typeof AiProviders)[number];
	interactionSettings: InteractionSettings;
	embeddingProvider: (typeof EmbeddingProviders)[number];
	embeddingSettings: {
		Ollama?: OllamaEmbeddingSettingsType;
		OpenAI?: OpenAIEmbeddingSettingsType;
		AzureAI?: AzureAIEmbeddingSettingsType;
	};
	providerSettings: {
		Ollama?: OllamaSettingsType;
		HuggingFace?: ApiSettingsType;
		OpenAI?: ApiSettingsType;
		Anthropic?: ApiSettingsType;
		AzureAI?: AzureAISettingsType;
	};
	validationSettings: {
		validationCommand?: string;
		midsceneEnabled?: boolean;
	};
};
