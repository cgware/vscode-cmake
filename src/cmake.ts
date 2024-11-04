import { join } from 'path';
import { debug } from "vscode";
import { existsSync } from 'fs';
import { Terminal } from "./terminal";

export enum CMakeTargetType {
	BUILD,
	RUN,
}

export enum CMakeConfig {
	DEBUG,
	RELEASE,
}

export const configs: { [key in CMakeConfig]: string } = {
	[CMakeConfig.DEBUG]: 'Debug',
	[CMakeConfig.RELEASE]: 'Release',
};

export abstract class CMakeTarget {
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

export class CMakeBuildTarget extends CMakeTarget {
	constructor(name: string) {
		super(name, CMakeTargetType.BUILD);
	}

	launch(cmake: CMake, terminal: Terminal, config: CMakeConfig) {
		this.build(cmake, terminal, config);
	}
}

export class CMakeRunTarget extends CMakeTarget {
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

export class CMake {
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
		this.buildDir = join(rootDir, 'build');
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

		let cmd = join(target.outDir[config], target.outName);
		cmd = cmd.replaceAll('${CMAKE_SOURCE_DIR}', this.srcDir);

		switch (config) {
			case CMakeConfig.DEBUG: {
				debug.startDebugging(undefined, {
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
