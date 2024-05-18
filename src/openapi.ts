import { OpenAPIRegistry, OpenApiGeneratorV3, RouteConfig } from '@asteasolutions/zod-to-openapi';
import fs from 'node:fs';

import { RouteGroup } from '@/route-group';
import { OPENAPI_VERSION } from '@/constants';

export class OpenAPI {
  private registry = new OpenAPIRegistry();

  constructor(private groups: RouteGroup[]) {}

  generateDocument(config: {
    title: string;
    version: string;
    jsonFileName: string;
    description?: string;
    servers?: { url: string }[];
  }) {
    this.groups.forEach((groupRouter) => {
      groupRouter.getRoutes().forEach(({ path, method, swagger }) => {
        if (!swagger) return;

        const fullPath = [groupRouter.prefix, path].filter(Boolean).join('');

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
