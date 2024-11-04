import { Terminal as VSTerminal, window } from "vscode";

export class Terminal {
	private terminal: VSTerminal | undefined;

	constructor() {
		window.onDidCloseTerminal((closedTerminal) => {
			if (closedTerminal === this.terminal) {
				this.terminal = undefined;
			}
		});
	}

	exec(cmd: string) {
		this.terminal = this.terminal || window.createTerminal('cmake');
		this.terminal.show();
		this.terminal.sendText(cmd, true);
	}
}
