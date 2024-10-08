import { OpenAPIRegistry, OpenApiGeneratorV31, RouteConfig } from '@asteasolutions/zod-to-openapi';
import fs from 'node:fs';

import { Method, Group } from '@/router';
import { OPENAPI_VERSION } from '@/constants';
import { getFullPath } from './utils';

export class OpenAPI {
  private registry = new OpenAPIRegistry();

  constructor(private groups: Group[]) {}

  generateDocument(config: {
    title: string;
    version: string;
    jsonFileName: string;
    description?: string;
    servers?: { url: string; description?: string }[];
  }) {
    this.groups.forEach((groupRouter) => {
      groupRouter.getRoutes().forEach((route) => {
        const { path, swagger } = route;

        let method: Method = Method.GET;
        if ('method' in route) {
          method = route.method;
        }

        if (!swagger) return;

        const fullPath = getFullPath(path, groupRouter.prefix);

        const swaggerRouteConfig = {
          ...swagger,
          method,
          path: fullPath,
        };

        if (swaggerRouteConfig.summary === path) {
          swaggerRouteConfig.summary = fullPath;
        }

        if (method !== Method.ALL) {
          this.registry.registerPath(swaggerRouteConfig as RouteConfig);
        } else {
          const methods = Object.values(Method).filter((m) => m !== Method.ALL);

          methods.forEach((m) => {
            this.registry.registerPath({
              ...swaggerRouteConfig,
              method: m,
            } as RouteConfig);
          });
        }
      });
    });

    const generator = new OpenApiGeneratorV31(this.registry.definitions);

    const docs = generator.generateDocument({
      openapi: OPENAPI_VERSION,
      info: {
        title: config.title,
        version: config.version,
        description: config.description,
      },
      servers: config.servers,
    });
    fs.writeFileSync(config.jsonFileName, JSON.stringify(docs, null, 2));
  }
}
