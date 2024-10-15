import dedent from 'dedent';
import { z } from 'zod';
import { capitalize } from 'lodash-es';
import { NumberOrStringSchema } from './common';

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

// export const setJavaScriptEnabled

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

export const PuppeteerWaitForFunctionSchema = z.object({
  page_function: z.string(),
  polling: z.enum(['raf', 'mutation']).or(z.number()).optional().describe(dedent`
      An interval at which the \`pageFunction\` is executed, defaults to \`raf\`.
      If \`polling\` is a number, then it is treated as an interval in milliseconds at which the function would be executed.
      If \`polling\` is a string, then it can be one of the following values:

      - \`raf\` - to constantly execute \`pageFunction\` in \`requestAnimationFrame\`
      callback. This is the tightest polling mode which is suitable to observe
      styling changes.
      
      - \`mutation\` - to execute \`pageFunction\` on every DOM mutation.
      `),
  timeout: z
    .number()
    .optional()
    .describe(
      'Maximum time to wait in milliseconds. Pass `0` to disable timeout. Defaults to `30_000` (30 seconds).'
    ),
});

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

export const PuppeteerWaitForEventSchema = z.object({
  event_name: z.string().describe('The name of the event to wait for.'),
  timeout: z
    .number()
    .optional()
    .describe(
      'Maximum time to wait in milliseconds. Pass `0` to disable timeout. Defaults to `30_000` (30 seconds).'
    ),
});

const pdfFormats = [
  'letter',
  'legal',
  'tabloid',
  'ledger',
  'a0',
  'a1',
  'a2',
  'a3',
  'a4',
  'a5',
  'a6',
]
  .map((s) => [s.toUpperCase(), s.toLowerCase(), capitalize(s)])
  .flat();

const setPDFFormats = new Set(pdfFormats);

const PuppeteerPDFFormatsSchema = z
  .enum(Array.from(setPDFFormats) as [string, ...string[]])
  .describe(
    'If set, this takes priority over the `width` and `height` options. Defaults to `letter`.'
  );

export const PuppeteerPDFOptionsSchema = z
  .object({
    scale: z
      .number()
      .optional()
      .describe(
        'Scales the rendering of the web page. Amount must be between `0.1` and `2`. Defaults to `1`.'
      ),
    display_header_footer: z
      .boolean()
      .optional()
      .describe('Whether to show the header and footer. Defaults to `false`.'),
    header_template: z
      .string()
      .optional()
      .describe(
        dedent`
        HTML template for the print header. Should be valid HTML with the following classes used to inject values into them:

        - \`date\` formatted print date
        - \`title\` document title
        - \`url\` document location
        - \`pageNumber\` current page number
        - \`totalPages\` total pages in the document
        `
      ),
    footer_template: z
      .string()
      .optional()
      .describe(
        'HTML template for the print footer. Has the same constraints and support for special classes as [PDFOptions.headerTemplate](https://pptr.dev/api/puppeteer.pdfoptions).'
      ),
    print_background: z
      .boolean()
      .optional()
      .describe('et to `true` to print background graphics. Defaults to `false`.'),
    landscape: z
      .boolean()
      .optional()
      .describe('Whether to print in landscape orientation. Defaults to `false`.'),
    page_ranges: z
      .string()
      .optional()
      .describe(
        'Paper ranges to print, e.g. `1-5, 8, 11-13`. Defaults to the empty string, which means all pages are printed.'
      ),
    format: PuppeteerPDFFormatsSchema.optional(),
    width: NumberOrStringSchema.optional().describe(
      'Sets the width of paper. You can pass in a number or a string with a unit.'
    ),
    height: NumberOrStringSchema.optional().describe(
      'Sets the height of paper. You can pass in a number or a string with a unit.'
    ),
    prefer_css_page_size: z
      .boolean()
      .optional()
      .describe(
        'Give any CSS `@page` size declared in the page priority over what is declared in the `width` or `height` or `format` option. Defaults to `false`, which will scale the content to fit the paper size.'
      ),
    margin: z
      .object({
        top: NumberOrStringSchema.optional().describe('Top margin in inches.'),
        right: NumberOrStringSchema.optional().describe('Right margin in inches.'),
        bottom: NumberOrStringSchema.optional().describe('Bottom margin in inches.'),
        left: NumberOrStringSchema.optional().describe('Left margin in inches.'),
      })
      .optional()
      .describe('Set the PDF margins. Defaults to `undefined` no margins are set.'),
    omit_background: z
      .boolean()
      .optional()
      .describe(
        'Hides default white background and allows generating pdfs with transparency. Defaults to `false`.'
      ),
    tagged: z
      .boolean()
      .optional()
      .describe('Generate tagged (accessible) PDF. Defaults to `true`.'),
    outline: z
      .boolean()
      .optional()
      .describe(
        dedent`
        Generate document outline.

        > If this is enabled the PDF will also be tagged (accessible)

        > Currently only works in old Headless (headless = 'shell')
         
        > [Chromium feature request](https://issues.chromium.org/issues/41387522#comment48)

        Defaults to \`false\`.
        `
      ),
    timeout: z
      .number()
      .optional()
      .describe(
        'Timeout in milliseconds. Pass `0` to disable timeout. Defaults to `30_000` (30 seconds).'
      ),
  })
  .strict();
