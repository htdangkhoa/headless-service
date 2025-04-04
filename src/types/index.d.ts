export interface Dictionary<T = any> extends Record<string, T> {}

export type Optional<T> = T | undefined;

export type Nullable<T> = T | null;

export type Maybe<T> = Optional<Nullable<T>>;

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type ValueOf<T> = T[keyof T];
