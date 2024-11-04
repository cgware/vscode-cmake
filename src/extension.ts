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

	function cmake_refresh() {
		cmake = parseCMake(undefined, new CMake(wf));
		projectProvider.setCMake(cmake);
	}

	context.subscriptions.push(...[
		commands.registerCommand('cgware-vscode-cmake.refresh', _ => {
			cmake_refresh();
			cmake.generate(terminal, projectProvider.config);
		}),
		commands.registerCommand('cgware-vscode-cmake.generate', _ => cmake.generate(terminal, projectProvider.config)),
		commands.registerCommand('cgware-vscode-cmake.config', (config: CMakeConfig) => {
			projectProvider.setConfig(config);
			cmake.generate(terminal, projectProvider.config);
		}),
		commands.registerCommand('cgware-vscode-cmake.build', (target: CMakeTarget) => {
			projectProvider.setTarget(target);
			target.launch(cmake, terminal, projectProvider.config);
		}),
		commands.registerCommand('cgware-vscode-cmake.run', (target: CMakeTarget) => {
			projectProvider.setTarget(target);
			target.launch(cmake, terminal, projectProvider.config);
		}),
		commands.registerCommand('cgware-vscode-cmake.launch', _ => {
			if (!projectProvider.target) {
				window.showErrorMessage('No target selected');
				return;
			}

			projectProvider.target.launch(cmake, terminal, projectProvider.config);
		}),
	]);

	window.registerTreeDataProvider('cgware-vscode-cmake.project', projectProvider);
}

export function deactivate() { }
