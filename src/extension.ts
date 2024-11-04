import * as vscode from 'vscode';
import * as path from 'path';
import { existsSync, readFileSync } from 'fs';

abstract class ProjectItem extends vscode.TreeItem {
	abstract getChildren(): ProjectItem[];
}

enum CMakeTargetType {
	BUILD,
	RUN,
}

enum CMakeConfig {
	DEBUG,
	RELEASE,
}

const configs: { [key in CMakeConfig]: string } = {
	[CMakeConfig.DEBUG]: 'Debug',
	[CMakeConfig.RELEASE]: 'Release',
};

abstract class CMakeTarget {
	public name: string;
	public type: CMakeTargetType;
	public outDir: string[] = new Array(Object.keys(CMakeConfig).length);
	public outName: string | undefined;

	protected constructor(name: string, type: CMakeTargetType) {
		this.name = name;
		this.type = type;
	}

	protected build(cmake: CMake, terminal: Terminal, config: CMakeConfig) {
		cmake.build(terminal, this.name, config);
	}

	abstract launch(cmake: CMake, terminal: Terminal, config: CMakeConfig): void;

	equals(other: CMakeTarget | undefined) {
		return other && this.name === other.name && this.type === other.type;
	}
}

class CMakeBuildTarget extends CMakeTarget {
	constructor(name: string) {
		super(name, CMakeTargetType.BUILD);
	}

	launch(cmake: CMake, terminal: Terminal, config: CMakeConfig) {
		this.build(cmake, terminal, config);
	}
}

class CMakeRunTarget extends CMakeTarget {
	constructor(name: string, outDir: string, outName: string) {
		super(name, CMakeTargetType.RUN);
		this.outDir.fill(outDir);
		this.outName = outName;
	}

	run(cmake: CMake, terminal: Terminal, config: CMakeConfig) {
		this.build(cmake, terminal, config);
		cmake.run(terminal, this, config);
	}

	launch(cmake: CMake, terminal: Terminal, config: CMakeConfig) {
		this.run(cmake, terminal, config);
	}
}

class CMake {
	public rootDir: string;
	public srcDir: string;
	public buildDir: string;
	public files: string[] = [];
	public targets: CMakeTarget[] = [
		new CMakeBuildTarget('all'),
		new CMakeBuildTarget('clean'),
	];

	constructor(rootDir: string) {
		this.rootDir = rootDir;
		this.srcDir = rootDir;
		this.buildDir = path.join(rootDir, 'build');
	}

	generate(terminal: Terminal, config: CMakeConfig) {
		terminal.exec('cmake -S ' + this.srcDir + ' -B ' + this.buildDir + ' -DCMAKE_BUILD_TYPE=' + configs[config]);
	}

	build(terminal: Terminal, target: string, config: CMakeConfig) {
		if (!existsSync(this.buildDir)) {
			this.generate(terminal, config);
		}

		terminal.exec('cmake --build ' + this.buildDir + ' --target ' + target + ' --config ' + configs[config]);
	}

	run(terminal: Terminal, target: CMakeRunTarget, config: CMakeConfig) {
		if (!target.outDir || !target.outName) {
			return;
		}

		let cmd = path.join(target.outDir[config], target.outName);
		cmd = cmd.replaceAll('${CMAKE_SOURCE_DIR}', this.srcDir);

		switch (config) {
			case CMakeConfig.DEBUG: {
				vscode.debug.startDebugging(undefined, {
					"type": "cppdbg",
					"name": "GDB",
					"request": "launch",
					"program": cmd,
					"stopAtEntry": false,
					"externalConsole": false,
					"cwd": this.buildDir
				});
				break;
			}
			case CMakeConfig.RELEASE: {
				terminal.exec(cmd);
				break;
			}
			default: {
				break;
			}
		}
	}
}

class Terminal {
	private terminal: vscode.Terminal | undefined;

	constructor() {
		vscode.window.onDidCloseTerminal((closedTerminal) => {
			if (closedTerminal === this.terminal) {
				this.terminal = undefined;
			}
		});
	}

	exec(cmd: string) {
		this.terminal = this.terminal || vscode.window.createTerminal('cmake');
		this.terminal.show();
		this.terminal.sendText(cmd, true);
	}
}

class LaunchItem extends ProjectItem {
	protected constructor(target: CMakeTarget, selected: CMakeTarget | undefined) {
		super(target.name + (target === selected ? ' (selected)' : ''), vscode.TreeItemCollapsibleState.None);
	}

	getChildren(): ProjectItem[] {
		return [];
	}
}

class BuildItem extends LaunchItem {
	constructor(target: CMakeTarget, selected: CMakeTarget | undefined) {
		super(target, selected);
		this.command = {
			command: 'cgware-vscode-cmake.build',
			title: 'Build ' + target.name,
			arguments: [target]
		};
	}
}

class RunItem extends LaunchItem {
	constructor(target: CMakeTarget, selected: CMakeTarget | undefined) {
		super(target, selected);
		this.command = {
			command: 'cgware-vscode-cmake.run',
			title: 'Run ' + target.name,
			arguments: [target]
		};
	}
}

abstract class LaunchItems extends ProjectItem {
	protected cmake: CMake;
	protected type: CMakeTargetType;
	protected selected: CMakeTarget | undefined;

	protected constructor(cmake: CMake, type: CMakeTargetType, name: string, selected: CMakeTarget | undefined) {
		super(name, vscode.TreeItemCollapsibleState.Expanded);
		this.cmake = cmake;
		this.type = type;
		this.selected = selected;
	}
}

class BuildItems extends LaunchItems {
	constructor(cmake: CMake, selected: CMakeTarget | undefined) {
		super(cmake, CMakeTargetType.BUILD, 'Build', selected);
	}

	getChildren(): ProjectItem[] {
		return this.cmake.targets.filter(target => target.type === this.type).map(target => new BuildItem(target, this.selected));
	}
}

class RunItems extends LaunchItems {
	constructor(cmake: CMake, selected: CMakeTarget | undefined) {
		super(cmake, CMakeTargetType.RUN, "Run", selected);
	}

	getChildren(): ProjectItem[] {
		return this.cmake.targets.filter(target => target.type === this.type).map(target => new RunItem(target, this.selected));
	}
}

class ConfigItem extends ProjectItem {
	constructor(config: CMakeConfig, selected: CMakeConfig) {
		super(configs[config] + (config === selected ? ' (selected)' : ''), vscode.TreeItemCollapsibleState.None);
		this.command = {
			command: 'cgware-vscode-cmake.config',
			title: configs[config],
			arguments: [config]
		};
	}

	getChildren(): ProjectItem[] {
		return [];
	}
}

class ConfigItems extends ProjectItem {
	private selected: CMakeConfig;

	constructor(selected: CMakeConfig) {
		super('Config', vscode.TreeItemCollapsibleState.Expanded);
		this.selected = selected;
	}

	getChildren(): ProjectItem[] {
		return Object.values(CMakeConfig)
			.filter((config, _) => typeof config === 'string')
			.map((_, config) => new ConfigItem(config, this.selected));
	}
}

class ProjectProvider implements vscode.TreeDataProvider<ProjectItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<ProjectItem | undefined | void> = new vscode.EventEmitter<ProjectItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<ProjectItem | undefined | void> = this._onDidChangeTreeData.event;
	private cmake: CMake;
	public target: CMakeTarget | undefined;
	public config: CMakeConfig;

	constructor(cmake: CMake) {
		this.cmake = cmake;
		this.target = this.cmake.targets.find((item: CMakeTarget) => item.equals(this.target)) || this.cmake.targets.at(0);
		this.config = CMakeConfig.DEBUG;
	}

	getTreeItem(element: ProjectItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: ProjectItem): ProjectItem[] {
		if (!element) {
			return [
				new BuildItems(this.cmake, this.target),
				new RunItems(this.cmake, this.target),
				new ConfigItems(this.config),
			];
		}

		return element.getChildren();
	}

	setCMake(cmake: CMake) {
		this.cmake = cmake;
		this.target = this.cmake.targets.find((item: CMakeTarget) => item.equals(this.target)) || this.cmake.targets.at(0);
		this._onDidChangeTreeData.fire();
	}

	setConfig(config: CMakeConfig) {
		this.config = config;
		this._onDidChangeTreeData.fire();
	}

	setTarget(target: CMakeTarget) {
		this.target = target;
		this._onDidChangeTreeData.fire();
	}
}

export function activate(context: vscode.ExtensionContext) {
	if (vscode.workspace.workspaceFolders === undefined) {
		vscode.window.showErrorMessage('CMake: Working folder not found, open a folder and try again');
		return;
	}

	const wf = vscode.workspace.workspaceFolders[0].uri.fsPath;

	let terminal = new Terminal();
	let cmake: CMake = new CMake(wf);
	const projectProvider = new ProjectProvider(cmake);

	cmake_refresh();

	vscode.workspace.onDidSaveTextDocument((document) => {
		const path = document.fileName;
		if (!cmake.files.includes(path)) {
			return;
		}

		vscode.commands.executeCommand('cgware-vscode-cmake.refresh');
	});

	function parse_cmake(subdir: string | undefined, cmake: CMake): CMake {
		let file_path = path.join(cmake.rootDir, ...(subdir ? [subdir] : []), 'CMakeLists.txt');

		if (!existsSync(file_path)) {
			return cmake;
		}

		cmake.files.push(file_path);

		const file = readFileSync(file_path, 'utf8');
		const cmds: Array<{ cmd: string; args: string[] }> = [];

		const reg = /^\s*(\w+)\s*\(([^)]*)\)\s*$/gm;
		let match;

		while ((match = reg.exec(file)) !== null) {
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
						new CMakeRunTarget(cmd.args[0], path.join(cmake.buildDir, ...(subdir ? [subdir] : [])), cmd.args[0]),
					]);
					break;
				}
				case 'add_library': {
					cmake.targets.push(new CMakeBuildTarget(cmd.args[0]));
					break;
				}
				case 'add_subdirectory': {
					parse_cmake(path.join(...(subdir ? [subdir] : []), cmd.args[0]), cmake);
					break;
				}
				case 'add_custom_target': {
					cmake.targets.push(new CMakeBuildTarget(cmd.args[0]));
					break;
				}
				case 'set_target_properties': {
					let targets: CMakeTarget[] = [];
					let i = 0;
					while (i < cmd.args.length && cmd.args[i] !== 'PROPERTIES') {
						targets.push(...cmake.targets.filter((target: CMakeTarget) => target.name === cmd.args[i]));
						i++;
					}

					if (cmd.args[i++] !== 'PROPERTIES') {
						break;
					}

					while (i < cmd.args.length) {
						let prop = cmd.args[i++];
						let val = cmd.args[i++];

						switch (prop) {
							case 'RUNTIME_OUTPUT_DIRECTORY_DEBUG': {
								targets
									.filter(target => target.type === CMakeTargetType.RUN)
									.forEach((target: CMakeTarget) => target.outDir[CMakeConfig.DEBUG] = val);
								break;
							}
							case 'LIBRARY_OUTPUT_DIRECTORY_DEBUG': {
								targets
									.filter(target => target.type === CMakeTargetType.BUILD)
									.forEach((target: CMakeTarget) => target.outDir[CMakeConfig.DEBUG] = val);
								break;
							}
							case 'RUNTIME_OUTPUT_DIRECTORY_RELEASE': {
								targets
									.filter(target => target.type === CMakeTargetType.RUN)
									.forEach((target: CMakeTarget) => target.outDir[CMakeConfig.RELEASE] = val);
								break;
							}
							case 'LIBRARY_OUTPUT_DIRECTORY_RELEASE': {
								targets
									.filter(target => target.type === CMakeTargetType.BUILD)
									.forEach((target: CMakeTarget) => target.outDir[CMakeConfig.RELEASE] = val);
								break;
							}
							case 'OUTPUT_NAME': {
								targets.forEach((target: CMakeTarget) => target.outName = val);
								break;
							}
							default: {
								break;
							}
						}
					}
					break;
				}
				case 'enable_testing': {
					cmake.targets.push(new CMakeBuildTarget('test'));
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
		cmake = parse_cmake(undefined, new CMake(wf));
		projectProvider.setCMake(cmake);
	}

	context.subscriptions.push(...[
		vscode.commands.registerCommand('cgware-vscode-cmake.refresh', _ => {
			cmake_refresh();
			cmake.generate(terminal, projectProvider.config);
		}),
		vscode.commands.registerCommand('cgware-vscode-cmake.generate', _ => cmake.generate(terminal, projectProvider.config)),
		vscode.commands.registerCommand('cgware-vscode-cmake.config', (config: CMakeConfig) => {
			projectProvider.setConfig(config);
			cmake.generate(terminal, projectProvider.config);
		}),
		vscode.commands.registerCommand('cgware-vscode-cmake.build', (target: CMakeTarget) => {
			projectProvider.setTarget(target);
			target.launch(cmake, terminal, projectProvider.config);
		}),
		vscode.commands.registerCommand('cgware-vscode-cmake.run', (target: CMakeTarget) => {
			projectProvider.setTarget(target);
			target.launch(cmake, terminal, projectProvider.config);
		}),
		vscode.commands.registerCommand('cgware-vscode-cmake.launch', _ => {
			if (!projectProvider.target) {
				vscode.window.showErrorMessage('No target selected');
				return;
			}

			projectProvider.target.launch(cmake, terminal, projectProvider.config);
		}),
	]);

	vscode.window.registerTreeDataProvider('cgware-vscode-cmake.project', projectProvider);
}

export function deactivate() { }
