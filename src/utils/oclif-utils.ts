/**
 * @license
 * Copyright 2019 Balena Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/** Convert e.g. 'env set NAME [VALUE]' to 'env set <name> [value]' */
export function capitanoizeOclifUsage(
	oclifUsage: string | string[] | undefined,
): string {
	return (oclifUsage || '')
		.toString()
		.replace(/(?<=\s)[A-Z]+(?=(\s|$))/g, (match) => `<${match}>`)
		.toLowerCase();
}

export async function getCommandsFromManifest() {
	const manifest = require('../../oclif.manifest.json');

	if (manifest.commands == null) {
		throw new Error('Commands section not found in manifest.');
	}
	return manifest.commands;
}

export async function getCommandIdsFromManifest() {
	const commands = await getCommandsFromManifest();
	return Object.keys(commands);
}
