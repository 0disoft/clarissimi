export function findYamlMappingBlock(text, key) {
  const lines = Array.isArray(text) ? text : text.split(/\r?\n/);
  const keyPattern = new RegExp(`^(\\s*)${escapeRegExp(key)}:\\s*$`);

  for (let index = 0; index < lines.length; index += 1) {
    const match = keyPattern.exec(lines[index]);
    if (match === null) {
      continue;
    }

    const indent = match[1].length;
    const block = [lines[index]];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line.trim().length > 0 && leadingSpaceCount(line) <= indent) {
        break;
      }

      block.push(line);
    }

    return block;
  }

  return undefined;
}

export function findYamlScalarValue(block, key) {
  const pattern = new RegExp(`^\\s+${escapeRegExp(key)}:\\s*(.*?)\\s*$`);
  for (const line of block) {
    const match = pattern.exec(line);
    if (match !== null) {
      return match[1];
    }
  }

  return undefined;
}

export function findRequiredYamlMappingBlock(text, path, key, issues) {
  const block = findYamlMappingBlock(text, key);
  if (block === undefined) {
    issues.push(`${path} must define ${key}.`);
  }

  return block;
}

function leadingSpaceCount(value) {
  const match = /^ */.exec(value);
  return match === null ? 0 : match[0].length;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
