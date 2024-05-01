function parseEnv(value: string, key: string | number): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  // check string is a integer using Regex
  if (/^-?\d+$/.test(value)) {
    return parseInt(value, 10);
  }

  // check string is a number using Regex
  if (/^-?\d+\.?\d*$/.test(value)) {
    return parseFloat(value);
  }

  // check string is a boolean
  if (['true', 'false', '0', '1'].includes(value)) {
    return value === 'true' || value === '1';
  }

  // check string is a json
  if (value.startsWith('{') && value.endsWith('}')) {
    try {
      return JSON.parse(value);
    } catch (error: any) {
      throw new Error(`Invalid json environment variable ${key}: ${error.message}`);
    }
  }

  // check string is a array
  if (value.startsWith('[') && value.endsWith(']')) {
    value = value.substring(1, value.length - 1);

    return value.split(',').map(parseEnv);
  }

  return value;
}

export function env<T = string>(key: string, defaultValue?: T) {
  const value = process.env[key];

  if (!value) return defaultValue;

  return parseEnv(value, key) as T;
}
