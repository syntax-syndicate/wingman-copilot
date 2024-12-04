import path from "node:path";

interface DiffOptions {
	includeStagedChanges?: boolean;
	includeUnstagedChanges?: boolean;
	includeUntrackedFiles?: boolean;
	includeCommittedChanges?: boolean;
	pathSpec?: string;
}
	public async generateDiffWithLineNumbersAndMap(params: DiffOptions = {
		includeStagedChanges: true,
		includeUnstagedChanges: true,
		includeUntrackedFiles: true,
		includeCommittedChanges: false
	}): Promise<
		const diffs = await this.getDiff(params);

	public async getDiff(options: DiffOptions = {}): Promise<string> {
		const {
			includeStagedChanges = true,
			includeUnstagedChanges = true,
			includeUntrackedFiles = false,
			includeCommittedChanges = true,
			pathSpec = ''
		} = options;

		let diffCommands: string[] = [];

		try {
			// First check if git is available
			try {
				await this.executeGitCommand('git --version');
			} catch (error) {
				vscode.window.showErrorMessage('Git is not available in the current workspace');
				return '';
			}

			// Check if we're in a git repository
			try {
				await this.executeGitCommand('git rev-parse --git-dir');
			} catch (error) {
				vscode.window.showErrorMessage('Current workspace is not a git repository');
				return '';
			}

			// Get the base branch and handle cases where there's no upstream
			let baseBranch: string;
			try {
				baseBranch = await this.getBaseBranch();
			} catch (error) {
				// No upstream, try to detect main/master branch
				const branches = await this.executeGitCommand('git branch --format="%(refname:short)"');
				baseBranch = branches.split('\n').find(b => ['main', 'master'].includes(b)) || 'HEAD~1';
			}

			// Get merge base, fallback to first commit if no common ancestor
			let mergeBase: string;
			try {
				mergeBase = await this.executeGitCommand(`git merge-base HEAD ${baseBranch}`);
			} catch (error) {
				try {
					// Fallback to first commit
					mergeBase = await this.executeGitCommand('git rev-list --max-parents=0 HEAD');
				} catch (innerError) {
					// If all else fails, use HEAD~1
					mergeBase = 'HEAD~1';
				}
			}

			if (includeCommittedChanges) {
				// Get all changes against base branch including working directory
				try {
					const allChanges = await this.executeGitCommand(`git diff ${mergeBase} ${pathSpec}`);
					if (allChanges) {
						diffCommands.push(allChanges);
					}
				} catch (error) {
					console.warn('Failed to get branch changes:', error);
				}
			}

			// Get staged changes that aren't committed
			if (includeStagedChanges) {
				try {
					const stagedDiff = await this.executeGitCommand(`git diff --staged ${pathSpec}`);
					if (stagedDiff) {
						diffCommands.push(stagedDiff);
					}
				} catch (error) {
					console.warn('Failed to get staged changes:', error);
				}
			}

			// Get unstaged changes in tracked files
			if (includeUnstagedChanges) {
				try {
					const unstagedDiff = await this.executeGitCommand(`git diff ${pathSpec}`);
					if (unstagedDiff) {
						diffCommands.push(unstagedDiff);
					}
				} catch (error) {
					console.warn('Failed to get unstaged changes:', error);
				}
			}

			// Get untracked files
			if (includeUntrackedFiles) {
				try {
					const untrackedFiles = await this.executeGitCommand('git ls-files --others --exclude-standard');
					if (untrackedFiles) {
						const files = untrackedFiles.split('\n').filter(Boolean);
						for (const file of files) {
							try {
								// Use fs.readFile instead of git diff for untracked files
								const absolutePath = path.join(this.cwd, file);
								const content = await vscode.workspace.fs.readFile(vscode.Uri.file(absolutePath));
								const fileContent = Buffer.from(content).toString('utf-8');

								// Generate diff-like output for untracked files
								diffCommands.push([
									`diff --git a/${file} b/${file}`,
									'new file mode 100644',
									'index 0000000..0000000',
									'--- /dev/null',
									`+++ b/${file}`,
									'@@ -0,0 +1,' + fileContent.split('\n').length + ' @@',
									...fileContent.split('\n').map(line => '+' + line)
								].join('\n'));
							} catch (error) {
								console.warn(`Failed to process untracked file ${file}:`, error);
							}
						}
					}
				} catch (error) {
					console.warn('Failed to get untracked files:', error);
				}
			}

			// Return combined diffs or empty string
			const combinedDiff = diffCommands.filter(Boolean).join('\n');
			if (!combinedDiff) {
				vscode.window.showInformationMessage('No changes detected in the workspace');
			}
			return combinedDiff;

		} catch (error) {
			console.error('Error generating diff:', error);
			vscode.window.showErrorMessage('Failed to generate diff. See console for details.');
			return '';
		}
	}
