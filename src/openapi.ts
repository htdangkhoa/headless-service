import { OpenAPIRegistry, OpenApiGeneratorV3, RouteConfig } from '@asteasolutions/zod-to-openapi';
import fs from 'node:fs';

import { Method, RouteGroup } from '@/route-group';
import { OPENAPI_VERSION } from '@/constants';
import { getFullPath } from './utils';

export class OpenAPI {
  private registry = new OpenAPIRegistry();

  constructor(private groups: RouteGroup[]) {}

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

        this.registry.registerPath(swaggerRouteConfig as RouteConfig);
      });
    });

    const generator = new OpenApiGeneratorV3(this.registry.definitions);

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
