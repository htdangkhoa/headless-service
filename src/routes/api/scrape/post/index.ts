import dedent from 'dedent';
import type { Protocol } from 'devtools-protocol';
import type { Handler } from 'express';
import type { CookieParam, GoToOptions, Viewport, WaitForOptions } from 'puppeteer-core';
import { z } from 'zod';

import { DEFAULT_PAGE_TIMEOUT, HttpStatus, OPENAPI_TAGS } from '@/constants';
import { Method, ProxyHttpRoute } from '@/router';
import {
  PuppeteerAddScriptTagsSchema,
  PuppeteerAddStyleTagsSchema,
  PuppeteerCookiesSchema,
  PuppeteerCredentialsSchema,
  PuppeteerEmulateMediaTypeSchema,
  PuppeteerGoToOptionsSchema,
  PuppeteerHtmlSchema,
  PuppeteerRequestInterceptionSchema,
  PuppeteerUrlSchema,
  PuppeteerUserAgentSchema,
  PuppeteerViewportSchema,
  PuppeteerWaitForEventSchema,
  PuppeteerWaitForFunctionSchema,
  PuppeteerWaitForSelectorOptionsSchema,
  RequestDefaultQuerySchema,
  RequestDefaultQueryWithTokenSchema,
} from '@/schemas';
import {
  parseSearchParams,
  sleep,
  transformKeysToCamelCase,
  useTypedParsers,
  writeResponse,
} from '@/utils';

import { IBoundRequest } from './interfaces';

const ElementSelectorSchema = z
  .object({
    selector: z.string(),
    timeout: z.number().optional(),
  })
  .strict();

const ElementsSelectorSchema = z.array(ElementSelectorSchema).min(1);

interface IElementsSelector extends z.infer<typeof ElementsSelectorSchema> {}

const DebugOptionsSchema = z
  .object({
    console: z.boolean().optional(),
    network: z.boolean().optional(),
    cookies: z.boolean().optional(),
    html: z.boolean().optional(),
    screenshot: z.boolean().optional(),
  })
  .strict();

const RequestScrapeBodySchema = z.object({
  url: PuppeteerUrlSchema.optional(),
  html: PuppeteerHtmlSchema.optional(),
  elements: ElementsSelectorSchema,
  debug_options: DebugOptionsSchema,
  authenticate: PuppeteerCredentialsSchema.optional(),
  cookies: PuppeteerCookiesSchema.optional(),
  emulate_media_type: PuppeteerEmulateMediaTypeSchema.optional(),
  user_agent: PuppeteerUserAgentSchema.optional(),
  viewport: PuppeteerViewportSchema.optional(),
  block_urls: z.array(z.string()).optional(),
  request_interception: PuppeteerRequestInterceptionSchema.optional(),
  set_extra_http_headers: z.record(z.string(), z.string()).optional(),
  set_javascript_enabled: z.boolean().optional(),
  go_to_options: PuppeteerGoToOptionsSchema.optional(),
  add_script_tags: PuppeteerAddScriptTagsSchema.optional(),
  add_style_tags: PuppeteerAddStyleTagsSchema.optional(),
  wait_for_timeout: z.number().optional(),
  wait_for_function: PuppeteerWaitForFunctionSchema.optional(),
  wait_for_selector: PuppeteerWaitForSelectorOptionsSchema.optional(),
  wait_for_event: PuppeteerWaitForEventSchema.optional(),
});

const scrape = async (elements: IElementsSelector) => {
  const wait = async (selector: string, timeout = DEFAULT_PAGE_TIMEOUT) => {
    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        clearTimeout(timeoutId);
        clearInterval(intervalId);
        return reject(new Error(`Timeout of ${timeout}ms exceeded for selector: ${selector}`));
      }, timeout);
      const intervalId = setInterval(() => {
        const elements = document.querySelectorAll(selector);
        if (elements.length) {
          clearTimeout(timeoutId);
          clearInterval(intervalId);
          return resolve();
        }
      }, 100);
    });
  };

  await Promise.all(
    elements.map(async ({ selector, timeout }) => {
      await wait(selector, timeout);
    })
  );

  return elements.map(({ selector }) => {
    const $els = Array.from<HTMLElement>(document.querySelectorAll(selector));

    const results = $els.map(($el) => {
      const attributes = Array.from($el.attributes).map((attr) => ({
        name: attr.name,
        value: attr.value,
      }));
      const rect = $el.getBoundingClientRect();

      return {
        attributes,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: $el.offsetWidth,
        height: $el.offsetHeight,
        text: $el.innerText,
        html: $el.innerHTML,
      };
    });

    return {
      selector,
      results,
    };
  });
};

export class ScrapePostRoute extends ProxyHttpRoute {
  method = Method.POST;
  path = '/scrape';
  swagger = {
    tags: [OPENAPI_TAGS.REST_APIS],
    summary: this.path,
    description: dedent`
      A JSON-based API that returns text, html, and meta-data from a given list of selectors.
      
      Debugging information is available by sending in the appropriate flags in the "debugOpts" property. Responds with an array of JSON objects.
    `,
    request: {
      query: RequestDefaultQuerySchema,
      body: {
        description: 'The performance data',
        content: {
          'application/json': {
            schema: RequestScrapeBodySchema.meta({
              example: {
                url: 'https://example.com',
                elements: [
                  {
                    selector: 'h1',
                  },
                  {
                    selector: 'h2',
                    timeout: 5000,
                  },
                ],
              },
            }),
          },
        },
      },
    },
    responses: {},
  };
  handler?: Handler = async (req, res) => {
    const { browserManager } = this.context;

    const query = parseSearchParams(req.query);

    const queryValidation = useTypedParsers(RequestDefaultQueryWithTokenSchema).safeParse(query);

    if (!queryValidation.success) {
      return writeResponse(res, HttpStatus.BAD_REQUEST, {
        body: queryValidation.error.issues,
      });
    }

    const bodyValidation = useTypedParsers(RequestScrapeBodySchema).safeParse(req.body);

    if (!bodyValidation.success) {
      return writeResponse(res, HttpStatus.BAD_REQUEST, {
        body: bodyValidation.error.issues,
      });
    }

    const {
      url,
      html,
      elements,
      debug_options: debugOptions,
      authenticate,
      cookies,
      emulate_media_type: emulateMediaType,
      user_agent: userAgent,
      viewport,
      block_urls: blockUrls,
      request_interception: requestInterception,
      set_extra_http_headers: setExtraHTTPHeaders,
      set_javascript_enabled: setJavascriptEnabled,
      go_to_options: goToOptions = {},
      add_script_tags: addScriptTags,
      add_style_tags: addStyleTags,
      wait_for_timeout: waitForTimeout,
      wait_for_function: waitForFunction,
      wait_for_selector: waitForSelector,
      wait_for_event: waitForEvent,
    } = bodyValidation.data;

    const browser = await browserManager.requestBrowser(req, queryValidation.data);

    const page = await browser.newPage();

    const messages: string[] = [];
    const outbound: IBoundRequest[] = [];
    const inbound: IBoundRequest[] = [];

    if (debugOptions?.console) {
      page.on('console', (msg) => {
        messages.push(msg.text());
      });
    }

    if (debugOptions?.network) {
      await page.setRequestInterception(true);

      page.on('request', (request) => {
        outbound.push({
          url: request.url(),
          method: request.method(),
          headers: request.headers(),
        });

        request.continue();
      });

      page.on('response', (response) => {
        inbound.push({
          url: response.url(),
          method: response.request().method(),
          headers: response.headers(),
        });
      });
    }

    const cdp = await page.createCDPSession();

    if (authenticate) {
      await page.authenticate(authenticate);
    }

    if (Array.isArray(cookies) && cookies.length) {
      const parsedCookies = cookies.map((cookie) => transformKeysToCamelCase<CookieParam>(cookie));
      page.setCookie(...parsedCookies);
    }

    if (emulateMediaType) {
      await page.emulateMediaType(emulateMediaType);
    }

    if (userAgent) {
      await page.setUserAgent(userAgent);
    }

    if (viewport) {
      const parsedViewport = transformKeysToCamelCase<Viewport>(viewport);
      await page.setViewport(parsedViewport);
    }

    if (Array.isArray(blockUrls) && blockUrls.length) {
      await cdp.send('Network.setBlockedURLs', {
        urls: blockUrls,
      });
    }

    if (
      requestInterception &&
      Array.isArray(requestInterception.patterns) &&
      requestInterception.patterns.length
    ) {
      const parsedRequestInterception =
        transformKeysToCamelCase<Protocol.Network.SetRequestInterceptionRequest>(
          requestInterception
        );
      await cdp.send('Network.setRequestInterception', parsedRequestInterception);
    }

    if (setExtraHTTPHeaders) {
      await page.setExtraHTTPHeaders(setExtraHTTPHeaders);
    }

    if (typeof setJavascriptEnabled === 'boolean') {
      await page.setJavaScriptEnabled(setJavascriptEnabled);
    }

    const parsedGoToOptions = transformKeysToCamelCase<GoToOptions | WaitForOptions>(goToOptions);

    const performGoTo = url ? page.goto.bind(page) : page.setContent.bind(page);

    const content = url || html;

    if (!content) {
      const error = new Error('Either "url" or "html" must be provided');
      return writeResponse(res, HttpStatus.BAD_REQUEST, {
        body: error,
      });
    }

    const pageResponse = await performGoTo(content, parsedGoToOptions);

    if (Array.isArray(addScriptTags) && addScriptTags.length) {
      for (const script of addScriptTags) {
        await page.addScriptTag(script);
      }
    }

    if (Array.isArray(addStyleTags) && addStyleTags.length) {
      for (const style of addStyleTags) {
        await page.addStyleTag(style);
      }
    }

    if (waitForTimeout) {
      await sleep(waitForTimeout);
    }

    if (waitForFunction) {
      const { page_function: pageFunction, ...waitForFunctionOptions } = waitForFunction;
      await page.waitForFunction(pageFunction, waitForFunctionOptions);
    }

    if (waitForSelector) {
      const { selector, ...waitForSelectorOptions } = waitForSelector;
      const parsedWaitForSelector =
        transformKeysToCamelCase<WaitForOptions>(waitForSelectorOptions);
      await page.waitForSelector(selector, parsedWaitForSelector);
    }

    if (waitForEvent) {
      const { event_name: eventName, timeout } = waitForEvent;
      await page.waitForEvent(eventName, timeout);
    }

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

    const scrapeResult = await page.evaluate(scrape, elements);

    let debugCookies: Protocol.Network.Cookie[] | null = null;
    if (debugOptions?.cookies) {
      const cdpResult = await cdp.send('Network.getAllCookies');
      debugCookies = cdpResult?.cookies as Protocol.Network.Cookie[];
    }

    let debugHtml: string | null = null;
    if (debugOptions?.html) {
      debugHtml = await page.content();
    }

    let debugScreenshot: string | null = null;
    if (debugOptions?.screenshot) {
      debugScreenshot = await page.screenshot({
        encoding: 'base64',
        quality: 20,
        type: 'jpeg',
        fullPage: true,
      });
    }

    const debugResult = {
      messages,
      network: {
        outbound,
        inbound,
      },
      cookies: debugCookies,
      html: debugHtml,
      screenshot: debugScreenshot,
    };

    await browserManager.complete(browser);

    return writeResponse(res, HttpStatus.OK, {
      body: {
        data: {
          scrape_result: scrapeResult,
          debug_result: debugResult,
        },
      },
    });
  };
}
