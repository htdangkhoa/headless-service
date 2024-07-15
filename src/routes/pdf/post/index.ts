import type { Handler, Request, Response } from 'express';
import { z } from 'zod';
import zu from 'zod_utilz';
import type {
  Viewport,
  CookieParam,
  GoToOptions,
  WaitForOptions,
  PDFOptions,
} from 'puppeteer-core';
import type { Protocol } from 'devtools-protocol';

import { HttpStatus, OPENAPI_TAGS } from '@/constants';
import { ApiRoute, Method } from '@/route-group';
import { parseSearchParams, sleep, transformKeysToCamelCase, writeResponse } from '@/utils';
import {
  PuppeteerAddScriptTagsSchema,
  PuppeteerAddStyleTagsSchema,
  PuppeteerCookiesSchema,
  PuppeteerCredentialsSchema,
  PuppeteerEmulateMediaTypeSchema,
  PuppeteerGoToOptionsSchema,
  PuppeteerHtmlSchema,
  PuppeteerRequestInterceptionSchema,
  PuppeteerPDFOptionsSchema,
  PuppeteerSelectorSchema,
  PuppeteerUrlSchema,
  PuppeteerUserAgentSchema,
  PuppeteerViewportSchema,
  PuppeteerWaitForSelectorOptionsSchema,
  RequestDefaultQuerySchema,
} from '@/schemas';
import { PuppeteerProvider } from '@/puppeteer-provider';

const RequestScreenshotBodySchema = z.object({
  url: PuppeteerUrlSchema.optional(),
  html: PuppeteerHtmlSchema.optional(),
  options: PuppeteerPDFOptionsSchema.optional(),
  authenticate: PuppeteerCredentialsSchema.optional(),
  cookies: PuppeteerCookiesSchema.optional(),
  emulate_media_type: PuppeteerEmulateMediaTypeSchema.optional(),
  user_agent: PuppeteerUserAgentSchema.optional(),
  viewport: PuppeteerViewportSchema.optional(),
  block_urls: z.array(z.string()).optional(),
  request_interception: PuppeteerRequestInterceptionSchema.optional(),
  set_extra_http_headers: z.record(z.string()).optional(),
  set_javascript_enabled: z.boolean().optional(),
  go_to_options: PuppeteerGoToOptionsSchema.optional(),
  add_script_tags: PuppeteerAddScriptTagsSchema.optional(),
  add_style_tags: PuppeteerAddStyleTagsSchema.optional(),
  wait_for_selector: PuppeteerWaitForSelectorOptionsSchema.optional(),
  wait_for_timeout: z.number().optional(),
});

export class PdfPostRoute implements ApiRoute {
  method = Method.POST;
  path = '/pdf';
  swagger = {
    tags: [OPENAPI_TAGS.REST_APIS],
    summary: this.path,
    description:
      'A JSON-based API for getting a PDF binary from either a supplied "url" or "html" payload in your request. Many options exist for injecting cookies, request interceptors, user-agents and waiting for selectors, timers and more.',
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
      options: pdfOptions = {},
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
      wait_for_selector: waitForSelector,
      wait_for_timeout: waitForTimeout,
    } = bodyValidation.data;

    const puppeteerProvider = req.app.get('puppeteerProvider') as PuppeteerProvider;

    const browser = await puppeteerProvider.launchBrowser(req, queryValidation.data);

    const page = await browser.newPage();

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

    if (waitForSelector) {
      const { selector, ...waitForSelectorOptions } = waitForSelector;
      const parsedWaitForSelector =
        transformKeysToCamelCase<WaitForOptions>(waitForSelectorOptions);
      await page.waitForSelector(selector, parsedWaitForSelector);
    }

    if (waitForTimeout) {
      await sleep(waitForTimeout);
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

    const parsedPDFOptions = transformKeysToCamelCase<PDFOptions>(pdfOptions);

    const pdf = await page.pdf(parsedPDFOptions);

    await puppeteerProvider.complete(browser);

    return res.setHeader('Content-Type', 'application/pdf').status(HttpStatus.OK).send(pdf);
  };
}
