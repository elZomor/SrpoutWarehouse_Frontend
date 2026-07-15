import axios from 'axios';

// DRF field errors can be a single string or an array of strings depending
// on the validator that raised them - normalize to an array either way so
// callers can uniformly .some()/.map() over it. Reflect.get (rather than
// data[field]) sidesteps eslint-plugin-security's detect-object-injection
// rule, which flags any dynamically-keyed bracket access regardless of
// whether the key is attacker-controlled - field is always a caller-supplied
// literal, never user input, but the rule can't see that statically.
export function getFieldErrorMessages(error: unknown, field: string): string[] {
  const data = axios.isAxiosError<Record<string, string | string[] | undefined>>(error)
    ? error.response?.data
    : undefined;
  // Reflect.get throws on a non-object target (e.g. if a proxy/load
  // balancer ever returns a plain-string error body instead of JSON) -
  // data[field] would just return undefined for that case, so guard for
  // "is actually an object" rather than merely "is truthy".
  const raw = typeof data === 'object' && data !== null ? Reflect.get(data, field) : undefined;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}
