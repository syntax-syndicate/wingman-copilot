export interface ILoggingProvider {
	logInfo(message: string): void;
	logError(message: string): void;
	logError(error: Error | unknown): void;
	dispose(): void;
}