import { CMake, CMakeConfig, CMakeTarget } from './cmake';
import { Terminal } from './terminal';
import { parseCMake } from './parseCMake';
import { ProjectProvider } from './projectProvider';
import { commands, ExtensionContext, window, workspace } from 'vscode';

export function activate(context: ExtensionContext) {
	if (workspace.workspaceFolders === undefined) {
		window.showErrorMessage('CMake: Working folder not found, open a folder and try again');
		return;
	}

	const wf = workspace.workspaceFolders[0].uri.fsPath;

	let terminal = new Terminal();
	let cmake: CMake = new CMake(wf);
	const projectProvider = new ProjectProvider(cmake);

	commands.executeCommand('cgware-vscode-cmake.generate');

	workspace.onDidSaveTextDocument((document) => {
		const path = document.fileName;
		if (!cmake.files.includes(path)) {
			return;
		}

		commands.executeCommand('cgware-vscode-cmake.generate');
	});

	function registerCommand(cmd: string, action: (...args: any[]) => Promise<void>) {
		return commands.registerCommand(cmd, async (args: any[]) => {
			try {
				await action(args);
			} catch (err) {
				window.showErrorMessage(err as string);
			}
		});
	}

	context.subscriptions.push(...[
		registerCommand('cgware-vscode-cmake.generate', _ => {
			cmake = parseCMake(undefined, new CMake(wf));
			projectProvider.setCMake(cmake);
			return cmake.generate(terminal, projectProvider.config, projectProvider.arch);
		}),
		registerCommand('cgware-vscode-cmake.config', (config: CMakeConfig) => {
			projectProvider.setConfig(config);
			return cmake.generate(terminal, projectProvider.config, projectProvider.arch);
		}),
		registerCommand('cgware-vscode-cmake.arch', async (arch: string) => {
			projectProvider.setArch(arch);
			return cmake.generate(terminal, projectProvider.config, projectProvider.arch);
		}),
		registerCommand('cgware-vscode-cmake.debugger', async (dbg: string) => {
			projectProvider.setDebugger(dbg);
		}),
		registerCommand('cgware-vscode-cmake.build', (target: CMakeTarget) => {
			projectProvider.setTarget(target);
			return target.launch(cmake, terminal, projectProvider.config, projectProvider.arch, projectProvider.dbg);
		}),
		registerCommand('cgware-vscode-cmake.run', (target: CMakeTarget) => {
			projectProvider.setTarget(target);
			return target.launch(cmake, terminal, projectProvider.config, projectProvider.arch, projectProvider.dbg);
		}),
		registerCommand('cgware-vscode-cmake.launch', _ => {
			if (!projectProvider.target) {
				throw Error('No target selected');
			}
			return projectProvider.target.launch(cmake, terminal, projectProvider.config, projectProvider.arch, projectProvider.dbg);
		}),
	]);

	window.registerTreeDataProvider('cgware-vscode-cmake.project', projectProvider);
}

export function deactivate() { }
