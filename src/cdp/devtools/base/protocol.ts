import { z } from 'zod';

// Define PrimitiveType schema
const PrimitiveTypeSchema = z.object({
  type: z.enum(['number', 'integer', 'boolean']),
});

// Define StringType schema
const StringTypeSchema = z.object({
  type: z.literal('string'),
  enum: z.array(z.string()).optional(),
});

// Define AnyType schema
const AnyTypeSchema = z.object({
  type: z.literal('any'),
});

// Define RefType schema
const RefTypeSchema = z.object({
  $ref: z.string(),
});

// Define PropertyBaseType schema
const PropertyBaseTypeSchema = z.object({
  name: z.string(),
  optional: z.boolean().optional(),
  description: z.string().optional(),
});

// Forward declare PropertyTypeSchema (used later in ObjectType and ArrayType)
const PropertyTypeSchema: z.ZodLazy<z.ZodTypeAny> = z.lazy(() =>
  z.intersection(PropertyBaseTypeSchema, ProtocolTypeSchema)
);

// Define ObjectType schema
const ObjectTypeSchema = z.lazy(() =>
  z.object({
    type: z.literal('object'),
    properties: z.array(PropertyTypeSchema).optional(),
  })
);

// Define ArrayType schema
const ArrayTypeSchema = z.object({
  type: z.literal('array'),
  items: z.lazy(() =>
    z.union([
      RefTypeSchema,
      PrimitiveTypeSchema,
      StringTypeSchema,
      AnyTypeSchema,
      ObjectTypeSchema, // Uses lazy loading
    ])
  ),
  minItems: z.number().optional(),
  maxItems: z.number().optional(),
});

// Define ProtocolType schema (ensuring PropertyTypeSchema is referenced safely)
const ProtocolTypeSchema = z.union([
  StringTypeSchema,
  ObjectTypeSchema, // Uses lazy loading
  ArrayTypeSchema,
  PrimitiveTypeSchema,
  RefTypeSchema,
  AnyTypeSchema,
]);

// Reassign PropertyTypeSchema to its final structure after ProtocolTypeSchema is declared
const PropertyTypeSchemaFinal = z.lazy(() =>
  z.intersection(PropertyBaseTypeSchema, ProtocolTypeSchema)
);

type PropertyTypeFinal = z.infer<typeof PropertyTypeSchemaFinal>;

// Define Event schema
export const EventSchema = z.object({
  name: z.string(),
  parameters: z.array(PropertyTypeSchema).optional(),
  description: z.string().optional(),
});

export type Event = z.infer<typeof EventSchema>;

export const CommandSchema = EventSchema.extend({
  returns: z.array(PropertyTypeSchema).optional(),
  async: z.boolean().optional(),
  redirect: z.string().optional(),
});

export type Command = z.infer<typeof CommandSchema>;

export const DomainTypeSchema = z.intersection(
  z.object({
    id: z.string(),
    description: z.string().optional(),
  }),
  z.union([StringTypeSchema, ObjectTypeSchema, ArrayTypeSchema, PrimitiveTypeSchema])
);

export type DomainType = z.infer<typeof DomainTypeSchema>;

export const DomainSchema = z.object({
  domain: z.string(),
  description: z.string().optional(),
  types: z.array(DomainTypeSchema).optional(),
  commands: z.array(CommandSchema).optional(),
  events: z.array(EventSchema).optional(),
});

export type Domain = z.infer<typeof DomainSchema>;

const VersionSchema = z.object({
  major: z.number(),
  minor: z.number(),
});

export const ProtocolSchema = z.object({
  version: VersionSchema,
  domains: z.array(DomainSchema),
});

export type Protocol = z.infer<typeof ProtocolSchema>;
