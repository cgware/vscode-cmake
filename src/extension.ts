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

	cmake_refresh();

	workspace.onDidSaveTextDocument((document) => {
		const path = document.fileName;
		if (!cmake.files.includes(path)) {
			return;
		}

		commands.executeCommand('cgware-vscode-cmake.refresh');
	});

	function cmake_refresh(): Promise<void> {
		cmake = parseCMake(undefined, new CMake(wf));
		projectProvider.setCMake(cmake);
		return cmake.generate(terminal, projectProvider.config);
	}

	context.subscriptions.push(...[
		commands.registerCommand('cgware-vscode-cmake.refresh', async _ => {
			await cmake_refresh();
		}),
		commands.registerCommand('cgware-vscode-cmake.generate', async _ => await cmake.generate(terminal, projectProvider.config)),
		commands.registerCommand('cgware-vscode-cmake.config', async (config: CMakeConfig) => {
			projectProvider.setConfig(config);
			await cmake.generate(terminal, projectProvider.config);
		}),
		commands.registerCommand('cgware-vscode-cmake.build', async (target: CMakeTarget) => {
			projectProvider.setTarget(target);
			await target.launch(cmake, terminal, projectProvider.config);
		}),
		commands.registerCommand('cgware-vscode-cmake.run', async (target: CMakeTarget) => {
			projectProvider.setTarget(target);
			await target.launch(cmake, terminal, projectProvider.config);
		}),
		commands.registerCommand('cgware-vscode-cmake.launch', async _ => {
			if (!projectProvider.target) {
				window.showErrorMessage('No target selected');
				return;
			}

			await projectProvider.target.launch(cmake, terminal, projectProvider.config);
		}),
	]);

	window.registerTreeDataProvider('cgware-vscode-cmake.project', projectProvider);
}

export function deactivate() { }
