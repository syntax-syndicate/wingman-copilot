import * as vscode from "vscode";
import { OllamaRequest, OllamaResponse } from "./types";
import { asyncIterator } from "../asyncIterator";
import { AIProvider } from "../base";
import { Settings, defaultMaxTokens } from "../../types/Settings";
import { OllamaAIModel } from "../../types/Models";
import { CodeLlama } from "./models/codellama";
import { Deepseek } from "./models/deepseek";
import { PhindCodeLlama } from "./models/phind-codellama";
import { loggingProvider } from "../../providers/loggingProvider";
import { eventEmitter } from "../../events/eventEmitter";

export class Ollama implements AIProvider {
	decoder = new TextDecoder();
	settings: Settings["ollama"];
	chatHistory: number[] = [];
	chatModel: OllamaAIModel | undefined;
	codeModel: OllamaAIModel | undefined;

	constructor() {
		const config = vscode.workspace.getConfiguration("Wingman");

		const ollamaConfig = config.get<Settings["ollama"]>("Ollama");

		loggingProvider.logInfo(
			`Ollama settings loaded: ${JSON.stringify(ollamaConfig)}`
		);

		if (!ollamaConfig) {
			this.handleError("Unable to load Ollama settings.");
			return;
		}

		this.settings = ollamaConfig;

		this.chatModel = this.getChatModel(this.settings.chatModel);
		this.codeModel = this.getCodeModel(this.settings.codeModel);

		this.validateSettings();
	}

	private handleError(message: string) {
		vscode.window.showErrorMessage(message);
		loggingProvider.logError(message);
		eventEmitter._onFatalError.fire();
		throw new Error(message);
	}

	private async validateSettings() {
		if (
			!(await this.validateModelExists(
				this.settings?.chatModel ?? "unknown"
			))
		) {
			this.handleError(
				`Unable to verify Ollama has chat model: ${this.settings?.chatModel}, have you pulled the model or is the config wrong?`
			);
		}

		if (
			!(await this.validateModelExists(
				this.settings?.codeModel ?? "unknown"
			))
		) {
			this.handleError(
				`Unable to verify Ollama has code model: ${this.settings?.codeModel}, have you pulled the model or is the config wrong?`
			);
		}
	}

	private getCodeModel(codeModel: string): OllamaAIModel | undefined {
		switch (true) {
			case codeModel.startsWith("codellama"):
				return new CodeLlama();
			case codeModel.startsWith("deepseek"):
				return new Deepseek();
			default:
				this.handleError(
					"Invalid code model name, currently code supports CodeLlama and Deepseek models."
				);
		}
	}

	private getChatModel(chatModel: string): OllamaAIModel | undefined {
		switch (true) {
			case chatModel.startsWith("codellama"):
				return new CodeLlama();
			case chatModel.startsWith("deepseek"):
				return new Deepseek();
			case chatModel.startsWith("phind"):
				return new PhindCodeLlama();
			default:
				this.handleError(
					"Invalid chat model name, currently chat supports CodeLlama, Phind CodeLlama and Deepseek models."
				);
		}
	}

	public async validateModelExists(modelName: string): Promise<boolean> {
		try {
			const response = await fetch(
				new URL(
					`${this.settings?.baseUrl}${this.settings?.modelInfoPath}`
				),
				{
					method: "POST",
					body: JSON.stringify({
						name: modelName,
					}),
				}
			);

			if (response.status === 200) {
				return true;
			}
		} catch (error) {
			loggingProvider.logInfo(JSON.stringify(error));
		}

		return false;
	}

	private async fetchModelResponse(
		payload: OllamaRequest,
		signal: AbortSignal
	) {
		if (signal.aborted) {
			return undefined;
		}
		return fetch(
			new URL(`${this.settings?.baseUrl}${this.settings?.apiPath}`),
			{
				method: "POST",
				body: JSON.stringify(payload),
				signal,
			}
		);
	}

	async *generate(payload: OllamaRequest, signal: AbortSignal) {
		const startTime = new Date().getTime();
		let response: Response | undefined;

		try {
			response = await this.fetchModelResponse(payload, signal);
		} catch (error) {
			loggingProvider.logError(
				`Ollama chat request with model: ${payload.model} failed with the following error: ${error}`
			);
		}

		if (!response?.body) {
			return "";
		}

		const endTime = new Date().getTime();
		const executionTime = (endTime - startTime) / 1000;

		loggingProvider.logInfo(
			`Ollama - Chat Time To First Token execution time: ${executionTime} seconds`
		);

		for await (const chunk of asyncIterator(response.body)) {
			if (signal.aborted) return;
			const jsonString = this.decoder.decode(chunk);
			// we can have more then one ollama response
			const jsonStrings = jsonString
				.replace(/}\n{/gi, "}\u241e{")
				.split("\u241e");
			try {
				for (const json of jsonStrings) {
					const result = JSON.parse(json) as OllamaResponse;
					yield result;
				}
			} catch (e) {
				console.warn(e);
				console.log(jsonString);
			}
		}
	}

	public async codeComplete(
		beginning: string,
		ending: string,
		signal: AbortSignal
	): Promise<string> {
		const startTime = new Date().getTime();

		const codeRequestOptions: OllamaRequest = {
			model: this.settings?.codeModel!,
			prompt: this.codeModel!.CodeCompletionPrompt.replace(
				"{beginning}",
				beginning
			).replace("{ending}", ending),
			stream: false,
			raw: true,
			options: {
				temperature: 0.3,
				num_predict: this.settings?.codeMaxTokens ?? defaultMaxTokens,
				top_k: 30,
				top_p: 0.2,
				repeat_penalty: 1.3,
				stop: ["<｜end▁of▁sentence｜>", "<｜EOT｜>", "\\n", "</s>"],
			},
		};

		let response: Response | undefined;

		try {
			response = await this.fetchModelResponse(
				codeRequestOptions,
				signal
			);
		} catch (error) {
			loggingProvider.logError(
				`Ollama - code completion request with model ${this.settings?.codeModel} failed with the following error: ${error}`
			);
		}

		const endTime = new Date().getTime();
		const executionTime = (endTime - startTime) / 1000;

		loggingProvider.logInfo(
			`Ollama - Code Completion execution time: ${executionTime} seconds`
		);

		if (!response?.body) {
			return "";
		}

		const ollamaResponse = (await response.json()) as OllamaResponse;
		return ollamaResponse.response;
	}

	public clearChatHistory(): void {
		this.chatHistory = [];
	}

	public async *chat(
		prompt: string,
		ragContent: string,
		signal: AbortSignal
	) {
		let systemPrompt = this.chatModel!.ChatPrompt;

		if (ragContent) {
			systemPrompt += `Here's some additional information that may help you generate a more accurate response.
            Please determine if this information is relevant and can be used to supplement your response: 
            ${ragContent}`;
		}

		systemPrompt = systemPrompt.replace(/\t/, "");

		const chatPayload: OllamaRequest = {
			model: this.settings?.chatModel!,
			prompt,
			system: systemPrompt,
			stream: true,
			context: this.chatHistory,
			options: {
				num_predict: this.settings?.chatMaxTokens ?? defaultMaxTokens,
				temperature: 0.6,
				top_k: 30,
				top_p: 0.2,
			},
		};

		this.clearChatHistory();

		for await (const chunk of this.generate(chatPayload, signal)) {
			const { response, context } = chunk;
			this.chatHistory = this.chatHistory.concat(context);
			yield response;
		}
	}
}