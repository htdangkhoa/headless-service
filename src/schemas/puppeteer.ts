import dedent from 'dedent';
import { z } from 'zod';

export const PuppeteerUrlSchema = z.string().describe('The URL to take a screenshot of.');

export const PuppeteerHtmlSchema = z.string().describe('The HTML content to take a screenshot of.');

export const PuppeteerScreenshotOptionsSchema = z.object({
  optimize_for_speed: z.boolean().optional().default(false),
  type: z
    .enum(['png', 'jpeg', 'webp'])
    .optional()
    .default('png')
    .describe('The content type of the image. Defaults to `png`.'),
  quality: z
    .number()
    .optional()
    .describe('Quality of the image, between 0-100. Not applicable to `png` images.'),
  from_surface: z
    .boolean()
    .optional()
    .default(true)
    .describe('Capture the screenshot from the surface, rather than the view. Defaults to `true`.'),
  full_page: z
    .boolean()
    .optional()
    .default(false)
    .describe('When `true`, takes a screenshot of the full page. Defaults to `false`.'),
  omit_background: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Hides default white background and allows capturing screenshots with transparency. Defaults to `false`.'
    ),
  clip: z
    .object({
      width: z.number().describe('The width of the element in pixels.'),
      height: z.number().describe('The height of the element in pixels.'),
      x: z.number().describe('The x-coordinate of the top-left corner of the clip area.'),
      y: z.number().describe('The y-coordinate of the top-left corner of the clip area.'),
      scale: z.number().optional().default(1).describe('The scale of the screenshot.'),
    })
    .optional()
    .describe('Specifies the region of the page/element to clip.'),
  encoding: z
    .enum(['base64', 'binary'])
    .optional()
    .default('binary')
    .describe('Encoding of the image. Defaults to `binary`.'),
  capture_beyond_viewport: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Capture the screenshot beyond the viewport. Defaults to `false` if there is no `clip`. `true` otherwise.'
    ),
});

export const PuppeteerCredentialsSchema = z
  .object({
    username: z.string().describe('Username for HTTP authentication.'),
    password: z.string().describe('Password for HTTP authentication.'),
  })
  .strict();

export const PuppeteerCookieParamSchema = z.object({
  name: z.string().describe('Cookie name.'),
  value: z.string().describe('Cookie value.'),
  url: z
    .string()
    .optional()
    .describe(
      'The request-URI to associate with the setting of the cookie. This value can affect the default domain, path, and source scheme values of the created cookie.'
    ),
  domain: z.string().optional().describe('Cookie domain.'),
  path: z.string().optional().describe('Cookie path.'),
  secure: z.boolean().optional().describe('True if cookie is secure.'),
  http_only: z.boolean().optional().describe('True if cookie is http-only.'),
  same_site: z.enum(['Strict', 'Lax', 'None']).optional().describe('Cookie SameSite type.'),
  expires: z.number().optional().describe('Cookie expiration date, session cookie if not set.'),
  priority: z
    .enum(['Low', 'Medium', 'High'])
    .optional()
    .describe('Cookie Priority. Supported only in Chrome.'),
  same_party: z
    .boolean()
    .optional()
    .describe('True if cookie is SameParty. Supported only in Chrome.'),
  source_scheme: z
    .enum(['Secure', 'NonSecure', 'Unset'])
    .optional()
    .describe('Cookie source scheme type. Supported only in Chrome.'),
  partition_key: z
    .string()
    .optional()
    .describe(
      'Cookie partition key. The site of the top-level URL the browser was visiting at the start of the request to the endpoint that set the cookie. If not set, the cookie will be set as not partitioned.'
    ),
});

export const PuppeteerCookiesSchema = z.array(PuppeteerCookieParamSchema);

export const PuppeteerEmulateMediaTypeSchema = z
  .enum(['screen', 'print'])
  .nullable()
  .describe(
    'Changes the CSS media type of the page. The only allowed values are `screen`, `print` and `null`. Passing null disables CSS media emulation.'
  );

export const PuppeteerUserAgentSchema = z
  .string()
  .describe('Specific user agent to use in this page.');

export const PuppeteerViewportSchema = z.object({
  width: z.number().describe(
    dedent`
        The page width in CSS pixels.
        > Setting this value to \`0\` will reset this value to the system default.
      `
  ),
  height: z.number().describe(
    dedent`
        The page height in CSS pixels.
        > Setting this value to \`0\` will reset this value to the system default.
      `
  ),
  device_scale_factor: z
    .number()
    .optional()
    .describe(
      dedent`
        Specify device scale factor. Defaults to \`1\`.

        See [\`devicePixelRatio\`](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio) for more info.

        > Setting this value to \`0\` will reset this value to the system default.
      `
    ),
  is_mobile: z
    .boolean()
    .optional()
    .describe('Whether the `meta viewport` tag is taken into account. Defaults to `false`.'),
  is_landscape: z
    .boolean()
    .optional()
    .describe('Specifies if the viewport is in landscape mode. Defaults to `false`.'),
  has_touch: z
    .boolean()
    .optional()
    .describe('Specify if the viewport supports touch events. Defaults to `false`.'),
});

export const PuppeteerRequestPatternSchema = z
  .object({
    url_pattern: z
      .string()
      .optional()
      .describe(
        "Wildcards (`'*'` -> zero or more, `'?'` -> exactly one) are allowed. Escape character is backslash. Omitting is equivalent to `'*'`."
      ),
    resource_type: z
      .enum([
        'Document',
        'Stylesheet',
        'Image',
        'Media',
        'Font',
        'Script',
        'TextTrack',
        'XHR',
        'Fetch',
        'Prefetch',
        'EventSource',
        'WebSocket',
        'Manifest',
        'SignedExchange',
        'Ping',
        'CSPViolationReport',
        'Preflight',
        'Other',
      ])
      .optional()
      .describe('If set, only requests for matching resource types will be intercepted.'),
    interception_stage: z
      .enum(['Request', 'HeadersReceived'])
      .optional()
      .describe('Stage at which to begin intercepting requests. Default is Request.'),
  })
  .strict();

export const PuppeteerRequestInterceptionSchema = z
  .object({
    patterns: z.array(PuppeteerRequestPatternSchema).optional(),
  })
  .describe(
    'Requests matching any of these patterns will be forwarded and wait for the corresponding continueInterceptedRequest call.'
  )
  .strict();

export const PuppeteerLifeCycleEventSchema = z.enum([
  'load',
  'domcontentloaded',
  'networkidle0',
  'networkidle2',
]);

export const PuppeteerWaitForOptionsSchema = z.object({
  timeout: z
    .number()
    .optional()
    .describe(
      'Maximum wait time in milliseconds. Pass 0 to disable the timeout. Default is 30 seconds.'
    ),
  wait_until: PuppeteerLifeCycleEventSchema.or(z.array(PuppeteerLifeCycleEventSchema))
    .optional()
    .describe(
      'When to consider waiting succeeds. Given an array of event strings, waiting is considered to be successful after all events have been fired.'
    ),
});

export const PuppeteerGoToOptionsSchema = PuppeteerWaitForOptionsSchema.extend({
  referer: z
    .string()
    .optional()
    .describe(
      'If provided, it will take preference over the referer header value set by [Page.setExtraHTTPHeaders | page.setExtraHTTPHeaders()](https://pptr.dev/api/puppeteer.page.setextrahttpheaders)'
    ),
  referrer_policy: z
    .string()
    .optional()
    .describe(
      'If provided, it will take preference over the referer-policy header value set by [Page.setExtraHTTPHeaders | page.setExtraHTTPHeaders()](https://pptr.dev/api/puppeteer.page.setextrahttpheaders)'
    ),
});

export const PuppeteerAddScriptTagSchema = z
  .object({
    url: z.string().optional().describe('URL of the script to be added.'),
    path: z
      .string()
      .optional()
      .describe(
        dedent`
          Path to a JavaScript file to be injected into the frame.

          > If \`path\` is a relative path, it is resolved relative to the current
          working directory (\`process.cwd()\` in Node.js).
        `
      ),
    content: z.string().optional().describe('JavaScript to be injected into the frame.'),
    type: z
      .string()
      .optional()
      .describe('Sets the `type` of the script. Use `module` in order to load an ES2015 module.'),
    id: z.string().optional().describe('Sets the `id` of the script.'),
  })
  .strict();

export const PuppeteerAddScriptTagsSchema = z.array(PuppeteerAddScriptTagSchema);

export const PuppeteerAddStyleTagSchema = z
  .object({
    url: z.string().optional().describe('The URL of the CSS file to be added.'),
    path: z
      .string()
      .optional()
      .describe(
        dedent`
          The path to a CSS file to be injected into the frame.

          > If \`path\` is a relative path, it is resolved relative to the current
          working directory (\`process.cwd()\` in Node.js).
        `
      ),
    content: z.string().optional().describe('Raw CSS content to be injected into the frame.'),
  })
  .strict();

export const PuppeteerAddStyleTagsSchema = z.array(PuppeteerAddStyleTagSchema);

export const PuppeteerSelectorSchema = z
  .string()
  .describe('A CSS selector of an element to take a screenshot of.');

export const PuppeteerWaitForSelectorOptionsSchema = z
  .object({
    selector: PuppeteerSelectorSchema.describe('A CSS selector of an element to wait for.'),
    visible: z
      .boolean()
      .optional()
      .describe(
        'Wait for the selected element to be present in DOM and to be visible, i.e. to not have `display: none` or `visibility: hidden` CSS properties. Defaults to `false`.'
      ),
    hidden: z
      .boolean()
      .optional()
      .describe(
        'Wait for the selected element to not be found in the DOM or to be hidden, i.e. have `display: none` or `visibility: hidden` CSS properties. Defaults to `false`.'
      ),
    timeout: z
      .number()
      .optional()
      .describe(
        'Maximum time to wait in milliseconds. Pass `0` to disable timeout. Defaults to `30_000` (30 seconds).'
      ),
  })
  .strict();
