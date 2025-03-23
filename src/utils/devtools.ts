export const buildProtocolMethod = (domain: string, command: string) => {
  return [domain, command].join('.');
};

export const parseProtocolMethod = (method: string) => {
  const [domain, command] = method.split('.');
  if (!domain || !command) {
    throw new Error('Invalid method');
  }
  return [domain, command];
};

export const buildProtocolEventNames = (browserId: string, method: string) => {
  const [domain, command] = parseProtocolMethod(method);

  const eventNameForListener = [browserId, domain, command].join('.');
  const eventNameForResult = [browserId, domain, command, 'result'].join('.');

  return {
    eventNameForListener,
    eventNameForResult,
  };
};
