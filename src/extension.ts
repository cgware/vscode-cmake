import * as vscode from 'vscode';
import { existsSync, readFileSync } from 'fs';

class CMakeRun {
	public name: string;
	public file: string;

	constructor(name: string, file: string) {
		this.name = name;
		this.file = file;
	}
}

class CMake {
	public files: string[] = [];
	public build: string[] = ['all', 'clean'];
	public run: CMakeRun[] = [];
}

class ProjectItem extends vscode.TreeItem {
	constructor(label: string) {
		super(label);
	}

	getChildren(): ProjectItem[] {
		return [];
	}
}

class BuildItem extends ProjectItem {
	private cmake: CMake;

	constructor(cmake: CMake) {
		super("Build");
		this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
		this.cmake = cmake;
	}

	getChildren(): ProjectItem[] {
		const children: ProjectItem[] = [];

		this.cmake.build.forEach(build => {
			children.push(new BuildTargetItem(build));
		});

		return children;
	}
}

class BuildTargetItem extends ProjectItem {
	constructor(label: string) {
		super(label);
		this.collapsibleState = vscode.TreeItemCollapsibleState.None;
		this.command = {
			command: 'cgware-vscode-cmake.build.target',
			title: 'Build ' + label,
			arguments: [label]
		};
	}
}

class RunItem extends ProjectItem {
	private cmake: CMake;

	constructor(cmake: CMake) {
		super("Run");
		this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
		this.cmake = cmake;
	}

	getChildren(): ProjectItem[] {
		const children: ProjectItem[] = [];

		this.cmake.run.forEach(run => {
			children.push(new RunTargetItem(run));
		});

		return children;
	}
}

class RunTargetItem extends ProjectItem {
	constructor(run: CMakeRun) {
		super(run.name);
		this.collapsibleState = vscode.TreeItemCollapsibleState.None;
		this.command = {
			command: 'cgware-vscode-cmake.run.target',
			title: 'Run ' + run.name,
			arguments: [run]
		};
	}
}

class ProjectProvider implements vscode.TreeDataProvider<ProjectItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<ProjectItem | undefined | void> = new vscode.EventEmitter<ProjectItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<ProjectItem | undefined | void> = this._onDidChangeTreeData.event;
	private cmake: CMake;

	constructor(cmake: CMake) {
		this.cmake = cmake;
	}

	getTreeItem(element: ProjectItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: ProjectItem): ProjectItem[] {
		if (!element) {
			return [
				new BuildItem(this.cmake),
				new RunItem(this.cmake),
			];
		}

		return element.getChildren();
	}

	setCMake(cmake: CMake) {
		this.cmake = cmake;
		this._onDidChangeTreeData.fire();
	}
}

export function activate(context: vscode.ExtensionContext) {
	if (vscode.workspace.workspaceFolders === undefined) {
		vscode.window.showErrorMessage('CMake: Working folder not found, open a folder an try again');
		return;
	}

	const wf = vscode.workspace.workspaceFolders[0].uri.fsPath;

	let open = false;
	let terminal: vscode.Terminal;
	let cmake: CMake = new CMake();
	let last_run: CMakeRun | undefined;
	const projectProvider = new ProjectProvider(cmake);

	exec();
	cmake_refresh();

	vscode.window.onDidCloseTerminal((closedTerminal) => {
		if (closedTerminal === terminal) {
			open = false;
		}
	});

	vscode.workspace.onDidSaveTextDocument((document) => {
		const path = document.fileName;
		if (!cmake.files.includes(path)) {
			return;
		}

		vscode.commands.executeCommand('cgware-vscode-cmake.refresh');
	})

	function exec(cmd?: string) {
		if (!open) {
			terminal = vscode.window.createTerminal('cmake');
			terminal.show();
			open = true;
		}

		if (cmd) {
			terminal.sendText(cmd, true);
		}
	}

	function parse_cmake(dir: string, cmake: CMake): CMake {
		let path = dir + '/CMakeLists.txt';
		if (!existsSync(path)) {
			return cmake;
		}

		cmake.files.push(path);

		const f = readFileSync(path, 'utf8');
		const cmds: Array<{ cmd: string; args: string[] }> = []

		const reg = /^\s*(\w+)\s*\(([^)]*)\)\s*$/gm;
		let match;

		while ((match = reg.exec(f)) !== null) {
			const cmd = match[1];
			const args = match[2]
				.split(/\s+/)
				.filter(arg => arg.length > 0);

			cmds.push({ cmd, args })
		}

		cmds.forEach(cmd => {
			switch (cmd.cmd) {
				case 'add_executable': {
					cmake.build.push(cmd.args[0]);
					cmake.run.push(new CMakeRun(cmd.args[0], dir + '/build/' + cmd.args[0]));
					break;
				}
				case 'add_library': {
					cmake.build.push(cmd.args[0]);
					break;
				}
				case  'add_subdirectory': {
					parse_cmake(dir + '/' + cmd.args[0], cmake);
					break;
				}
				default: {
					break;
				}
			}
		});

		return cmake;
	}

	function cmake_refresh() {
		cmake = parse_cmake(wf, new CMake());
		if (cmake.run.length > 0) {
			last_run = cmake.run.at(0);
		}
		projectProvider.setCMake(cmake);
		cmake_config();
	}

	function cmake_config() {
		let src_path = wf;
		let build_path = wf + '/build';

		exec('cmake -S ' + src_path + ' -B ' + build_path)
	}

	function cmake_build() {
		let build_path = wf + '/build';
		if (!existsSync(build_path)) {
			cmake_config();
		}

		exec('cmake --build ' + build_path);
	}

	function cmake_build_target(name: string) {
		let build_path = wf + '/build';
		if (!existsSync(build_path)) {
			cmake_config();
		}

		exec('cmake --build ' + build_path + ' --target ' + name);
	}

	function cmake_run() {
		if (!last_run) {
			vscode.window.showErrorMessage('No target selected');
			return;
		}
		cmake_build();
		exec(last_run.file);
	}

	function cmake_run_target(run: CMakeRun) {
		cmake_build();
		exec(run.file);
	}

	context.subscriptions.push(...[
		vscode.commands.registerCommand('cgware-vscode-cmake.refresh', _ => cmake_refresh()),
		vscode.commands.registerCommand('cgware-vscode-cmake.config', _ => cmake_config()),
		vscode.commands.registerCommand('cgware-vscode-cmake.build', _ => cmake_build()),
		vscode.commands.registerCommand('cgware-vscode-cmake.build.target', (label: string) => cmake_build_target(label)),
		vscode.commands.registerCommand('cgware-vscode-cmake.run', _ => cmake_run()),
		vscode.commands.registerCommand('cgware-vscode-cmake.run.target', (run: CMakeRun) => cmake_run_target(run)),
	]);

	vscode.window.registerTreeDataProvider('cgware-vscode-cmake.project', projectProvider);
}

export function deactivate() { }
