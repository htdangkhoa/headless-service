import { z } from 'zod';

type ParseMethods = 'parse' | 'parseAsync' | 'safeParse' | 'safeParseAsync';

export const useTypedParsers = <Schema extends z.ZodType>(schema: Schema) =>
  schema as any as TypedParsersSchema<Schema>;

type ParametersExceptFirst<Func> = Func extends (arg0: any, ...rest: infer R) => any ? R : never;

type Params<Schema extends z.ZodType, Method extends ParseMethods> = [
  data: z.input<Schema>,
  ...rest: ParametersExceptFirst<Schema[Method]>,
];

type TypedParsersSchema<Schema extends z.ZodType> = Omit<Schema, ParseMethods> & {
  [Method in ParseMethods]: (...args: Params<Schema, Method>) => ReturnType<Schema[Method]>;
};

export const getZodErrorMessages = (error: z.ZodError) => {
  return z.treeifyError(error).errors;
};
