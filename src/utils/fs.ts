import fs from 'node:fs';

export const isDirectory = (path: string) => {
  try {
    const stat = fs.statSync(path);
    return stat.isDirectory();
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return false;
    }
    throw err;
  }
};
