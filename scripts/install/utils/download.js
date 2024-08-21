import { createWriteStream, ReadStream } from 'node:fs';

export async function downloadFile(url, path) {
  return fetch(url).then((response) => {
    return new Promise((resolve, reject) => {
      return ReadStream.fromWeb(response.body)
        .pipe(createWriteStream(path))
        .on('error', reject)
        .on('finish', resolve);
    });
  });
}
