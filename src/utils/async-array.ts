export class AsyncArray<T> {
  private _array: T[] = [];
  private waitings: Array<(value: T) => unknown> = [];

  set length(value) {
    this._array.length = value;
  }

  get length() {
    return this._array.length;
  }

  push(item: T) {
    const next = this.waitings.shift();

    if (next) {
      setImmediate(next, item);
      return;
    }

    this._array.push(item);
  }

  get(): Promise<T> {
    const item = this._array.shift();

    if (item) {
      return Promise.resolve(item);
    }

    return new Promise((resolve) => {
      this.waitings.push(resolve);
    });
  }

  map(callbackFn: (value: T, index: number, array: T[]) => unknown, thisArg?: any) {
    return this._array.map(callbackFn, thisArg);
  }

  find(callbackFn: (value: T, index: number, array: T[]) => unknown, thisArg?: any) {
    return this._array.find(callbackFn, thisArg);
  }
}
