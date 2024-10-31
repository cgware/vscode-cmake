import * as vscode from 'vscode';
import { existsSync, readFileSync } from 'fs';

abstract class ProjectItem extends vscode.TreeItem {
	abstract getChildren(): ProjectItem[];
}

enum CMakeTargetType {
	BUILD,
	RUN,
}

abstract class CMakeTarget extends ProjectItem {
	public name: string;
	public type: CMakeTargetType;

	protected constructor(name: string, type: CMakeTargetType) {
		super(name, vscode.TreeItemCollapsibleState.None);
		this.name = name;
		this.type = type;
	}

	getChildren(): ProjectItem[] {
		return [];
	}

	protected build(dir: string, terminal: Terminal) {
		let build_path = dir + '/build';
		if (!existsSync(build_path)) {
			cmake_config(dir, terminal);
		}

		terminal.exec('cmake --build ' + build_path + ' --target ' + this.label);
	}

	abstract launch(dir: string, terminal: Terminal): void;
}

class CMakeBuildTarget extends CMakeTarget {
	constructor(name: string) {
		super(name, CMakeTargetType.BUILD);
		this.command = {
			command: 'cgware-vscode-cmake.build',
			title: 'Build ' + name,
			arguments: [this]
		};
	}

	launch(dir: string, terminal: Terminal) {
		this.build(dir, terminal);
	}
}

class CMakeRunTarget extends CMakeTarget {
	public file: string;

	constructor(name: string, file: string) {
		super(name, CMakeTargetType.RUN);
		this.command = {
			command: 'cgware-vscode-cmake.run',
			title: 'Run ' + name,
			arguments: [this]
		};
		this.file = file;
	}

	run(dir: string, terminal: Terminal) {
		this.build(dir, terminal);
		terminal.exec(this.file);
	}

	launch(dir: string, terminal: Terminal) {
		this.run(dir, terminal);
	}
}

class CMake {
	public files: string[] = [];
	public targets: CMakeTarget[] = [
		new CMakeBuildTarget('all'),
		new CMakeBuildTarget('clean'),
	];
}

class Terminal {
	private open: Boolean;
	private terminal: vscode.Terminal;

	constructor() {
		this.terminal = vscode.window.createTerminal('cmake');
		this.terminal.show();
		this.open = true;

		vscode.window.onDidCloseTerminal((closedTerminal) => {
			if (closedTerminal === this.terminal) {
				this.open = false;
			}
		});
	}

	exec(cmd: string) {
		if (!this.open) {
			this.terminal = vscode.window.createTerminal('cmake');
			this.terminal.show();
			this.open = true;
		}

		this.terminal.sendText(cmd, true);
	}
}

function cmake_config(dir: string, terminal: Terminal) {
	let src_path = dir;
	let build_path = dir + '/build';

	terminal.exec('cmake -S ' + src_path + ' -B ' + build_path);
}

class LaunchItem extends ProjectItem {
	private cmake: CMake;
	private type: CMakeTargetType;

	protected constructor(cmake: CMake, type: CMakeTargetType, label: string) {
		super(label, vscode.TreeItemCollapsibleState.Expanded);
		this.cmake = cmake;
		this.type = type;
	}

	getChildren(): ProjectItem[] {
		return this.cmake.targets.filter(target => target.type === this.type);
	}
}

class BuildItem extends LaunchItem {
	constructor(cmake: CMake) {
		super(cmake, CMakeTargetType.BUILD, "Build");
	}
}

class RunItem extends LaunchItem {
	constructor(cmake: CMake) {
		super(cmake, CMakeTargetType.RUN, "Run");
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

	let terminal = new Terminal();
	let cmake: CMake = new CMake();
	let last_target: CMakeTarget | undefined;
	const projectProvider = new ProjectProvider(cmake);

	cmake_refresh();

	vscode.workspace.onDidSaveTextDocument((document) => {
		const path = document.fileName;
		if (!cmake.files.includes(path)) {
			return;
		}

		vscode.commands.executeCommand('cgware-vscode-cmake.refresh');
	});

	function parse_cmake(dir: string, cmake: CMake): CMake {
		let path = dir + '/CMakeLists.txt';
		if (!existsSync(path)) {
			return cmake;
		}

		cmake.files.push(path);

		const f = readFileSync(path, 'utf8');
		const cmds: Array<{ cmd: string; args: string[] }> = [];

		const reg = /^\s*(\w+)\s*\(([^)]*)\)\s*$/gm;
		let match;

		while ((match = reg.exec(f)) !== null) {
			const cmd = match[1];
			const args = match[2]
				.split(/\s+/)
				.filter(arg => arg.length > 0);
			cmds.push({ cmd, args });
		}

		cmds.forEach(cmd => {
			switch (cmd.cmd) {
				case 'add_executable': {
					cmake.targets.push(...[
						new CMakeBuildTarget(cmd.args[0]),
						new CMakeRunTarget(cmd.args[0], dir + '/build/' + cmd.args[0]),
					]);
					break;
				}
				case 'add_library': {
					cmake.targets.push(new CMakeBuildTarget(cmd.args[0]));
					break;
				}
				case 'add_subdirectory': {
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
		if (cmake.targets.length > 0) {
			last_target = cmake.targets.at(0);
		}
		projectProvider.setCMake(cmake);
		cmake_config(wf, terminal);
	}

	context.subscriptions.push(...[
		vscode.commands.registerCommand('cgware-vscode-cmake.refresh', _ => cmake_refresh()),
		vscode.commands.registerCommand('cgware-vscode-cmake.config', _ => cmake_config(wf, terminal)),
		vscode.commands.registerCommand('cgware-vscode-cmake.build', (target: CMakeTarget) => {
			target.launch(wf, terminal);
			last_target = target;
		}),
		vscode.commands.registerCommand('cgware-vscode-cmake.run', (target: CMakeTarget) => {
			target.launch(wf, terminal);
			last_target = target;
		}),
		vscode.commands.registerCommand('cgware-vscode-cmake.launch', _ => {
			if (!last_target) {
				vscode.window.showErrorMessage('No target selected');
				return;
			}
	
			last_target.launch(wf, terminal);
		}),
	]);

	vscode.window.registerTreeDataProvider('cgware-vscode-cmake.project', projectProvider);
}

export function deactivate() { }
