import * as ZodToOpenapi from '@asteasolutions/zod-to-openapi';
import * as http from 'node:http';

export interface CodeSample {
  lang: string;
  label: string;
  source: string;
}

export interface RouteConfig extends Omit<ZodToOpenapi.RouteConfig, 'method' | 'path'> {
  'x-codeSamples'?: CodeSample[];
}

export interface OpenApiRoute<H> {
  path: string;
  auth: boolean;
  handler?: H;
  swagger?: RouteConfig;
}
