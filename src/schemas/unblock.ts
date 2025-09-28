import { z } from 'zod';
import { BooleanOrStringSchema } from './common';

export const SupportedBrowsersSchema = z.enum(['chrome', 'firefox', 'safari', 'edge']);

export const SupportedHttpVersionsSchema = z.enum(['1', '2']);

export const SupportedOperatingSystemsSchema = z.enum([
  'windows',
  'macos',
  'linux',
  'android',
  'ios',
]);
export const SupportedDevicesSchema = z.enum(['desktop', 'mobile']);

export const UnblockOptionsSchema = z.object({
  browsers: z
    .array(
      SupportedBrowsersSchema.or(
        z.object({
          name: SupportedBrowsersSchema,
          minVersion: z.number().optional(),
          maxVersion: z.number().optional(),
          httpVersion: SupportedHttpVersionsSchema.optional(),
        })
      )
    )
    .describe('The browsers to use for the fingerprint')
    .optional(),
  browserslist_query: z
    .string()
    .describe('The browser list query to use for the fingerprint')
    .optional(),
  operating_systems: z
    .array(SupportedOperatingSystemsSchema)
    .describe('The operating systems to use for the fingerprint')
    .optional(),
  devices: z
    .array(SupportedDevicesSchema)
    .describe('The devices to use for the fingerprint')
    .optional(),
  locales: z.array(z.string()).describe('The locales to use for the fingerprint').optional(),
  http_version: SupportedHttpVersionsSchema.describe(
    'The HTTP version to use for the fingerprint'
  ).optional(),
  strict: BooleanOrStringSchema.describe(
    'Whether to use the strict mode for the fingerprint'
  ).optional(),
  screen: z
    .object({
      min_width: z.number().optional(),
      max_width: z.number().optional(),
      min_height: z.number().optional(),
      max_height: z.number().optional(),
    })
    .describe('The screen dimensions to use for the fingerprint')
    .optional(),
  mock_webrtc: BooleanOrStringSchema.describe(
    'Whether to use the mock WebRTC for the fingerprint'
  ).optional(),
  slim: BooleanOrStringSchema.describe(
    'Whether to use the slim mode for the fingerprint'
  ).optional(),
});

export type UnblockOptions = z.infer<typeof UnblockOptionsSchema>;
