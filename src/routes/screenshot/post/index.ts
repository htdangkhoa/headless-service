import type { Handler, Request, Response } from 'express';

import { HttpStatus, OPENAPI_TAGS } from '@/constants';
import { ApiRoute, Method } from '@/route-group';
import { z } from 'zod';
import zu from 'zod_utilz';
import {
  RequestDefaultQuerySchema,
  parseSearchParams,
  transformKeysToCamelCase,
  writeResponse,
} from '@/utils';
import { PuppeteerProvider } from '@/puppeteer-provider';

const ScreenshotOptionsSchema = z.object({
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

const PuppeteerLifeCycleEventSchema = z.enum([
  'load',
  'domcontentloaded',
  'networkidle0',
  'networkidle2',
]);

const RequestScreenshotBodySchema = z.object({
  url: z.string().optional().describe('The URL to take a screenshot of.'),
  html: z.string().optional().describe('The HTML content to take a screenshot of.'),
  options: ScreenshotOptionsSchema.optional(),
  go_to_options: z
    .object({
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
    })
    .optional(),
  selector: z.string().optional().describe('A CSS selector of an element to take a screenshot of.'),
});

export class ScreenshotPostRoute implements ApiRoute {
  method = Method.POST;
  path = '/screenshot';
  swagger = {
    tags: [OPENAPI_TAGS.REST_APIS],
    summary: this.path,
    description: 'Take a screenshot of a webpage with a supplied "url" in your JSON payload.',
    request: {
      query: RequestDefaultQuerySchema,
      body: {
        description: 'The performance data',
        content: {
          'application/json': {
            schema: RequestScreenshotBodySchema,
            example: {
              url: 'https://example.com',
            },
          },
        },
      },
    },
    responses: {},
  };
  handler?: Handler = async (req: Request, res: Response) => {
    const query = parseSearchParams(req.query);

    const queryValidation = zu.useTypedParsers(RequestDefaultQuerySchema).safeParse(query);

    if (!queryValidation.success) {
      return writeResponse(res, HttpStatus.BAD_REQUEST, {
        body: queryValidation.error.errors,
      });
    }

    const bodyValidation = zu.useTypedParsers(RequestScreenshotBodySchema).safeParse(req.body);

    if (!bodyValidation.success) {
      return writeResponse(res, HttpStatus.BAD_REQUEST, {
        body: bodyValidation.error.errors,
      });
    }

    const {
      url,
      html,
      options: screenshotOptions = {},
      go_to_options: goToOptions = {},
      selector,
    } = bodyValidation.data;

    const puppeteerProvider = req.app.get('puppeteerProvider') as PuppeteerProvider;

    const browser = await puppeteerProvider.launchBrowser(req, queryValidation.data);

    const page = await browser.newPage();

    const parsedGoToOptions = transformKeysToCamelCase(goToOptions);

    const performGoTo = url ? page.goto.bind(page) : page.setContent.bind(page);

    const content = url || html;

    if (!content) {
      const error = new Error('Either "url" or "html" must be provided');
      return writeResponse(res, HttpStatus.BAD_REQUEST, {
        body: error,
      });
    }

    const pageResponse = await performGoTo(content, parsedGoToOptions);

    const headers = {
      'X-Response-Code': pageResponse?.status(),
      'X-Response-IP': pageResponse?.remoteAddress().ip,
      'X-Response-Port': pageResponse?.remoteAddress().port,
      'X-Response-Status': pageResponse?.statusText(),
      'X-Response-URL': pageResponse?.url().substring(0, 1000),
    };

    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) {
        res.setHeader(key, value);
      }
    }

    const target = selector ? await page.$(selector) : page;

    if (!target) {
      const error = new Error(`Element with selector "${selector}" not found`);
      return writeResponse(res, HttpStatus.NOT_FOUND, {
        body: error,
      });
    }

    const parsedScreenshotOptions = transformKeysToCamelCase(screenshotOptions);

    const screenshot: string | Buffer = await target.screenshot(parsedScreenshotOptions);

    if (Buffer.isBuffer(screenshot)) {
      return res.setHeader('Content-Type', 'image/*').status(HttpStatus.OK).send(screenshot);
    }

    return writeResponse(res, HttpStatus.BAD_REQUEST, {
      body: {
        data: screenshot as string,
      },
    });
  };
}
