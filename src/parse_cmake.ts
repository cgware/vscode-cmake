import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { CMake, CMakeBuildTarget, CMakeConfig, CMakeRunTarget, CMakeTarget, CMakeTargetType } from "./cmake";

const props: { [key in string]: (targets: CMakeTarget[], val: string) => void } = {
	'RUNTIME_OUTPUT_DIRECTORY_DEBUG': (targets, val) => {
		targets
			.filter(target => target.type === CMakeTargetType.RUN)
			.forEach((target: CMakeTarget) => target.outDir[CMakeConfig.DEBUG] = val);
	},
	'LIBRARY_OUTPUT_DIRECTORY_DEBUG': (targets, val) => {
		targets
			.filter(target => target.type === CMakeTargetType.BUILD)
			.forEach((target: CMakeTarget) => target.outDir[CMakeConfig.DEBUG] = val);
	},
	'RUNTIME_OUTPUT_DIRECTORY_RELEASE': (targets, val) => {
		targets
			.filter(target => target.type === CMakeTargetType.RUN)
			.forEach((target: CMakeTarget) => target.outDir[CMakeConfig.RELEASE] = val);
	},
	'LIBRARY_OUTPUT_DIRECTORY_RELEASE': (targets, val) => {
		targets
			.filter(target => target.type === CMakeTargetType.BUILD)
			.forEach((target: CMakeTarget) => target.outDir[CMakeConfig.RELEASE] = val);
	},
	'OUTPUT_NAME': (targets, val) => {
		targets.forEach((target: CMakeTarget) => target.outName = val);
	},
};

const commands: { [key in string]: (cmake: CMake, subdir: string | undefined, args: string[]) => void } = {
	'add_executable': (cmake: CMake, subdir: string | undefined, args: string[]) => {
		cmake.targets.push(...[
			new CMakeBuildTarget(args[0]),
			new CMakeRunTarget(args[0], join(cmake.buildDir, ...(subdir ? [subdir] : [])), args[0]),
		]);
	},
	'add_library': (cmake: CMake, _, args: string[]) => {
		cmake.targets.push(new CMakeBuildTarget(args[0]));
	},
	'add_subdirectory': (cmake: CMake, subdir: string | undefined, args: string[]) => {
		parse_cmake(join(...(subdir ? [subdir] : []), args[0]), cmake);
	},
	'add_custom_target': (cmake: CMake, _, args: string[]) => {
		cmake.targets.push(new CMakeBuildTarget(args[0]));
	},
	'set_target_properties': (cmake: CMake, _, args: string[]) => {
		let targets: CMakeTarget[] = [];
		let i = 0;
		while (i < args.length && args[i] !== 'PROPERTIES') {
			targets.push(...cmake.targets.filter((target: CMakeTarget) => target.name === args[i]));
			i++;
		}

		if (args[i++] !== 'PROPERTIES') {
			return;
		}

		while (i < args.length) {
			const prop = args[i++];
			const val = args[i++];
			props[prop] && props[prop](targets, val);
		}
	},
	'enable_testing': (cmake: CMake) => {
		cmake.targets.push(new CMakeBuildTarget('test'));
	},
};

export function parse_cmake(subdir: string | undefined, cmake: CMake): CMake {
	let file_path = join(cmake.rootDir, ...(subdir ? [subdir] : []), 'CMakeLists.txt');

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

	cmds.forEach(cmd => commands[cmd.cmd] && commands[cmd.cmd](cmake, subdir, cmd.args));

	return cmake;
}
