import { Disposable, TerminalShellIntegration, Terminal as VSTerminal, window } from "vscode";

export class Terminal {
	private terminal: VSTerminal | undefined;
	private active: boolean;

	constructor() {
		this.active = false;

		window.onDidCloseTerminal(terminal => {
			if (terminal !== this.terminal) {
				return;
			}

			this.terminal = undefined;
			this.active = false;
		});

		window.onDidChangeActiveTerminal(terminal => {
			this.active = this.terminal === terminal;
		});
	}

	private shell(): Promise<TerminalShellIntegration> {
		return new Promise(resolve => {
			if (!this.terminal) {
				this.terminal = window.createTerminal('cmake');
				this.terminal.show();
				this.active = true;
			}

			if (!this.active) {
				this.terminal.show();
				this.active = true;
			}

			if (this.terminal.shellIntegration !== undefined) {
				resolve(this.terminal.shellIntegration);
				return;
			}

			let disposal: Disposable | undefined = window.onDidChangeTerminalShellIntegration(({ terminal, shellIntegration }) => {
				if (terminal !== this.terminal) {
					return;
				}

				resolve(shellIntegration);
				disposal?.dispose();
				disposal = undefined;
			});
		});
	}

	exec(cmd: string): Promise<void> {
		return new Promise(async (resolve, reject) => {
			try {
				const exe = (await this.shell()).executeCommand(cmd);
				let subshell = false;
				let dispose: Disposable | undefined = window.onDidEndTerminalShellExecution(async event => {
					if (exe === event.execution || subshell) {
						const stream = event.execution.read();
						for await (const _ of stream) { }

						if (event.exitCode === undefined) {
							subshell = true;
							return;
						}

						subshell = false;

						if (event.exitCode === 0) {
							resolve();
						}

						dispose?.dispose();
						dispose = undefined;
					}
				});
			} catch (err) {
				reject(err);
			}
		});
	}
}
